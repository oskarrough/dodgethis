// Sound swaps: the sound board (docs/pages/sound/) replaces the sound of one use, and a running game in another tab
// hears it on the next event. A swap is { voice } (another built-in sound) or { file, gain } (an audio file Oskar
// dropped on the board). Swaps and files live in this browser's IndexedDB; nothing here ships until it's committed.

const DB = 'dodgethis-sound'
const swaps = new Map() // use id → swap
const files = new Map() // file name → Blob
const urls = new Map() // file name → object URL
const listeners = new Set()
const channel = globalThis.window && globalThis.BroadcastChannel ? new BroadcastChannel(DB) : null

function request(r) {
	return new Promise((resolve, reject) => {
		r.onsuccess = () => resolve(r.result)
		r.onerror = () => reject(r.error)
	})
}

let db = null
function open() {
	if (!globalThis.indexedDB) return Promise.resolve(null)
	db ??= new Promise((resolve) => {
		const r = indexedDB.open(DB, 1)
		r.onupgradeneeded = () => {
			r.result.createObjectStore('swaps')
			r.result.createObjectStore('files')
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
	const [nextSwaps, nextFiles] = await Promise.all([all('swaps'), all('files')])
	swaps.clear()
	for (const [id, swap] of nextSwaps) swaps.set(id, swap)
	for (const name of files.keys())
		if (!nextFiles.some(([n]) => n === name)) {
			URL.revokeObjectURL(urls.get(name))
			urls.delete(name)
		}
	files.clear()
	for (const [name, blob] of nextFiles) files.set(name, blob)
	for (const fn of listeners) fn()
}

export const loaded = reload().catch(() => {})
channel?.addEventListener('message', () => reload().catch(() => {}))

async function changed() {
	await reload()
	channel?.postMessage('changed')
}

export const swapOf = (id) => swaps.get(id)
export const swapList = () => [...swaps]
export const fileNames = () => [...files.keys()].sort()
export function fileUrl(name) {
	const blob = files.get(name)
	if (!blob) return null
	if (!urls.has(name)) urls.set(name, URL.createObjectURL(blob))
	return urls.get(name)
}
export function onSwapChange(fn) {
	listeners.add(fn)
	return () => listeners.delete(fn)
}

export async function setSwap(id, swap) {
	await write('swaps', id, swap)
	await changed()
}
export async function addFiles(list) {
	for (const file of list) await write('files', file.name, file)
	await changed()
}
export async function removeFile(name) {
	await write('files', name, null)
	for (const [id, swap] of swaps) if (swap.file === name) await write('swaps', id, null)
	await changed()
}
