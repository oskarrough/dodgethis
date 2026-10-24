// bun scripts/art-prompt.js --kind tile|plate|frame|inlay|sheet --brief "…" --out pages/art/<slug> [--ref img …] [--generate]
// Builds an image prompt from docs/look.md (the style block) and docs/world.md (keywords, avoid list),
// writes <out>/prompt.md, and with --generate calls the images API (OPENAI_API_KEY, ART_MODEL).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { parseArgs } from 'node:util'

const root = join(import.meta.dir, '..')
const look = readFileSync(join(root, 'docs/look.md'), 'utf8')
const world = readFileSync(join(root, 'docs/world.md'), 'utf8')

const style = look.match(/^> (Moebius[^\n]+)/m)?.[1]
const avoid = world.match(/^## Prompting images[\s\S]*?^Avoid: ([^\n]+)/m)?.[1]
const keywords = (label) => world.match(new RegExp(`^\\*\\*${label}:\\*\\* ([^\\n]+)`, 'm'))?.[1]
if (!style || !avoid) throw new Error('art-prompt: the style block or avoid list moved; update the patterns')

const kinds = {
	frame: {
		words: ['Place', 'Light and colour', 'Line and form', 'Feeling'],
		frame:
			'Image 1 is a real screenshot at the match camera: keep its angle and its HUD unchanged. Simple stylised geometry, a lineless court, thin-lined scenery, thick-inked units, no busy texture.',
	},
	plate: {
		words: ['Place', 'Light and colour', 'Feeling'],
		frame:
			'A wide background plate for the surround of a floating stone isle: sea of cloud, distant mesas and haze, seen from above at a 58 degree pitch. No court, no units, no text. The middle stays calm so the court can sit on it.',
	},
	tile: {
		words: ['Place', 'Light and colour'],
		frame:
			'A seamless square ground texture seen straight down, orthographic, flat even light with no cast shadows, low contrast, big quiet shapes and little noise. It must tile without visible seams on all four edges. No objects, no perspective, no text.',
	},
	inlay: {
		words: ['Place', 'Light and colour', 'Line and form'],
		frame:
			'A single floor inlay for one arena, seen straight down, orthographic, centred on a square canvas: worn stone set into a stone court, flat even light, low contrast so units stay readable on top of it. No text.',
	},
	sheet: {
		words: ['Line and form', 'Feeling'],
		frame:
			'A character sheet on cream paper: the figure from above at the match camera, then front and side, one prop, materials named, small eyes under a brow, at least one hard angle. Thick navy ink, flat colour. No text.',
	},
}

const { values } = parseArgs({
	args: Bun.argv.slice(2).filter((a) => a !== '--'),
	options: {
		kind: { type: 'string', default: 'frame' },
		brief: { type: 'string' },
		out: { type: 'string' },
		ref: { type: 'string', multiple: true, default: [] },
		generate: { type: 'boolean', default: false },
		count: { type: 'string', default: '2' },
		size: { type: 'string', default: '1024x1024' },
	},
})
const kind = kinds[values.kind]
if (!kind || !values.brief || !values.out) {
	console.error(
		`usage: bun scripts/art-prompt.js --kind ${Object.keys(kinds).join('|')} --brief "…" --out pages/art/<slug> [--ref img] [--generate]`,
	)
	process.exit(1)
}

const prompt = [
	values.brief,
	kind.frame,
	`Style: ${style}`,
	...kind.words.map((label) => `${label}: ${keywords(label)}`),
	values.ref.length
		? `References: ${values.ref.map((r, i) => `image ${i + 1} (${basename(r)})`).join(', ')}. Take only their value, light and framing, never their ornament or colours.`
		: '',
	`Avoid: ${avoid}`,
]
	.filter(Boolean)
	.join('\n\n')

mkdirSync(values.out, { recursive: true })
writeFileSync(
	join(values.out, 'prompt.md'),
	`# ${values.kind}: ${values.brief}\n\n${values.ref.map((r) => `- ref: ${r}`).join('\n')}\n\n${prompt}\n`,
)
console.log(prompt)

if (values.generate) {
	const key = process.env.OPENAI_API_KEY
	const model = process.env.ART_MODEL
	if (!key || !model) {
		console.error('art-prompt: --generate needs OPENAI_API_KEY and ART_MODEL; the prompt is written.')
		process.exit(1)
	}
	const headers = { Authorization: `Bearer ${key}` }
	let response
	if (values.ref.length) {
		const form = new FormData()
		form.set('model', model)
		form.set('prompt', prompt)
		form.set('n', values.count)
		form.set('size', values.size)
		for (const ref of values.ref) form.append('image[]', Bun.file(ref), basename(ref))
		response = await fetch('https://api.openai.com/v1/images/edits', {
			method: 'POST',
			headers,
			body: form,
		})
	} else
		response = await fetch('https://api.openai.com/v1/images/generations', {
			method: 'POST',
			headers: { ...headers, 'Content-Type': 'application/json' },
			body: JSON.stringify({ model, prompt, n: Number(values.count), size: values.size }),
		})
	const body = await response.json()
	if (!response.ok) {
		console.error(`art-prompt: ${response.status} ${JSON.stringify(body.error ?? body)}`)
		process.exit(1)
	}
	body.data.forEach((image, i) => {
		const file = join(values.out, `${i + 1}.png`)
		writeFileSync(file, Buffer.from(image.b64_json, 'base64'))
		console.error(`wrote ${file}`)
	})
}
