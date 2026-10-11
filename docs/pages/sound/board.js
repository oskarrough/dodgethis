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
// Top five library files per use (`bun run sound:check --shortlist <uses>` writes sounds/shortlists.json).
const shortlists = await fetch('/sounds/shortlists.json')
	.then((r) => r.json())
	.catch(() => ({}))
const shortlist = (id) => shortlists[id] ?? []
// Every file in the library as it is now (the dev server lists sounds/osk-sfx/), with the numbers
// `sound:check --files` cached in sounds/numbers.json where it has measured them.
const libraryNumbers = await fetch('/sounds/numbers.json')
	.then((r) => r.json())
	.catch(() => ({}))
const library = await fetch('/__sound/library')
	.then((r) => r.json())
	.catch(() => Object.keys(libraryNumbers).sort())
const folderOfPath = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')
document.body.append(
	el('datalist', { id: 'library-files' }, ...library.map((path) => el('option', { value: path }))),
)
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const local = (id) => swap.swapList().find(([key]) => key === id)?.[1]
const nameOf = (s) => s.kept ?? s.file ?? s.library ?? s.voice
function playing(id) {
	const s = swap.swapOf(id)
	if (s?.shuffle) return `shuffle of ${s.shuffle.length}: ${s.shuffle.map(nameOf).join(', ')}`
	if (s?.kept) return `kept ${s.kept}`
	if (s?.file) return `file ${s.file}`
	if (s?.library) return `library ${s.library}`
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
	const url = swap.swapUrl(chosen)
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

// Folders: the board's own tools, then sources in the order a player meets them, heroes last (a–z).
const sources = [...new Set(Object.values(uses).map((u) => u.source))]
const screens = ['Splash and descent', 'Lobby', 'Menus', 'Music']
const match = ['Ball', 'Structures', 'Minions', 'Combat', 'Outs', 'Movement', 'Progress']
const TOOLS = ['Rule check', 'Mix', 'Changes', 'Silent facts']
const GROUPS = [
	['Board', TOOLS],
	['Screens and music', screens],
	['Match', match.filter((s) => sources.includes(s))],
	['Heroes', sources.filter((s) => !match.includes(s) && !screens.includes(s)).sort()],
]
const where = () => {
	const q = new URLSearchParams(location.hash.slice(1))
	return { folder: q.get('f') ?? screens[0], use: q.get('u') }
}
const link = (folder, use) => `#${new URLSearchParams(use ? { f: folder, u: use } : { f: folder })}`
const idsIn = (folder) => Object.keys(uses).filter((id) => uses[id].source === folder)

function drawFolders() {
	const { folder } = where()
	const flags = check(rows())
	const count = (name) =>
		name === 'Rule check'
			? ` (${Object.keys(flags).length})`
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
	// A select value (`library:…`, `voice:…`, `builtin`) as a swap.
	const swapFor = (value) => {
		const [kind, name] = value.split(':')
		return kind === 'library'
			? { library: name, gain: shortlist(id).find((c) => c.file === name)?.gain ?? 0.5 }
			: kind === 'voice'
				? { voice: name }
				: kind === 'builtin' && swap.kept[id]
					? { builtin: true }
					: null
	}
	parts.select.addEventListener('change', async () => {
		if (parts.select.value === 'shuffle') return
		parts.candidate = swapFor(parts.select.value)
		await swap.setSwap(id, parts.candidate)
		play(id)
		measureUse(id).then(draw)
	})
	// Add to shuffle: the sound picked in the list joins the shuffle, and each play picks one at random. The list
	// lives here too, so auditioning the next candidate doesn't lose it.
	parts.shuffle = el('ul')
	parts.list = [...(swap.swapOf(id)?.shuffle ?? [])]
	parts.find = el('input', { type: 'search', placeholder: 'Find in your library', size: 32 })
	parts.find.setAttribute('list', 'library-files')
	parts.find.addEventListener('change', async () => {
		if (!library.includes(parts.find.value)) return
		parts.pile = ''
		parts.at = library.indexOf(parts.find.value)
		deckPlay(parts)
	})
	parts.add = button('Add to shuffle', async () => {
		const item = parts.candidate ?? swapFor(parts.select.value)
		if (!swap.swapUrl(item) || parts.list.some((s) => same(s, item))) return
		parts.list.push(item)
		await swap.setSwap(id, { shuffle: parts.list })
		play(id)
	})
	parts.level.addEventListener('change', async () => {
		const chosen = swap.swapOf(id)
		if (!swap.swapUrl(chosen)) return
		const gain = Number(parts.level.value)
		await swap.setSwap(
			id,
			chosen.shuffle
				? { shuffle: chosen.shuffle.map((s) => ({ ...s, gain })) }
				: { ...chosen, gain },
		)
		play(id)
		measureUse(id).then(draw)
	})
	buildDeck(id, parts)
	$('details').replaceChildren(
		el('h2', {}, el('code', { textContent: id })),
		...rest,
		el('p', {}, el('label', {}, 'Sound ', parts.select)),
		el('p', {}, parts.find, ' ', parts.add),
		parts.shuffle,
		el('p', {}, el('label', {}, 'File level ', parts.level)),
		parts.deck,
		el(
			'p',
			{},
			button('Play', () => play(id)),
			' ',
			button('Built in', () => playBuiltin(id)),
			' ',
			button('In a fight', () => fight(id)),
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
	const kept = swap.kept[id]
	const mine = local(id)
	const key = JSON.stringify([kept, mine?.shuffle?.length])
	if (detail.files !== key) {
		detail.files = key
		const options = [
			el('option', { value: 'builtin', textContent: `Built in: ${uses[id].voice ?? 'synth'}` }),
		]
		if (kept)
			options.push(
				el('option', {
					value: 'kept',
					textContent: `Kept: ${kept.shuffle ? `shuffle of ${kept.shuffle.length}` : nameOf(kept)}`,
				}),
			)
		if (mine?.shuffle && !same(mine, kept))
			options.push(
				el('option', { value: 'shuffle', textContent: `Shuffle of ${mine.shuffle.length}` }),
			)
		if (shortlist(id).length)
			options.push(
				el(
					'optgroup',
					{ label: 'Shortlist from your library, best fit first' },
					...shortlist(id).map((c) =>
						el('option', { value: `library:${c.file}`, textContent: c.file }),
					),
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
				? mine.shuffle
					? 'shuffle'
					: mine.library
						? `library:${mine.library}`
						: mine.voice
							? `voice:${mine.voice}`
							: 'builtin'
				: kept
					? 'kept'
					: 'builtin'
	const chosen = swap.swapOf(id)
	detail.level.value = chosen?.gain ?? 0.5
	detail.level.disabled = !swap.swapUrl(chosen)
	detail.keep.disabled = !mine || same(mine, kept) || (mine.builtin && !kept)
	detail.shuffle.replaceChildren(
		...detail.list.map((item, i) =>
			el(
				'li',
				{},
				button('▶', () => audio.sample(swap.swapUrl(item), { gain: item.gain ?? 0.5 })),
				` ${nameOf(item)} `,
				button('Remove', () => {
					detail.list.splice(i, 1)
					swap.setSwap(id, detail.list.length ? { shuffle: detail.list } : null)
				}),
			),
		),
	)
}

// The deck: a sound's candidates one at a time, Tinder-style. The pile is the shortlist, the whole library or one
// of its folders; ←/→ plays the previous or next, Space plays it again, B the game's own sound, S adds it to the
// shuffle, K keeps (the shuffle if there is one, else the candidate) and moves on, ↑/↓ moves between sounds.
let lastPile = '' // the last library folder picked, where a sound without a shortlist starts
const libraryPiles = [
	['', `Everything (${library.length})`],
	...[
		...new Set(
			library.flatMap((path) => {
				const parts = folderOfPath(path).split('/').filter(Boolean)
				return parts.map((_, i) => parts.slice(0, i + 1).join('/'))
			}),
		),
	]
		.sort()
		.map((folder) => [
			folder,
			`${'   '.repeat(folder.split('/').length - 1)}${folder.split('/').at(-1)}/ (${
				library.filter((path) => path.startsWith(folder + '/')).length
			})`,
		]),
]
const pileFiles = (id, pile) =>
	pile === 'shortlist'
		? shortlist(id).map((c) => c.file)
		: pile
			? library.filter((path) => path.startsWith(pile + '/'))
			: library
function buildDeck(id, parts) {
	parts.pile = shortlist(id).length ? 'shortlist' : lastPile
	parts.at = -1
	parts.pileSelect = el(
		'select',
		{ ariaLabel: 'Pile' },
		...(shortlist(id).length
			? [el('option', { value: 'shortlist', textContent: `Shortlist (${shortlist(id).length})` })]
			: []),
		...libraryPiles.map(([value, textContent]) => el('option', { value, textContent })),
	)
	parts.pileSelect.value = parts.pile
	parts.pileSelect.addEventListener('change', () => {
		parts.pile = parts.pileSelect.value
		if (parts.pile !== 'shortlist') lastPile = parts.pile
		parts.at = -1
		parts.pileSelect.blur()
		drawCard(parts)
	})
	parts.card = el('p')
	parts.deck = el(
		'section',
		{},
		el('h3', { textContent: 'Review' }),
		el('p', {}, el('label', {}, 'From ', parts.pileSelect)),
		parts.card,
		el(
			'p',
			{},
			button('← Previous', () => deckStep(parts, -1)),
			' ',
			button('Again', () => play(id)),
			' ',
			button('Built in', () => playBuiltin(id)),
			' ',
			button('Next →', () => deckStep(parts, 1)),
		),
		el(
			'p',
			{},
			button('Like: add to shuffle', () => parts.add.click()),
			' ',
			button('Keep and next sound', () => deckKeep(parts)),
		),
		el(
			'p',
			{},
			el('small', {
				textContent:
					'Keys: ←/→ candidates, Space again, B built in, S like, K keep and move on, ↑/↓ other sounds. Keep copies the file into the game (public/sfx/kept/, src/core/sfx/kept.json); everyone hears it once it is committed and pushed.',
			}),
		),
	)
	drawCard(parts)
}
function drawCard(parts) {
	const files = pileFiles(parts.id, parts.pile)
	const file = files[parts.at]
	if (!file)
		return parts.card.replaceChildren(
			`${files.length} candidates. Press → to start; now playing: ${playing(parts.id)}.`,
		)
	const n = libraryNumbers[file]?.numbers
	const why = shortlist(parts.id).find((c) => c.file === file)?.why
	parts.card.replaceChildren(
		el('small', {
			textContent: `${parts.at + 1} of ${files.length} · ${folderOfPath(file) || 'top'}/`,
		}),
		el('br'),
		el('strong', { textContent: file.split('/').at(-1) }),
		el('br'),
		el('small', { textContent: [why, n && describe(n)].filter(Boolean).join(' · ') }),
	)
}
function deckStep(parts, step) {
	const files = pileFiles(parts.id, parts.pile)
	if (!files.length) return
	parts.at = (Math.max(parts.at, step > 0 ? -1 : 0) + step + files.length) % files.length
	deckPlay(parts)
}
async function deckPlay(parts) {
	const file = pileFiles(parts.id, parts.pile)[parts.at]
	drawCard(parts)
	if (!file) return
	const gain = shortlist(parts.id).find((c) => c.file === file)?.gain ?? 0.5
	parts.candidate = { library: file, gain }
	await swap.setSwap(parts.id, parts.candidate)
	play(parts.id)
	measureUse(parts.id).then(draw)
}
async function deckKeep(parts) {
	if (parts.list.length) await swap.setSwap(parts.id, { shuffle: parts.list })
	if (!local(parts.id) || same(local(parts.id), swap.kept[parts.id])) return
	await keepSwap(parts.id)
	stepUse(1)
}
function stepUse(step) {
	const { folder, use } = where()
	const ids = idsIn(folder)
	const next = ids[ids.indexOf(use) + step]
	if (next) location.hash = link(folder, next)
}
addEventListener('keydown', (e) => {
	if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, select, textarea')) return
	const { folder, use } = where()
	if (TOOLS.includes(folder)) return
	const deck = detail?.deck && detail
	const act = {
		ArrowUp: () => stepUse(-1),
		ArrowDown: () =>
			use ? stepUse(1) : idsIn(folder)[0] && (location.hash = link(folder, idsIn(folder)[0])),
		ArrowLeft: () => deck && deckStep(deck, -1),
		ArrowRight: () => deck && deckStep(deck, 1),
		' ': () => use && play(use),
		b: () => use && playBuiltin(use),
		s: () => deck && detail.add.click(),
		k: () => deck && deckKeep(deck),
	}[e.key.length === 1 ? e.key.toLowerCase() : e.key]
	if (!act) return
	e.preventDefault()
	act()
})

// Keep writes the swap into the repo (vite.config.js `soundKeep`); this browser mirrors it until a reload.
async function keepSwap(id) {
	const chosen = local(id)
	if (chosen?.shuffle) {
		for (const [i, item] of chosen.shuffle.entries()) await keepOne(id, item, i > 0)
		return swap.setSwap(id, swap.kept[id])
	}
	await keepOne(id, chosen)
	await swap.setSwap(id, swap.kept[id] ?? { builtin: true })
}
// Keep one sound; `append` adds it to the use's kept shuffle.
async function keepOne(id, chosen, append = false) {
	const q = new URLSearchParams({ use: id })
	if (append) q.set('append', 1)
	let body = null
	if (chosen?.library) {
		q.set('name', chosen.library)
		q.set('gain', chosen.gain ?? 0.5)
		body = await (await fetch(swap.libraryUrl(chosen.library))).blob()
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

const describeSwap = (s) =>
	s.shuffle
		? `shuffle of ${s.shuffle.map(describeSwap).join(' + ')}`
		: s.builtin
			? 'built in'
			: s.voice
				? s.voice
				: `${nameOf(s)} at ${s.gain ?? 0.5}`
function changesTool() {
	const mixed = MIX.map(([key]) => key).filter((key) => {
		const [head, tail] = key.split('.')
		return mixValue(key) !== (tail ? tune.mix.caps[tail] : tune.mix[head])
	})
	const lines = [
		...mixed.map((key) => `tune.mix.${key} → ${mixValue(key)} (this browser only)`),
		...Object.entries(swap.kept).map(
			([id, s]) => `${id} → kept ${describeSwap(s)} (in the repo, waiting for a commit)`,
		),
		...swap
			.swapList()
			.filter(([id, s]) => !same(s, swap.kept[id]) && !(s.builtin && !swap.kept[id]))
			.map(([id, s]) => `${id} → ${describeSwap(s)} (this browser only)`),
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
// fight(id) plays that sound three times as yours over the crowd, to hear whether it cuts through.
function fight(id) {
	if (id)
		for (const tick of [10, 45, 80])
			setTimeout(() => sounds.playOwn(id, { x: 0, y: 1, z: 0 }, 1, 1), (tick * 1000) / 60)
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
$('fight').addEventListener('click', () => fight())
$('resync').addEventListener('click', async () => {
	$('resync-status').textContent = 'Syncing…'
	const response = await fetch('/__sound/sync', { method: 'POST' })
	if (!response.ok)
		return ($('resync-status').textContent = `Resync failed: ${await response.text()}`)
	location.reload()
})
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
