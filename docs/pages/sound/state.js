// The sound board's shared state: the sound table, Oskar's library and its numbers, what each use plays now, the
// selection (the URL hash), Keep, and a preview voice for scrubbing the library. Every pane imports from here and
// redraws on `on('change')`.
import * as audio from '/src/core/audio.js'
import * as swap from '/src/core/sound-swap.js'
import { playUse } from '/src/plugins/moba/sounds.js'
import { uses, facts } from '/src/plugins/moba/sound-table.js'
import { check, measure } from './numbers.js'

export { audio, swap, uses, facts, check }

// Events: 'change' (swaps, kept, numbers, selection), 'select' (the selected use changed).
const listeners = new Map()
export const on = (type, fn) => listeners.set(type, [...(listeners.get(type) ?? []), fn])
export const emit = (type, ...args) => (listeners.get(type) ?? []).forEach((fn) => fn(...args))
swap.onSwapChange(() => emit('change'))

// The library: every file the dev server finds in sounds/osk-sfx/, with the numbers `bun run sound:sync` caches.
export const libraryNumbers = await fetch('/sounds/numbers.json')
	.then((r) => r.json())
	.catch(() => ({}))
export const library = await fetch('/__sound/library')
	.then((r) => r.json())
	.catch(() => Object.keys(libraryNumbers).sort())
export const numbersOf = (path) => libraryNumbers[path]?.numbers ?? null
export const folderOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')
export const fileName = (path) => path.slice(path.lastIndexOf('/') + 1)
// Every folder, parents included, a–z: 'game', 'game/player', 'game/player/hit'…
export const folders = [
	...new Set(
		library.flatMap((path) => {
			const parts = folderOf(path).split('/').filter(Boolean)
			return parts.map((_, i) => parts.slice(0, i + 1).join('/'))
		}),
	),
].sort()
export const inFolder = (folder) =>
	folder ? library.filter((path) => path.startsWith(folder + '/')) : library

// Top five library files per use: { file, score, gain, why }.
const shortlists = await fetch('/sounds/shortlists.json')
	.then((r) => r.json())
	.catch(() => ({}))
export const shortlist = (id) => shortlists[id] ?? []
export const gainFor = (id, path) => shortlist(id).find((c) => c.file === path)?.gain ?? 0.5

// Nopes: library files Oskar swiped away for a use, kept in this browser so the deck never offers them again.
const NOPES = 'dodgethis-sound-nopes'
const nopes = JSON.parse(localStorage.getItem(NOPES) ?? '{}')
export const isNoped = (id, path) => !!nopes[id]?.includes(path)
export function nope(id, path, undo = false) {
	const list = new Set(nopes[id])
	if (undo) list.delete(path)
	else list.add(path)
	nopes[id] = [...list]
	localStorage.setItem(NOPES, JSON.stringify(nopes))
	emit('change')
}

// Sound space: where a file sits by brightness and length (both log), the axes of the sound map and of "near".
export function place(n) {
	if (!n) return null
	return {
		x: Math.log2(Math.max(n.centroid, 100) / 100) / Math.log2(120), // 100 Hz … 12 kHz → 0 … 1
		y: Math.log2(Math.max(n.length, 20) / 20) / Math.log2(500), // 20 ms … 10 s → 0 … 1
	}
}
// The library files nearest a sound's numbers in sound space, nearest first.
export function nearest(n, count = 24) {
	const at = place(n)
	if (!at) return []
	return library
		.filter((path) => numbersOf(path))
		.map((path) => {
			const p = place(numbersOf(path))
			return [path, (p.x - at.x) ** 2 + (p.y - at.y) ** 2]
		})
		.sort((a, b) => a[1] - b[1])
		.slice(0, count)
		.map(([path]) => path)
}

// The deck: the selected use's candidates, one at a time. The pile is 'shortlist', 'near' (files near the last
// candidate, or near what the use plays now), '' (everything) or a library folder; noped files drop out.
export const deck = { use: null, pile: 'shortlist', at: -1, near: [] }
export function pileFiles(id, pile = deck.pile) {
	if (!id) return []
	const files =
		pile === 'shortlist'
			? shortlist(id).map((c) => c.file)
			: pile === 'near'
				? deck.near
				: inFolder(pile)
	return files.filter((path) => !isNoped(id, path))
}
export const candidate = () => pileFiles(where().use)[deck.at] ?? null
export function setPile(pile) {
	const { use } = where()
	if (pile === 'near')
		deck.near = nearest(candidate() ? numbersOf(candidate()) : numbers.get(use)).filter(
			(path) => path !== candidate(),
		)
	deck.pile = pile
	deck.at = -1
	emit('change')
}
// Move through the pile and audition; `to` jumps to a file (from the map or the find box), switching to
// everything when it isn't in the pile.
export function deckStep(by) {
	const { use } = where()
	deck.use = use
	const files = pileFiles(use)
	if (!use || !files.length) return
	deck.at = (Math.max(deck.at, by > 0 ? -1 : 0) + by + files.length) % files.length
	audition(use, files[deck.at])
	emit('change')
}
export function deckTo(path) {
	const { use } = where()
	deck.use = use
	if (!use) return
	if (isNoped(use, path)) nope(use, path, true)
	if (!pileFiles(use).includes(path)) deck.pile = ''
	deck.at = pileFiles(use).indexOf(path)
	audition(use, path)
	emit('change')
}

// Where things are: sources in the order a player meets them, grouped; heroes last, a–z.
const sources = [...new Set(Object.values(uses).map((u) => u.source))]
const screens = ['Splash and descent', 'Lobby', 'Menus', 'Music']
const match = ['Ball', 'Structures', 'Minions', 'Combat', 'Outs', 'Movement', 'Progress']
export const GROUPS = [
	['Screens and music', screens.filter((s) => sources.includes(s))],
	['Match', match.filter((s) => sources.includes(s))],
	['Heroes', sources.filter((s) => !match.includes(s) && !screens.includes(s)).sort()],
]
export const idsIn = (source) => Object.keys(uses).filter((id) => uses[id].source === source)
// Every use in board order, the order ↑/↓ and the strip walk.
export const ORDER = GROUPS.flatMap(([, list]) => list.flatMap(idsIn))
export const shortName = (id) => (id.includes('.') ? id.slice(id.indexOf('.') + 1) : id)

// The selection lives in the hash (#u=<use>&t=<tool>), so a link or reload lands on the same sound.
export function where() {
	const q = new URLSearchParams(location.hash.slice(1))
	const use = uses[q.get('u')] ? q.get('u') : null
	return { use, tool: q.get('t') }
}
export function go(change) {
	const next = { ...where(), ...change }
	const q = new URLSearchParams()
	if (next.use) q.set('u', next.use)
	if (next.tool) q.set('t', next.tool)
	location.hash = q
}
export function step(by) {
	const { use } = where()
	const next = ORDER[use ? ORDER.indexOf(use) + by : 0]
	if (next) go({ use: next })
}
addEventListener('hashchange', () => emit('select'))

// What a use plays now.
export const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
export const local = (id) => swap.swapList().find(([key]) => key === id)?.[1]
export const nameOf = (s) => s.kept ?? s.library ?? s.voice
export function playing(id) {
	const s = swap.swapOf(id)
	if (s?.shuffle) return `shuffle of ${s.shuffle.length}: ${s.shuffle.map(nameOf).join(', ')}`
	if (s?.kept) return `kept ${s.kept}`
	if (s?.library) return s.library
	if (s?.voice) return s.voice
	return uses[id].music ? 'synth music' : `built in (${uses[id].voice ?? 'synth'})`
}
// Built-in sounds Oskar heard and kept as they are (docs/pages/sound/approved.json).
let approved = new Set(
	await fetch('./approved.json')
		.then((r) => r.json())
		.catch(() => []),
)
export const isApproved = (id) => approved.has(id) && !swap.kept[id]
export async function approve(id, off = false) {
	const q = new URLSearchParams({ use: id })
	if (off) q.set('off', 1)
	const response = await fetch(`/__sound/approve?${q}`, { method: 'POST' })
	if (response.ok) approved = new Set(await response.json())
	emit('change')
}
// 'music', 'trying' (a swap in this browser, not kept), 'kept' (Oskar picked a file, or approved the built-in
// sound) or 'builtin' (nobody has listened yet).
export function status(id) {
	if (uses[id].music) return 'music'
	const mine = local(id)
	const kept = swap.kept[id]
	if (mine && !same(mine, kept) && !(mine.builtin && !kept)) return 'trying'
	return kept || approved.has(id) ? 'kept' : 'builtin'
}
export const pickable = ORDER.filter((id) => !uses[id].music)

const busName = {
	ui: 'menus',
	mine: 'your hero',
	others: 'other heroes',
	world: 'world',
	music: 'music',
}
export const busOf = (id) =>
	uses[id].bus === 'hero' ? 'your hero or other heroes' : busName[uses[id].bus]
export const factsOf = (id) =>
	Object.entries(facts)
		.filter(([, list]) => list.includes(id))
		.map(([type]) => type)

// Playing.
audio.previewMusic(null) // the board stays quiet until a music row is played
let musicStop = 0
export function previewMusic(scene, seconds = 0) {
	clearTimeout(musicStop)
	audio.previewMusic(scene)
	if (seconds) musicStop = setTimeout(() => audio.previewMusic(null), seconds * 1000)
}
export const play = (id) => (uses[id].music ? previewMusic(uses[id].music) : playUse(audio, id))
// The game's own sound for a use, past any swap or kept file.
export function playBuiltin(id) {
	const use = uses[id]
	if (use.music) return previewMusic(use.music)
	if (use.voice) swap.voiceNamed(use.voice)?.(null, 1)
	else if (use.recipe) audio.blip(use.recipe())
	else use.play?.(audio, null, 1)
}
// Try a library file in a use: it becomes the use's swap (the game in another tab hears it too) and plays.
export async function audition(id, path) {
	await swap.setSwap(id, { library: path, gain: gainFor(id, path) })
	play(id)
	measureUse(id).then(() => emit('change'))
}

// The preview voice: one library file at a time, raw, cut off by the next, for scrubbing the map or a list.
const decoded = new Map()
const previewContext = new AudioContext()
export function libraryBuffer(path) {
	if (!decoded.has(path))
		decoded.set(
			path,
			fetch(swap.libraryUrl(path))
				.then((r) => r.arrayBuffer())
				.then((data) => previewContext.decodeAudioData(data)),
		)
	return decoded.get(path)
}
let previewing = null
export async function preview(path, gain = 0.5) {
	const asked = (previewing = { path })
	const buffer = await libraryBuffer(path).catch(() => null)
	if (!buffer || previewing !== asked) return
	previewContext.resume()
	const source = previewContext.createBufferSource()
	const level = previewContext.createGain()
	level.gain.value = gain
	source.buffer = buffer
	source.connect(level).connect(previewContext.destination)
	source.start()
	stopPreview.last?.stop()
	stopPreview.last = source
}
export function stopPreview() {
	previewing = null
	stopPreview.last?.stop()
	stopPreview.last = null
}

// Numbers and the rendered buffer for what a use plays now (swap, kept or built in), rendered offline.
export const numbers = new Map()
export const rendered = new Map()
export async function measureUse(id) {
	const url = swap.swapUrl(swap.swapOf(id))
	const buffer = await audio.render(() => playUse(audio, id), { warm: url ? [url] : [] })
	rendered.set(id, buffer)
	numbers.set(id, measure(buffer))
}
export async function measureAll(ids = pickable) {
	for (const id of ids) await measureUse(id).catch(() => numbers.set(id, null))
	emit('change')
}
export const rows = () =>
	[...numbers].map(([id, n]) => ({ id, source: uses[id].source, numbers: n }))
export const flags = () => check(rows())
// The headless check (`bun run sound:check`) reads every use's numbers and flags here.
globalThis.soundNumbers = async () => {
	await swap.loaded
	await measureAll()
	return { rows: rows(), flags: check(rows()) }
}

// Keep writes the swap into the repo (vite.config.js `soundKeep`); this browser mirrors it until a reload.
export async function keepSwap(id) {
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
