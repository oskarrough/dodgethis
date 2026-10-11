// Oskar's sound library (sounds/osk-sfx/, gitignored, mirrored from his Dropbox): decode any file to mono samples
// with ffmpeg, measure it with the board's numbers (docs/pages/sound/numbers.js), cached in sounds/numbers.json by
// size and mtime, and build each sound's shortlist.
import { execFileSync } from 'node:child_process'
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

export function libraryFiles(directory = LIBRARY) {
	const output = []
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name)
		if (entry.isDirectory()) output.push(...libraryFiles(path))
		else if (/\.(wav|ogg|mp3|flac|m4a)$/i.test(entry.name)) output.push(path)
	}
	return output.sort()
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

// Shortlists: score each library file for a use by what its name says (the use itself, its part, its source's
// family in docs/sound.md) and by the rules (front-loaded, short in a fight), then match its level to the built-in
// sound, and keep the top five per use with siblings in a source sharing a family, not a file.
const USE = {
	step: /footstep/,
	squeak: /scratch|slide|squeak/,
	out: /whistle|attention|hightone|beep/,
	death: /drop|plank|wood-heavy|book|soft-heavy/,
	shove: /punch|soft|cloth|woosh/,
	dunk: /water|drop|plunger|cork|bubble|splash/,
	'dunk.splash': /water|splash|bubble|drop/,
	xp: /collectible|coin|pop/,
	levelUp: /powerup|win|level|confirm/,
	globe: /collectible|powerup|pop|bubble/,
	matchOver: /win|lose|hooray/,
	ballWarn: /attention|question|beep|alarm/,
	ballSpawn: /spawn|powerup|teleport|cloud/,
	ballContested: /error|glitch|scratch/,
	ballChannel: /powerup|phaser|charge|rising/,
	ballInterrupted: /error|cancel|lowdown|close/,
	ballDenied: /error|reject|back|deny/,
	ballPickup: /collectible|grab|pop|glass/,
	ballWindup: /phaserup|rising|charge|woosh/,
	ballThrow: /throw|woosh|swish|laser/,
	ballGoal: /win|bell|powerup|hooray/,
	ballBounce: /bounce|glass|tap|pop/,
	ballDrop: /drop|glass/,
	ballPop: /pop|glass|cork/,
	structureDown: /heavy|mining|lose/,
	blocked: /block|metal|plate|tin/,
	shielded: /glass|bell|metal-light|shield/,
	nearMiss: /woosh|swish|tick/,
	'nearMiss.passed': /woosh|swish/,
	boardExpired: /close|lowdown|error/,
	caught: /grab|catch|soft|punch/,
	catchExpired: /lowdown|close|cancel/,
	channelCancelled: /error|cancel|back|lowdown/,
	channelEnd: /confirm|powerup|bell/,
	'ui.hover': /hover/,
	'ui.press': /click-in|press|tap/,
	'ui.confirm': /click-out|confirm/,
	'ui.click': /click/,
	'ui.nav': /tick|tap/,
	'ui.switch': /switch|toggle|enable/,
	'ui.menuOpen': /menu-open|maximize|pop-up-on|\/open-\d/,
	'ui.menuClose': /menu-close|minimize|pop-up-off|\/close-\d/,
	'splash.move': /tick|hover|tap/,
	'splash.enter': /confirm|enter|start/,
	'splash.deny': /error|reject|deny|back/,
	'splash.mode': /switch|confirm/,
	'descent.back': /back|close/,
	'descent.drop': /woosh|drop|lowdown|slide/,
	'descent.arrival': /landing|drop|thud|soft-heavy/,
	'lobby.start': /confirm|start|powerup/,
	'lobby.back': /back|close/,
	'lobby.inspectOpen': /menu-open|maximize|bookopen|bookflip/,
	'lobby.inspectClose': /menu-close|minimize|bookclose/,
	'lobby.pick': /confirm|select|pick/,
	'lobby.pickDenied': /error|reject|deny/,
	'lobby.readyWalk': /tick|tap/,
	'lobby.seatEnter': /confirm|switch/,
	'lobby.seatReady': /confirm|win|powerup/,
	'lobby.readyCancel': /back|cancel|close/,
	'lobby.galleryShot': /throw|laser|zap|pepsound/,
	'lobby.galleryPick': /confirm|collectible/,
	'lobby.magnetClack': /metal|click|clack|tin/,
	'lobby.magnetThud': /thud|metal-heavy|plate|drop/,
	'lobby.magnetLeap': /jump|woosh|rising/,
}
const PART = {
	shot: /throw|sword|woosh|swish|laser|zap|shoot|pepsound|phaser/,
	hit: /impact\/|hit|punch|slap|bite|chop|knife|smack|thud|knock/,
	cast: /woosh|swish|cloth|belt|draw|charge|phaserup|powerup|rising|knife/,
}
const FAMILY = {
	Fletcher: /wood|plank|pluck|string|knife|arrow/,
	Mitts: /soft|punch|leather|cloth|slap|drop/,
	'P. Pong': /tin|plate|tap|pop|cork/,
	Structures: /metal|plate|bell|mining|tin-medium/,
	Ball: /glass|bell/,
	Minions: /generic|monster|wood-light|soft-medium/,
	'Basic attack': /punch|hit|attack|generic/,
	Menus: /tap\/|click|hover|switch\/|open-close|popup|scroll/,
	'Splash and descent': /confirm|popup|tap\/|switch\/|digital|slide|error\/back/,
	Lobby: /confirm|popup|tap\/|switch\/|beep|misc\/|error\//,
}
const CALM = ['Menus', 'Lobby', 'Splash and descent', 'Music', 'Progress']
const SKIP = /^(ambience|instruments|voice\/bot-talk|readouts)\//
const partOf = (id) =>
	id.endsWith('.shot')
		? 'shot'
		: id.endsWith('.cast')
			? 'cast'
			: /\.(hit|impact)$|Hit$/.test(id)
				? 'hit'
				: null

// rows: [{ id, source, numbers }] of the built-in sounds; writes and returns sounds/shortlists.json.
export async function writeShortlists(rows) {
	const library = await libraryNumbers()
	const path = 'sounds/shortlists.json'
	const lists = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}
	const taken = new Map() // source → files near the top of a sibling use's list
	for (const { id, source, numbers: built } of rows) {
		const hint = USE[id] ?? PART[partOf(id)]
		const fight = !CALM.includes(source)
		const scored = Object.entries(library)
			.filter(([file, numbers]) => numbers && !SKIP.test(file))
			.map(([file, numbers]) => {
				const why = []
				let score = 0
				if (hint?.test(file)) {
					score += USE[id] ? 4 : 3
					why.push(USE[id] ? 'name fits' : partOf(id))
				}
				if (FAMILY[source]?.test(file)) {
					score += 2
					why.push(`${source} family`)
				}
				if (numbers.attack > 25) score -= Math.min(4, numbers.attack / 25)
				if (fight && numbers.tail > 400) score -= 2
				if (numbers.length > (fight ? 700 : 1500)) score -= 2
				if (numbers.peak < -45) score -= 1
				if (taken.get(source)?.has(file)) score -= 1.5
				const gain = built
					? Math.min(1.5, Math.max(0.05, 10 ** ((built.rms - numbers.rms) / 20) / 0.6))
					: 0.5
				return {
					file,
					score,
					gain: Math.round(gain * 20) / 20,
					why: why.join(', ') || 'numbers only',
				}
			})
			.sort((a, b) => b.score - a.score || library[a.file].attack - library[b.file].attack)
		const stems = new Map()
		lists[id] = scored
			.filter(({ file }) => {
				const stem = file.replace(/-?\d+\.\w+$/, '')
				stems.set(stem, (stems.get(stem) ?? 0) + 1)
				return stems.get(stem) <= 2
			})
			.slice(0, 5)
		if (!taken.has(source)) taken.set(source, new Set())
		for (const candidate of lists[id].slice(0, 2)) taken.get(source).add(candidate.file)
	}
	writeFileSync(path, JSON.stringify(lists, null, '\t'))
	return lists
}

// `bun run sound:sync`: mirror the library from Dropbox, measure new files and rebuild every shortlist.
export const DROPBOX = `${process.env.HOME}/Dropbox/Rough Resources/Sounds/osk-sfx/`
if (import.meta.main) {
	execFileSync('rsync', ['-a', '--delete', DROPBOX, `${LIBRARY}/`])
	const builtins = existsSync('sounds/builtins.json')
		? JSON.parse(readFileSync('sounds/builtins.json', 'utf8'))
		: []
	const lists = await writeShortlists(builtins.filter((row) => row.numbers))
	console.log(
		`${Object.keys(await libraryNumbers()).length} library files; shortlists for ${Object.keys(lists).length} sounds.`,
	)
}
