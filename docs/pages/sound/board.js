// The sound board, laid out like Finder: folders (sources and board tools) on the left, the sounds in a folder with
// their numbers in the middle, the selected sound's swap, Keep and bus on the right. Plays every use in the sound
// table through the game's own audio and mix, swaps files or other voices into a use (src/core/sound-swap.js) so
// the game in another tab hears them, keeps a swap into the repo, and checks numbers against docs/sound.md.
import * as audio from '/src/core/audio.js'
import * as swap from '/src/core/sound-swap.js'
import { tune } from '/src/core/tune.js'
import { createSounds, playOwn, playUse } from '/src/plugins/moba/sounds.js'
import { uses, facts } from '/src/plugins/moba/sound-table.js'
import { check, describe, measure } from './numbers.js'

const sounds = createSounds(audio)
const voices = swap.voiceNames().filter((name) => !['tick', 'tickPerfect'].includes(name))
const $ = (id) => document.getElementById(id)
function el(tag, props = {}, ...children) {
	const node = Object.assign(document.createElement(tag), props)
	node.append(...children)
	return node
}
const button = (text, onClick, props = {}) => {
	const b = el('button', { type: 'button', textContent: text, ...props })
	b.addEventListener('click', onClick)
	return b
}

audio.previewMusic(null) // the board stays quiet until a music row is played
let musicStop = 0
function previewMusic(scene, seconds = 0) {
	clearTimeout(musicStop)
	audio.previewMusic(scene)
	if (seconds) musicStop = setTimeout(() => audio.previewMusic(null), seconds * 1000)
}

const play = (id) => (uses[id].music ? previewMusic(uses[id].music) : playUse(audio, id))
// The game's own sound for a use, past any swap or kept file.
function playBuiltin(id) {
	const use = uses[id]
	if (use.music) return previewMusic(use.music)
	if (use.voice) swap.voiceNamed(use.voice)?.(null, 1)
	else if (use.recipe) audio.blip(use.recipe())
	else use.play?.(audio, null, 1)
}
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const local = (id) => swap.swapList().find(([key]) => key === id)?.[1]
function playing(id) {
	const s = swap.swapOf(id)
	if (s?.kept) return `kept ${s.kept}`
	if (s?.file) return `file ${s.file}`
	if (s?.voice) return s.voice
	return uses[id].music ? 'synth music' : `built in (${uses[id].voice ?? 'synth'})`
}
const busName = {
	ui: 'menus',
	mine: 'your hero',
	others: 'other heroes',
	world: 'world',
	music: 'music',
}
const busOf = (id) =>
	uses[id].bus === 'hero' ? 'your hero or other heroes' : busName[uses[id].bus]
const factsOf = (id) =>
	Object.entries(facts)
		.filter(([, list]) => list.includes(id))
		.map(([type]) => type)

// Numbers for what a use plays now (swap, kept or built in), rendered offline.
const numbers = new Map()
async function measureUse(id) {
	const chosen = swap.swapOf(id)
	const url = chosen?.kept ? swap.keptUrl(chosen.kept) : chosen?.file && swap.fileUrl(chosen.file)
	const buffer = await audio.render(() => playUse(audio, id), { warm: url ? [url] : [] })
	numbers.set(id, measure(buffer))
}
async function measureAll(ids = Object.keys(uses).filter((id) => !uses[id].music)) {
	for (const id of ids) await measureUse(id).catch(() => numbers.set(id, null))
	draw()
}
const rows = () => [...numbers].map(([id, n]) => ({ id, source: uses[id].source, numbers: n }))
// The headless check (`bun run sound:check`) reads every use's numbers and flags here.
globalThis.soundNumbers = async () => {
	await swap.loaded
	await measureAll()
	return { rows: rows(), flags: check(rows()) }
}

// Folders: sources grouped like the game, then the board's own tools.
const sources = [...new Set(Object.values(uses).map((u) => u.source))]
const match = ['Ball', 'Structures', 'Minions', 'Combat', 'Outs', 'Movement', 'Progress']
const screens = ['Menus', 'Splash and descent', 'Lobby', 'Music']
const GROUPS = [
	['Heroes', sources.filter((s) => !match.includes(s) && !screens.includes(s))],
	['Match', match.filter((s) => sources.includes(s))],
	['Screens and music', screens],
	['Board', ['Rule check', 'Mix', 'Your files', 'Changes', 'Silent facts']],
]
const TOOLS = GROUPS.at(-1)[1]
const where = () => {
	const q = new URLSearchParams(location.hash.slice(1))
	return { folder: q.get('f') ?? GROUPS[0][1][0], use: q.get('u') }
}
const link = (folder, use) => `#${new URLSearchParams(use ? { f: folder, u: use } : { f: folder })}`
const idsIn = (folder) => Object.keys(uses).filter((id) => uses[id].source === folder)

function drawFolders() {
	const { folder } = where()
	const flags = check(rows())
	const count = (name) =>
		name === 'Rule check'
			? ` (${Object.keys(flags).length})`
			: name === 'Your files'
				? ` (${swap.fileNames().length})`
				: TOOLS.includes(name)
					? ''
					: ` (${idsIn(name).length})`
	$('folders').replaceChildren(
		...GROUPS.map(([group, names]) =>
			el(
				'details',
				{ open: true },
				el('summary', { textContent: group }),
				el(
					'ul',
					{},
					...names.map((name) =>
						el(
							'li',
							{},
							el('a', {
								href: link(name),
								textContent: name + count(name),
								ariaCurrent: name === folder ? 'page' : null,
							}),
						),
					),
				),
			),
		),
	)
}

// The middle pane: a folder's sounds with their numbers, or a board tool.
function drawList() {
	const { folder, use: selected } = where()
	const list = $('list')
	if (TOOLS.includes(folder))
		return list.replaceChildren(el('h2', { textContent: folder }), ...tool(folder))
	const flags = check(rows())
	const head = ['', 'Sound', 'When', 'Plays', 'ms', 'attack', 'tail', 'peak', 'rms', 'kHz', 'rules']
	const cell = (n, key) => el('td', { textContent: n ? n[key] : '' })
	list.replaceChildren(
		el('h2', { textContent: folder }),
		el(
			'table',
			{},
			el('thead', {}, el('tr', {}, ...head.map((t) => el('th', { textContent: t })))),
			el(
				'tbody',
				{},
				...idsIn(folder).map((id) => {
					const n = numbers.get(id)
					const name = el('a', { href: link(folder, id) }, el('code', { textContent: id }))
					if (id === selected) name.ariaCurrent = 'true'
					return el(
						'tr',
						{},
						el(
							'td',
							{},
							button('▶', () => play(id), { ariaLabel: `Play ${id}` }),
						),
						el('td', {}, id === selected ? el('strong', {}, name) : name),
						el('td', { textContent: uses[id].about }),
						el('td', { textContent: playing(id) }),
						cell(n, 'length'),
						cell(n, 'attack'),
						cell(n, 'tail'),
						cell(n, 'peak'),
						cell(n, 'rms'),
						el('td', { textContent: n ? (n.centroid / 1000).toFixed(1) : '' }),
						el('td', {
							textContent: flags[id] ? `⚑ ${flags[id].map((f) => f.split(' ')[0]).join(', ')}` : '',
						}),
					)
				}),
			),
		),
		numbers.size ? '' : el('p', {}, el('small', { textContent: 'Measuring every sound…' })),
	)
}

// The right pane: one sound's swap, level, Keep, bus, numbers and the facts that set it off. Built once per
// selection and updated in place, so arrowing through the candidate list keeps its focus.
let detail = null
function drawDetails() {
	const { use: id } = where()
	if (!id || !uses[id]) {
		detail = null
		return $('details').replaceChildren(
			el('p', { textContent: 'Pick a sound to swap or keep it.' }),
		)
	}
	if (detail?.id !== id) detail = buildDetail(id)
	updateDetail()
}
function buildDetail(id) {
	const use = uses[id]
	const parts = { id, plays: el('span'), numbers: el('p'), files: '' }
	const rest = [
		el('p', { textContent: use.about }),
		el(
			'dl',
			{},
			el('dt', { textContent: 'Plays now' }),
			el('dd', {}, parts.plays),
			el('dt', { textContent: 'Bus' }),
			el('dd', { textContent: busOf(id) }),
			el('dt', { textContent: 'Set off by' }),
			el('dd', { textContent: factsOf(id).join(', ') || 'the screen itself' }),
		),
		parts.numbers,
	]
	if (use.music) {
		$('details').replaceChildren(
			el('h2', {}, el('code', { textContent: id })),
			...rest,
			el(
				'p',
				{},
				button('Play', () => play(id)),
				' ',
				button('Stop', () => previewMusic(null)),
			),
		)
		return parts
	}
	parts.select = el('select', { ariaLabel: `Sound for ${id}` })
	parts.level = el('input', {
		type: 'range',
		min: 0.05,
		max: 1.5,
		step: 0.05,
		ariaLabel: `Level for ${id}`,
	})
	parts.keep = button('Keep', () => keepSwap(id))
	parts.select.addEventListener('change', async () => {
		const [kind, name] = parts.select.value.split(':')
		const next =
			kind === 'file'
				? { file: name, gain: Number(parts.level.value) }
				: kind === 'voice'
					? { voice: name }
					: kind === 'builtin' && swap.kept[id]
						? { builtin: true }
						: null
		await swap.setSwap(id, next)
		play(id)
		measureUse(id).then(draw)
	})
	parts.level.addEventListener('change', async () => {
		const chosen = swap.swapOf(id)
		if (!chosen?.file && !chosen?.kept) return
		await swap.setSwap(id, { ...chosen, gain: Number(parts.level.value) })
		play(id)
		measureUse(id).then(draw)
	})
	$('details').replaceChildren(
		el('h2', {}, el('code', { textContent: id })),
		...rest,
		el('p', {}, el('label', {}, 'Sound ', parts.select)),
		el('p', {}, el('label', {}, 'File level ', parts.level)),
		el('p', { textContent: 'Arrow keys through the list play each candidate.' }),
		el(
			'p',
			{},
			button('Play', () => play(id)),
			' ',
			button('Built in', () => playBuiltin(id)),
			' ',
			parts.keep,
		),
	)
	return parts
}
function updateDetail() {
	const { id } = detail
	const flags = check(rows())[id]
	detail.plays.textContent = playing(id)
	detail.numbers.textContent = numbers.has(id)
		? describe(numbers.get(id)) + (flags ? ` ⚑ ${flags.join('; ')}` : '')
		: ''
	if (!detail.select) return
	const files = swap.fileNames()
	const kept = swap.kept[id]
	const mine = local(id)
	const key = JSON.stringify([files, kept])
	if (detail.files !== key) {
		detail.files = key
		const options = [
			el('option', { value: 'builtin', textContent: `Built in: ${uses[id].voice ?? 'synth'}` }),
		]
		if (kept)
			options.push(el('option', { value: 'kept', textContent: `Kept: ${kept.kept ?? kept.voice}` }))
		if (files.length)
			options.push(
				el(
					'optgroup',
					{ label: 'Your files' },
					...files.map((f) => el('option', { value: `file:${f}`, textContent: f })),
				),
			)
		options.push(
			el(
				'optgroup',
				{ label: 'Other game sounds' },
				...voices.map((v) => el('option', { value: `voice:${v}`, textContent: v })),
			),
		)
		detail.select.replaceChildren(...options)
	}
	if (document.activeElement !== detail.select)
		detail.select.value =
			mine && !same(mine, kept)
				? mine.file
					? `file:${mine.file}`
					: mine.voice
						? `voice:${mine.voice}`
						: 'builtin'
				: kept
					? 'kept'
					: 'builtin'
	const chosen = swap.swapOf(id)
	detail.level.value = chosen?.gain ?? 0.5
	detail.level.disabled = !chosen?.file && !chosen?.kept
	detail.keep.disabled = !mine || same(mine, kept) || (mine.builtin && !kept)
}

// Keep writes the swap into the repo (vite.config.js `soundKeep`); this browser mirrors it until a reload.
async function keepSwap(id) {
	const chosen = local(id)
	const q = new URLSearchParams({ use: id })
	let body = null
	if (chosen?.file) {
		q.set('name', chosen.file)
		q.set('gain', chosen.gain ?? 0.5)
		body = swap.fileBlob(chosen.file)
	} else if (chosen?.voice) q.set('voice', chosen.voice)
	else if (chosen?.kept) {
		q.set('name', chosen.kept)
		q.set('gain', chosen.gain ?? 0.5)
		body = await (await fetch(swap.keptUrl(chosen.kept))).blob()
	}
	const response = await fetch(`/__sound/keep?${q}`, { method: 'POST', body })
	if (!response.ok) return alert(`Keep failed: ${response.status}. Is this the dev server?`)
	const now = await response.json()
	if (now) swap.kept[id] = now
	else delete swap.kept[id]
	await swap.setSwap(id, now ?? { builtin: true })
}

// Board tools, drawn in the middle pane.
function tool(name) {
	if (name === 'Rule check') {
		const flags = Object.entries(check(rows()))
		return [
			el('p', {
				textContent:
					'Sounds breaking docs/sound.md: the peak lands within 25 ms, fight tails end within 400 ms, menus stay under −18 dB, and each fight source keeps one timbre family (brightness within 1.5 octaves of its middle).',
			}),
			el(
				'ul',
				{},
				...(flags.length
					? flags.map(([id, list]) =>
							el(
								'li',
								{},
								el('a', { href: link(uses[id].source, id) }, el('code', { textContent: id })),
								` ${list.join('; ')}`,
							),
						)
					: [el('li', { textContent: numbers.size ? 'Every sound passes.' : 'Measuring…' })]),
			),
		]
	}
	if (name === 'Mix') return mixTool()
	if (name === 'Your files') return filesTool()
	if (name === 'Changes') return changesTool()
	return [
		el('p', { textContent: 'Things the game says happened that make no sound yet.' }),
		el(
			'ul',
			{},
			...Object.entries(facts)
				.filter(([, list]) => !list.length)
				.map(([type]) => el('li', {}, el('code', { textContent: type }))),
		),
	]
}

// The mix (tune.mix). Moving a level plays a sound on that bus (throttled while dragging); caps and the duck play
// the crowded fight, the duck over music.
const MIX = [
	...['ui', 'mine', 'others', 'world', 'music'].map((name) => [
		name,
		`${busName[name]} level`,
		0,
		1.5,
		0.05,
	]),
	...['ui', 'mine', 'others', 'world'].map((name) => [
		`caps.${name}`,
		`${busName[name]} cap`,
		1,
		16,
		1,
	]),
	['capWindow', 'cap window (s)', 0.05, 0.5, 0.05],
	['duck', 'music under a fight', 0, 1, 0.05],
	['duckRelease', 'music comes back over (s)', 0.1, 2, 0.1],
]
const SAMPLE = {
	ui: () => playUse(audio, 'ui.click'),
	mine: () => playOwn(audio, 'basic.shot'),
	others: () => playUse(audio, 'loose.hit', { x: 4, y: 1, z: 0 }, 0.45),
	world: () => playUse(audio, 'ballBounce', { x: -3, y: 1, z: 2 }),
	music: () => previewMusic('play', 4),
}
const mixValue = (key) => {
	const [head, tail] = key.split('.')
	const mine = swap.mixOf()
	return tail ? (mine.caps?.[tail] ?? tune.mix.caps[tail]) : (mine[head] ?? tune.mix[head])
}
async function setMixValue(key, value) {
	const [head, tail] = key.split('.')
	const mine = swap.mixOf()
	await swap.setMix(
		tail
			? { ...mine, caps: { ...tune.mix.caps, ...mine.caps, [tail]: value } }
			: { ...mine, [head]: value },
	)
}
function mixTool() {
	const body = MIX.map(([key, label, min, max, step]) => {
		const input = el('input', {
			type: 'range',
			min,
			max,
			step,
			value: mixValue(key),
			ariaLabel: label,
		})
		const shown = el('output', { textContent: mixValue(key) })
		const hear = async () => {
			await setMixValue(key, Number(input.value))
			if (SAMPLE[key]) SAMPLE[key]()
			else {
				if (key.startsWith('duck')) previewMusic('play', 4)
				fight()
			}
		}
		let last = 0
		input.addEventListener('input', () => {
			shown.textContent = input.value
			if (!SAMPLE[key] || performance.now() - last < 250) return
			last = performance.now()
			hear()
		})
		input.addEventListener('change', hear)
		return el('tr', {}, el('th', { textContent: label }), el('td', {}, input), el('td', {}, shown))
	})
	return [
		el('p', {
			textContent:
				'Every sound plays on one bus. Each has a level and plays at most its cap of sounds in any cap window; fight sounds duck the music. Moving a slider plays a sound on that bus; the game in another tab follows at once.',
		}),
		el('table', {}, el('tbody', {}, ...body)),
		el(
			'p',
			{},
			button('Reset the mix', async () => {
				await swap.setMix(null)
				drawn = ''
				draw()
			}),
		),
	]
}

const fileNumbers = new Map()
function filesTool() {
	const pick = (props) => {
		const input = el('input', { type: 'file', multiple: true, ...props })
		input.addEventListener('change', async () => {
			await swap.addFiles(
				[...input.files].filter(
					(f) =>
						f.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac|aiff?|webm)$/i.test(f.name),
				),
			)
			input.value = ''
		})
		return input
	}
	const folder = pick({})
	folder.webkitdirectory = true
	const names = swap.fileNames()
	const items = names.map((name) =>
		el(
			'tr',
			{},
			el(
				'td',
				{},
				button('▶', () => audio.sample(swap.fileUrl(name), { gain: 0.5 }), {
					ariaLabel: `Play ${name}`,
				}),
			),
			el('td', { textContent: name }),
			el('td', { textContent: fileNumbers.has(name) ? describe(fileNumbers.get(name)) : '…' }),
			el(
				'td',
				{},
				button('Remove', () => swap.removeFile(name)),
			),
		),
	)
	measureFiles(names, items)
	return [
		el('p', {
			textContent: 'Your sounds, kept in this browser. Pick one in any sound’s list to swap it in.',
		}),
		el(
			'p',
			{},
			el('label', {}, 'Add files ', pick({ accept: 'audio/*' })),
			' ',
			el('label', {}, 'Add a folder ', folder),
		),
		el('table', {}, el('tbody', {}, ...items)),
	]
}
async function measureFiles(names, items) {
	for (const [i, name] of names.entries()) {
		if (fileNumbers.has(name)) continue
		try {
			const data = await swap.fileBlob(name).arrayBuffer()
			fileNumbers.set(
				name,
				measure(await new OfflineAudioContext(1, 1, 44100).decodeAudioData(data)),
			)
		} catch {
			fileNumbers.set(name, null)
		}
		items[i].children[2].textContent = describe(fileNumbers.get(name))
	}
}

function changesTool() {
	const mixed = MIX.map(([key]) => key).filter((key) => {
		const [head, tail] = key.split('.')
		return mixValue(key) !== (tail ? tune.mix.caps[tail] : tune.mix[head])
	})
	const lines = [
		...mixed.map((key) => `tune.mix.${key} → ${mixValue(key)} (this browser only)`),
		...Object.entries(swap.kept).map(
			([id, s]) =>
				`${id} → kept ${s.kept ? `${s.kept} at ${s.gain}` : s.voice} (in the repo, waiting for a commit)`,
		),
		...swap
			.swapList()
			.filter(([id, s]) => !same(s, swap.kept[id]) && !(s.builtin && !swap.kept[id]))
			.map(
				([id, s]) =>
					`${id} → ${s.file ? `file ${s.file} at ${s.gain ?? 0.5}` : (s.voice ?? 'built in')} (this browser only)`,
			),
	]
	return [
		el('p', { textContent: 'Your swaps, to paste back to the sound thread.' }),
		el('pre', {
			textContent: lines.length ? lines.join('\n') : 'No swaps: the game plays its own sounds.',
		}),
		el(
			'p',
			{},
			button('Undo every swap', async () => {
				for (const [id] of swap.swapList()) await swap.setSwap(id, null)
				measureAll()
			}),
		),
	]
}

// The crowded fight: a fixed, seeded burst through the game's mix (spatial pan and falloff, caps, once-per-tick
// dedupe), a third of it yours.
const FIGHT = [
	'loose.shot',
	'loose.hit',
	'toss.shot',
	'toss.hit',
	'gloveSlap.impact',
	'basic.shot',
	'basic.hit',
	'melee.hit',
	'ranged.shot',
	'ranged.hit',
	'wizard.shot',
	'tower.shot',
	'tower.hit',
	'blocked',
	'shielded',
	'out',
	'death',
	'ballBounce',
	'rain.impact',
	'vault.cast',
	'nearMiss.passed',
	'xp',
]
function fight() {
	let seed = 7
	const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
	audio.setAudioListener({ x: 0, z: 0 })
	const sounded = new Map()
	for (let i = 0; i < 20; i++) {
		const id = FIGHT[Math.floor(random() * FIGHT.length)]
		if (!uses[id]) continue
		const tick = Math.floor(random() * 90) // 1.5 s at 60 ticks a second
		const own = random() < 0.3
		const point = own
			? { x: 0, y: 1, z: 0 }
			: { x: (random() - 0.5) * 24, y: 1, z: (random() - 0.5) * 16 }
		const gain = own ? 1 : 0.45
		setTimeout(
			() => {
				const voice = sounds.voiceOf(id)
				if (sounded.get(voice) === tick) return
				sounded.set(voice, tick)
				;(own ? sounds.playOwn : sounds.play)(id, point, gain, 1)
			},
			(tick * 1000) / 60,
		)
	}
}
$('fight').addEventListener('click', fight)
$('stop').addEventListener('click', () => previewMusic(null))

// The mix pane redraws only on navigation, so a slider being dragged keeps its place.
let drawn = ''
function draw() {
	const { folder } = where()
	drawFolders()
	if (folder !== 'Mix' || drawn !== 'Mix') drawList()
	drawn = folder
	drawDetails()
}
addEventListener('hashchange', () => {
	drawn = ''
	draw()
})
swap.onSwapChange(draw)
draw()
swap.loaded.then(() => {
	draw()
	if (!location.search.includes('check')) measureAll()
})
