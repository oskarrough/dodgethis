// The sound board: plays every use in the sound table through the game's own audio, and swaps files or other
// voices into a use (src/core/sound-swap.js) so a match running in another tab hears them.
import * as audio from '/src/core/audio.js'
import * as swap from '/src/core/sound-swap.js'
import { createSounds } from '/src/plugins/moba/sounds.js'
import { uses, facts } from '/src/plugins/moba/sound-table.js'

const sounds = createSounds(audio)
const skip = new Set(['play', 'voiceOf', 'tick', 'tickPerfect'])
const voices = Object.keys(sounds)
	.filter((name) => typeof sounds[name] === 'function' && !skip.has(name))
	.sort()
const $ = (id) => document.getElementById(id)
function el(tag, props = {}, ...children) {
	const node = Object.assign(document.createElement(tag), props)
	node.append(...children)
	return node
}

audio.previewMusic(null) // the board stays quiet until a music row is played

function playUse(id, point = null, gain = 1) {
	const use = uses[id]
	if (use.music) return audio.previewMusic(use.music)
	if (!use.where) return sounds.play(id, point, gain)
	const chosen = swap.swapOf(id)
	const url = chosen?.file && swap.fileUrl(chosen.file)
	if (url) audio.sample(url, { gain: (chosen.gain ?? 0.5) * gain, point })
	else if (chosen?.voice) sounds[chosen.voice]?.(point, gain)
	else use.play(audio)
}
function playDefault(id) {
	const use = uses[id]
	if (use.play) use.play(audio)
	else sounds[use.voice]?.(null, 1)
}

// One row per use: what sets it off, the sound it plays (default, a file or another voice), level, play.
const selects = new Map()
function row(id) {
	const use = uses[id]
	const play = el('button', { type: 'button', textContent: 'Play' })
	play.addEventListener('click', () => playUse(id))
	if (use.music) {
		const stop = el('button', { type: 'button', textContent: 'Stop' })
		stop.addEventListener('click', () => audio.previewMusic(null))
		return el(
			'tr',
			{},
			el('td', { textContent: use.about }),
			el('td', {}, el('code', { textContent: id })),
			el('td'),
			el('td'),
			el('td', {}, play, ' ', stop),
		)
	}
	const select = el('select', { ariaLabel: `Sound for ${id}` })
	const level = el('input', {
		type: 'range',
		min: 0.05,
		max: 1.5,
		step: 0.05,
		ariaLabel: `Level of the file for ${id}`,
	})
	select.addEventListener('change', async () => {
		const [kind, name] = select.value.split(':')
		const next =
			kind === 'file'
				? { file: name, gain: Number(level.value) }
				: kind === 'voice'
					? { voice: name }
					: null
		await swap.setSwap(id, next)
		playUse(id)
	})
	level.addEventListener('change', async () => {
		const chosen = swap.swapOf(id)
		if (!chosen?.file) return
		await swap.setSwap(id, { ...chosen, gain: Number(level.value) })
		playUse(id)
	})
	const original = el('button', { type: 'button', textContent: 'Default' })
	original.addEventListener('click', () => playDefault(id))
	selects.set(id, { select, level })
	const when = use.where
		? `${use.about} (plays from ${use.where}; swaps not wired in the game yet)`
		: use.about
	return el(
		'tr',
		{},
		el('td', { textContent: when }),
		el('td', {}, el('code', { textContent: id })),
		el('td', {}, select),
		el('td', {}, level),
		el('td', {}, play, ' ', original),
	)
}

function fillSelects() {
	const files = swap.fileNames()
	for (const [id, { select, level }] of selects) {
		const chosen = swap.swapOf(id)
		const options = [
			el('option', { value: 'default', textContent: `Default: ${uses[id].voice ?? 'built in'}` }),
		]
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
		select.value = chosen?.file
			? `file:${chosen.file}`
			: chosen?.voice
				? `voice:${chosen.voice}`
				: 'default'
		level.value = chosen?.gain ?? 0.5
		level.disabled = !chosen?.file
	}
}

function fillLibrary() {
	$('library').replaceChildren(
		...swap.fileNames().map((name) => {
			const play = el('button', { type: 'button', textContent: 'Play' })
			play.addEventListener('click', () => audio.sample(swap.fileUrl(name), { gain: 0.5 }))
			const remove = el('button', { type: 'button', textContent: 'Remove' })
			remove.addEventListener('click', () => swap.removeFile(name))
			return el('li', {}, play, ' ', remove, ' ', name)
		}),
	)
}

function fillChanges() {
	const lines = swap
		.swapList()
		.map(([id, s]) =>
			s.file ? `${id} → file ${s.file} at ${s.gain ?? 0.5}` : `${id} → ${s.voice}`,
		)
	$('changes').textContent = lines.length
		? lines.join('\n')
		: 'No swaps: the game plays its own sounds.'
}

const bySource = Map.groupBy(Object.keys(uses), (id) => uses[id].source)
for (const [source, ids] of bySource) {
	const head = el(
		'tr',
		{},
		...['When', 'Use', 'Sound', 'File level', ''].map((t) => el('th', { textContent: t })),
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
				(f) => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac|webm)$/i.test(f.name),
			),
		)
		input.value = ''
	})
$('reset').addEventListener('click', async () => {
	for (const [id] of swap.swapList()) await swap.setSwap(id, null)
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
swap.loaded.then(refresh)
refresh()
