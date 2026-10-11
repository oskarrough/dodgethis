// Oskar's sound library (sounds/osk-sfx/, gitignored): decode any file to mono samples with ffmpeg and measure it
// with the board's numbers (docs/pages/sound/numbers.js), cached in sounds/numbers.json by size and mtime.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { measure } from '../docs/pages/sound/numbers.js'

export const LIBRARY = 'sounds/osk-sfx'
const CACHE = 'sounds/numbers.json'
export const RATE = 44100

export async function decode(path, rate = RATE) {
	const ffmpeg = Bun.spawn(
		['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', String(rate), '-'],
		{
			stdout: 'pipe',
		},
	)
	const bytes = new Uint8Array(await new Response(ffmpeg.stdout).arrayBuffer())
	return new Float32Array(bytes.buffer, 0, bytes.length >> 2)
}
export const asBuffer = (samples, rate = RATE) => ({
	sampleRate: rate,
	length: samples.length,
	numberOfChannels: 1,
	getChannelData: () => samples,
})

export function libraryFiles(dir = LIBRARY) {
	const out = []
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name)
		if (entry.isDirectory()) out.push(...libraryFiles(path))
		else if (/\.(wav|ogg|mp3|flac|m4a)$/i.test(entry.name)) out.push(path)
	}
	return out.sort()
}

// { 'impact/wood-light-001.ogg': numbers } for every library file, measuring only new or changed ones.
export async function libraryNumbers() {
	const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {}
	const files = libraryFiles()
	const todo = files.filter((path) => {
		const { size, mtimeMs } = statSync(path)
		return cache[relative(LIBRARY, path)]?.stamp !== `${size}:${mtimeMs}`
	})
	for (let i = 0; i < todo.length; i += 8)
		await Promise.all(
			todo.slice(i, i + 8).map(async (path) => {
				const { size, mtimeMs } = statSync(path)
				cache[relative(LIBRARY, path)] = {
					stamp: `${size}:${mtimeMs}`,
					numbers: measure(asBuffer(await decode(path))),
				}
			}),
		)
	const known = new Set(files.map((path) => relative(LIBRARY, path)))
	for (const key of Object.keys(cache)) if (!known.has(key)) delete cache[key]
	if (todo.length) writeFileSync(CACHE, JSON.stringify(cache))
	return Object.fromEntries(Object.entries(cache).map(([key, value]) => [key, value.numbers]))
}
