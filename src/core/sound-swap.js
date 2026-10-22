// Sound swaps: the sound board (pages/sound/) replaces the sound of one use, and the game open in another tab
// hears it on its next event. A swap is { voice } (another built-in sound), { library, gain } (a file from Oskar's
// library), { kept, gain } or { shuffle: [swap…] }. Local swaps live in this browser's IndexedDB; kept swaps ship:
// Keep copies the file to public/sfx/kept/ and writes the swap into sfx/kept.json, the layer under local swaps.
import kept from './sfx/kept.json'

// The deployed board is a showcase of committed picks, not this browser's workbench.
const readOnly =
	import.meta.env?.PROD && globalThis.location?.pathname.replace(/\/$/, '') === '/pages/sound'
const DB = 'dodgethis-sound'
const swaps = new Map() // use id → swap
const listeners = new Set()
let mix = {} // the board's mix sliders, over tune.mix
const channel =
	!readOnly && globalThis.window && globalThis.BroadcastChannel ? new BroadcastChannel(DB) : null

function request(r) {
	return new Promise((resolve, reject) => {
		r.onsuccess = () => resolve(r.result)
		r.onerror = () => reject(r.error)
	})
}

let db = null
function open() {
	if (readOnly || !globalThis.indexedDB) return Promise.resolve(null)
	db ??= new Promise((resolve) => {
		const r = indexedDB.open(DB, 1)
		r.onupgradeneeded = () => {
			r.result.createObjectStore('swaps')
			r.result.createObjectStore('files') // the board's old dropped files, emptied on load
		}
		r.onsuccess = () => resolve(r.result)
		r.onerror = () => resolve(null) // private modes: swaps stay off, the game plays its own sounds
	})
	return db
}

async function all(store) {
	const d = await open()
	if (!d) return []
	const s = d.transaction(store).objectStore(store)
	const [keys, values] = await Promise.all([request(s.getAllKeys()), request(s.getAll())])
	return keys.map((key, i) => [key, values[i]])
}

async function write(store, key, value) {
	const d = await open()
	if (!d) return
	const s = d.transaction(store, 'readwrite').objectStore(store)
	await request(value == null ? s.delete(key) : s.put(value, key))
}

async function reload() {
	const nextSwaps = await all('swaps')
	swaps.clear()
	mix = {}
	for (const [id, swap] of nextSwaps)
		if (id === '#mix') mix = swap
		else if (!swap.file) swaps.set(id, swap) // a swap to an old dropped file has nothing left to play
	for (const fn of listeners) fn()
}

// Dropped files are gone from the board (the library replaces them): free what they took.
async function clearFiles() {
	const d = await open()
	if (d) await request(d.transaction('files', 'readwrite').objectStore('files').clear())
}
export const loaded = Promise.all([reload(), clearFiles()]).catch((error) =>
	console.warn('sound-swap: load failed:', error),
)
channel?.addEventListener('message', () =>
	reload().catch((error) => console.warn('sound-swap: reload failed:', error)),
)

async function changed() {
	await reload()
	channel?.postMessage('changed')
}

export { kept }
// A local swap wins over a kept one; { builtin: true } hears the game's own sound past a kept one.
export function swapOf(id) {
	const local = swaps.get(id)
	return local?.builtin ? undefined : (local ?? kept[id])
}
export const swapList = () => [...swaps]
export const keptUrl = (name) => `/sfx/kept/${encodeURIComponent(name)}`
// The showcase ships only shortlisted files; the workbench can play the entire dev library.
export const libraryUrl = (path) =>
	`${readOnly ? '/sfx/showcase/library' : '/sounds/osk-sfx'}/${path.split('/').map(encodeURIComponent).join('/')}`
// The URL a file swap plays, or null for a voice swap. { shuffle: [swap…] } plays one of its swaps at random
// (audio.js `swapped`); its URL here is the first one's.
export const swapUrl = (swap) =>
	swap?.shuffle
		? swapUrl(swap.shuffle[0])
		: swap?.kept
			? keptUrl(swap.kept)
			: swap?.library
				? libraryUrl(swap.library)
				: null
// The sounds a swap may name: core sfx and each plugin's voices register here.
const voices = {}
export const registerVoices = (named) => Object.assign(voices, named)
export const voiceNamed = (name) => voices[name]
export const voiceNames = () => Object.keys(voices).sort()

export function onSwapChange(fn) {
	listeners.add(fn)
	return () => listeners.delete(fn)
}

export async function setSwap(id, swap) {
	await write('swaps', id, swap)
	await changed()
}
export const mixOf = () => mix
export async function setMix(values) {
	await write('swaps', '#mix', values)
	await changed()
}
