// bun run decal-sheet <in.png> <out.webp> [--grid 4] [--size 1024] [--fuzz 28]
// Keys a magenta-backed decal sheet into an alpha WebP (pink-free edges) and writes /tmp/<name>-check.png on a dark ground with the grid drawn.
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { parseArgs } from 'node:util'

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		grid: { type: 'string', default: '4' },
		size: { type: 'string', default: '1024' },
		fuzz: { type: 'string', default: '28' },
	},
})
const [input, output] = positionals
if (!input || !output?.endsWith('.webp')) {
	console.error(
		'usage: bun run decal-sheet <in.png> <out.webp> [--grid 4] [--size 1024] [--fuzz 28]',
	)
	process.exit(1)
}
const size = Number(values.size)
const grid = Number(values.grid)
const fuzz = `${values.fuzz}%`
// The check image goes to /tmp: next to the output it would land in public/ and deploy.
const check = join(tmpdir(), basename(output).replace(/\.webp$/, '-check.png'))

function magick(...args) {
	const p = Bun.spawnSync(['magick', ...args], { stdout: 'pipe', stderr: 'pipe' })
	if (p.exitCode !== 0) {
		console.error(p.stderr.toString().trim())
		process.exit(1)
	}
}

// Mask: magenta to black, the rest white, eroded a pixel and softened. Colour: magenta to grey,
// so soft edges fade to neutral rather than pink.
magick(
	input,
	'-resize',
	`${size}x${size}!`,
	'(',
	'+clone',
	'-fuzz',
	fuzz,
	'-fill',
	'black',
	'-opaque',
	'#ff00ff',
	'-fill',
	'white',
	'+opaque',
	'black',
	'-morphology',
	'Erode',
	'Disk:1.5',
	'-blur',
	'0x0.8',
	'-level',
	'40%,100%',
	')',
	'(',
	'-clone',
	'0',
	'-fuzz',
	fuzz,
	'-fill',
	'#808080',
	'-opaque',
	'#ff00ff',
	')',
	'-delete',
	'0',
	'+swap',
	'-alpha',
	'off',
	'-compose',
	'CopyOpacity',
	'-composite',
	'-define',
	'webp:alpha-quality=100',
	'-quality',
	'90',
	output,
)

const half = size / 2
const step = half / grid
const lines = Array.from({ length: grid - 1 }, (_, i) => Math.round((i + 1) * step))
	.flatMap((at) => [`line ${at},0 ${at},${half}`, `line 0,${at} ${half},${at}`])
	.join(' ')
magick(
	output,
	'-resize',
	`${half}x${half}`,
	'-background',
	'#3a3a44',
	'-flatten',
	...(lines ? ['-stroke', '#ffffff40', '-draw', lines] : []),
	check,
)
console.log(output)
console.log(check)
