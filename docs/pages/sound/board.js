// The sound board: plays every use in the sound table through the game's own audio, swaps files or other voices
// into a use (src/core/sound-swap.js) so a match in another tab hears them, keeps a swap into the repo, and prints
// each sound's numbers against the docs/sound.md rules.
import * as audio from '/src/core/audio.js'
import * as swap from '/src/core/sound-swap.js'
import { createSounds, playUse } from '/src/plugins/moba/sounds.js'
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
const button = (text, onClick) => {
	const b = el('button', { type: 'button', textContent: text })
	b.addEventListener('click', onClick)
	return b
}

audio.previewMusic(null) // the board stays quiet until a music row is played

const play = (id) => (uses[id].music ? audio.previewMusic(uses[id].music) : playUse(audio, id))
// The game's own sound for a use, past any swap or kept file.
function playBuiltin(id, a = audio) {
	const use = uses[id]
	if (use.voice) swap.voiceNamed(use.voice)?.(null, 1)
	else if (use.recipe) a.blip(use.recipe())
	else use.play?.(a, null, 1)
}
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const local = (id) => swap.swapList().find(([key]) => key === id)?.[1]

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
	fillNumbers()
}
const rows = () => [...numbers].map(([id, n]) => ({ id, source: uses[id].source, numbers: n }))
// The headless check (`bun run sound:check`) reads every use's numbers and flags here.
globalThis.soundNumbers = async () => {
	await swap.loaded
	await measureAll()
	return { rows: rows(), flags: check(rows()) }
}

// One row per use: what sets it off, the sound it plays, the file's level, its numbers, and play/built in/keep.
const cells = new Map()
function row(id) {
	const use = uses[id]
	if (use.music)
		return el(
			'tr',
			{},
			el('td', { textContent: use.about }),
			el('td', {}, el('code', { textContent: id })),
			el('td'),
			el('td'),
			el('td'),
			el(
				'td',
				{},
				button('Play', () => play(id)),
				' ',
				button('Stop', () => audio.previewMusic(null)),
			),
		)
	const select = el('select', { ariaLabel: `Sound for ${id}` })
	const level = el('input', {
		type: 'range',
		min: 0.05,
		max: 1.5,
		step: 0.05,
		ariaLabel: `Level for ${id}`,
	})
	const output = el('small')
	const keep = button('Keep', () => keepSwap(id))
	select.addEventListener('change', async () => {
		const [kind, name] = select.value.split(':')
		const next =
			kind === 'file'
				? { file: name, gain: Number(level.value) }
				: kind === 'voice'
					? { voice: name }
					: kind === 'builtin' && swap.kept[id]
						? { builtin: true }
						: null
		await swap.setSwap(id, next)
		play(id)
		measureUse(id).then(fillNumbers)
	})
	level.addEventListener('change', async () => {
		const chosen = swap.swapOf(id)
		if (!chosen?.file && !chosen?.kept) return
		await swap.setSwap(id, { ...chosen, gain: Number(level.value) })
		play(id)
		measureUse(id).then(fillNumbers)
	})
	cells.set(id, { select, level, output, keep })
	return el(
		'tr',
		{},
		el('td', { textContent: use.about }),
		el('td', {}, el('code', { textContent: id })),
		el('td', {}, select),
		el('td', {}, level),
		el('td', {}, output),
		el(
			'td',
			{},
			button('Play', () => play(id)),
			' ',
			button('Built in', () => playBuiltin(id)),
			' ',
			keep,
		),
	)
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

function fillSelects() {
	const files = swap.fileNames()
	for (const [id, { select, level, keep }] of cells) {
		const kept = swap.kept[id]
		const mine = local(id)
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
		select.replaceChildren(...options)
		select.value =
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
		level.value = chosen?.gain ?? 0.5
		level.disabled = !chosen?.file && !chosen?.kept
		keep.disabled = !mine || same(mine, kept) || (mine.builtin && !kept)
	}
}

function fillNumbers() {
	const flags = check(rows())
	for (const [id, { output }] of cells) {
		const n = numbers.get(id)
		output.textContent = numbers.has(id)
			? describe(n) + (flags[id] ? ` ⚑ ${flags[id].join('; ')}` : '')
			: '…'
	}
	const flagged = Object.entries(flags)
	$('flags').replaceChildren(
		...(flagged.length
			? flagged.map(([id, list]) =>
					el('li', {}, el('code', { textContent: id }), ` ${list.join('; ')}`),
				)
			: [el('li', { textContent: numbers.size ? 'Every sound passes.' : 'Measuring…' })]),
	)
}

const fileNumbers = new Map()
async function fillLibrary() {
	const names = swap.fileNames()
	const items = names.map((name) => {
		const text = el('small', {
			textContent: fileNumbers.has(name) ? describe(fileNumbers.get(name)) : '…',
		})
		return el(
			'li',
			{},
			button('Play', () => audio.sample(swap.fileUrl(name), { gain: 0.5 })),
			' ',
			button('Remove', () => swap.removeFile(name)),
			` ${name} `,
			text,
		)
	})
	$('library').replaceChildren(...items)
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
		items[i].lastChild.textContent = describe(fileNumbers.get(name))
	}
}

function fillChanges() {
	const lines = [
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
	$('changes').textContent = lines.length
		? lines.join('\n')
		: 'No swaps: the game plays its own sounds.'
}

const bySource = Map.groupBy(Object.keys(uses), (id) => uses[id].source)
for (const [source, ids] of bySource) {
	const head = el(
		'tr',
		{},
		...['When', 'Use', 'Sound', 'Level', 'Numbers', ''].map((t) => el('th', { textContent: t })),
	)
	$('sources').append(
		el(
			'section',
			{},
			el('h2', { textContent: source }),
			el('table', {}, el('thead', {}, head), el('tbody', {}, ...ids.map(row))),
		),
	)
}
$('silent').replaceChildren(
	...Object.entries(facts)
		.filter(([, list]) => !list.length)
		.map(([type]) => el('li', {}, el('code', { textContent: type }))),
)

for (const input of [$('files'), $('folder')])
	input.addEventListener('change', async () => {
		await swap.addFiles(
			[...input.files].filter(
				(f) => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac|aiff?|webm)$/i.test(f.name),
			),
		)
		input.value = ''
	})
$('reset').addEventListener('click', async () => {
	for (const [id] of swap.swapList()) await swap.setSwap(id, null)
	measureAll()
})

// The crowded fight: a fixed, seeded burst through the game's mix (spatial pan and falloff, once-per-tick dedupe).
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
$('fight').addEventListener('click', () => {
	let seed = 7
	const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
	audio.setAudioListener({ x: 0, z: 0 })
	const sounded = new Map()
	for (let i = 0; i < 20; i++) {
		const id = FIGHT[Math.floor(random() * FIGHT.length)]
		if (!uses[id]) continue
		const tick = Math.floor(random() * 90) // 1.5 s at 60 ticks a second
		const point = { x: (random() - 0.5) * 24, y: 1, z: (random() - 0.5) * 16 }
		const gain = random() < 0.3 ? 1 : 0.45 // your own sounds at full, everyone else's quieter
		setTimeout(
			() => {
				const voice = sounds.voiceOf(id)
				if (sounded.get(voice) === tick) return
				sounded.set(voice, tick)
				sounds.play(id, point, gain, 1)
			},
			(tick * 1000) / 60,
		)
	}
})

function refresh() {
	fillSelects()
	fillLibrary()
	fillChanges()
}
swap.onSwapChange(refresh)
refresh()
swap.loaded.then(() => {
	refresh()
	if (!location.search.includes('check')) measureAll()
})
