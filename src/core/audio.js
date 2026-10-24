import { tune } from './tune.js'
import { createMusic } from './music.js'
import {
	keptUrl,
	kept,
	mixOf,
	onSwapChange,
	registerVoices,
	swapOf,
	swapUrl,
	voiceNamed,
} from './sound-swap.js'

// Shipped samples are Oskar's library files (sounds/osk-sfx/) as Ogg in public/sfx/kept/; the player below
// decodes each into an AudioBuffer on first use.
const menuOpenUrl = '/sfx/kept/open-close--menu-open.ogg'
const menuCloseUrl = '/sfx/kept/open-close--menu-close.ogg'
const clickUrl = '/sfx/kept/tap--click-012.ogg'
const click2Url = '/sfx/kept/tap--click-013.ogg'
const clickSoftUrl = '/sfx/kept/tap--click-soft.ogg'
const clickInUrl = '/sfx/kept/tap--click-in.ogg'
const clickOutUrl = '/sfx/kept/tap--click-out.ogg'
const tick1Url = '/sfx/kept/tap--tick-004.ogg'
const tick2Url = '/sfx/kept/tap--tick-005.ogg'
const unboxUrl = '/sfx/kept/misc--unbox.ogg'
const botTalk1 = '/sfx/kept/voice--bot-talk-001.ogg'
const botTalk2 = '/sfx/kept/voice--bot-talk-002.ogg'
const botTalk3 = '/sfx/kept/voice--bot-talk-003.ogg'
const botTalk4 = '/sfx/kept/voice--bot-talk-004.ogg'
const botTalk5 = '/sfx/kept/voice--bot-talk-005.ogg'

const BOT_TALK = [botTalk1, botTalk2, botTalk3, botTalk4, botTalk5]

// One context serves the synth (below) and the ./sfx sample player; it lazy-starts on the first user gesture, gated by tune.output.sound / tune.output.volume.

let ctx = null
let master = null
let buses = null // bus name → GainNode into master (tune.mix)
let music = null
let musicScene = 'lobby'
let musicEnabled = true
let gestureReceived = false
try {
	musicEnabled = globalThis.localStorage?.getItem('dodgethis.music') !== 'off'
} catch {
	/* Storage can be unavailable in private contexts. */
}

export function syncMusic() {
	if (!gestureReceived || !ctx) return
	if (!music) music = createMusic(ctx, buses.music, { volume: () => tune.output.volume })
	music.refreshVolume()
	music.setScene(musicScene)
	music.setEnabled(
		musicEnabled && tune.output.sound && ctx.state === 'running' && !globalThis.document?.hidden,
	)
}

export function setMusicScene(scene) {
	musicScene = scene
	syncMusic()
}
// The sound board previews a scene (null for silence) without touching the saved music preference.
export function previewMusic(scene) {
	musicEnabled = !!scene
	if (scene) musicScene = scene
	syncMusic()
}
export function setMusicEnabled(enabled) {
	musicEnabled = !!enabled
	try {
		globalThis.localStorage?.setItem('dodgethis.music', musicEnabled ? 'on' : 'off')
	} catch {
		/* The preference still works for this session. */
	}
	syncMusic()
}
export function isMusicEnabled() {
	return musicEnabled
}
globalThis.document?.addEventListener?.('visibilitychange', syncMusic)
globalThis.window?.addEventListener('pagehide', () => music?.setEnabled(false))
globalThis.window?.addEventListener('pageshow', syncMusic)
let soundGeneration = 0
const listener = { x: 0, z: 0 }
let tauntPlaying = false
let nextTaunt = 0

export function setAudioListener(position) {
	listener.x = position?.x ?? 0
	listener.z = position?.z ?? 0
}

// The fixed overview camera's right axis is world +X. UI cues stay centered.
export function spatialMix(point) {
	if (!point) return { pan: 0, gain: 1 }
	const dx = point.x - listener.x
	const dz = point.z - listener.z
	return {
		pan: Math.max(-0.8, Math.min(0.8, dx / 8)),
		gain: 1 / (1 + Math.hypot(dx, dz) / 14),
	}
}

// The mix bus: every sound plays on the bus `onBus` names (world when nothing does), each a gain into master.
const BUSES = ['ui', 'mine', 'others', 'world', 'music']
const mix = (key) => mixOf()[key] ?? tune.mix[key]
function wire(context) {
	const out = context.createGain()
	out.connect(context.destination)
	const named = {}
	for (const name of BUSES) {
		named[name] = context.createGain()
		named[name].gain.value = mix(name)
		named[name].connect(out)
	}
	return [out, named]
}
onSwapChange(() => {
	if (buses) for (const name of BUSES) buses[name].gain.setValueAtTime(mix(name), ctx.currentTime)
})

let bus = 'world'
let capped = true
const started = { ui: [], mine: [], others: [], world: [] }
let plays = 0
// Play on one bus: past its cap the sound is dropped; a fight sound ducks the music under it.
export function onBus(name, play) {
	plays++
	if (capped && started[name]) {
		const now = performance.now() / 1000
		const recent = started[name].filter((at) => now - at < mix('capWindow'))
		if (recent.length >= (mix('caps')[name] ?? Infinity)) return
		started[name] = [...recent, now]
	}
	if (name !== 'ui' && name !== 'music' && buses && ctx) {
		const gain = buses.music.gain
		const now = ctx.currentTime
		gain.cancelScheduledValues(now)
		gain.setValueAtTime(gain.value, now)
		gain.setTargetAtTime(mix('music') * mix('duck'), now, 0.02)
		gain.setTargetAtTime(mix('music'), now + 0.15, mix('duckRelease') / 3)
	}
	const was = bus
	bus = name
	try {
		return play()
	} finally {
		bus = was
	}
}

function ac() {
	if (!ctx) {
		ctx = new (window.AudioContext || window['webkitAudioContext'])()
		;[master, buses] = wire(ctx)
		master.gain.value = tune.output.sound ? 1 : 0
		ctx.addEventListener?.('statechange', syncMusic)
	}
	return ctx
}

export function setSound(enabled) {
	tune.output.sound = enabled
	if (!enabled) soundGeneration++ // cancel pending decodes even if unmuted before they finish
	if (master) master.gain.setValueAtTime(enabled ? 1 : 0, ctx.currentTime)
	syncMusic()
}

const resume = () => {
	if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}) // browser gesture policy
}
function wake() {
	gestureReceived = true
	ac()
	resume()
	syncMusic()
	preload() // warm the decode cache so the first real cue has no lag
}
globalThis.window?.addEventListener('pointerdown', wake)
globalThis.window?.addEventListener('keydown', wake)

// Decode per URL into a cached AudioBuffer; each play() uses a fresh one-shot BufferSourceNode, so no pooling.

const buffers = new Map() // url -> Promise<AudioBuffer>

function load(url) {
	let p = buffers.get(url)
	if (!p) {
		p = fetch(url)
			.then((r) => r.arrayBuffer())
			.then((b) => ac().decodeAudioData(b))
			.catch((err) => {
				buffers.delete(url) // let a later play() retry instead of caching the failure
				throw err
			})
		buffers.set(url, p)
	}
	return p
}

let preloaded = false
function preload() {
	if (preloaded) return
	preloaded = true
	for (const url of [
		menuOpenUrl,
		menuCloseUrl,
		clickUrl,
		click2Url,
		clickSoftUrl,
		clickInUrl,
		clickOutUrl,
		tick1Url,
		tick2Url,
		unboxUrl,
		...BOT_TALK,
		...Object.values(kept)
			.flatMap((swap) => swap.shuffle ?? [swap])
			.filter((swap) => swap.kept)
			.map((swap) => keptUrl(swap.kept)),
	])
		load(url).catch((error) => console.warn('audio: preload failed:', error))
}

// gain is relative (× tune.output.volume); rate sets base playback speed/pitch; rateJitter detunes by ±frac so repeats don't sound mechanical.
export async function sample(url, { gain = 1, rate = 1, rateJitter = 0, point = null } = {}) {
	if (!tune.output.sound) return
	const generation = soundGeneration
	const c = ac()
	const out = buses[bus]
	let buf
	try {
		buf = await load(url)
	} catch {
		return // decode/network failure — stay silent rather than throw into the game loop
	}
	if (!tune.output.sound || generation !== soundGeneration) return
	const src = c.createBufferSource()
	src.buffer = buf
	const jitter = rateJitter ? (Math.random() * 2 - 1) * rateJitter : 0
	if (rate !== 1 || jitter) src.playbackRate.value = Math.max(0.05, rate + jitter)
	const g = c.createGain()
	const mix = spatialMix(point)
	g.gain.value = Math.max(0.0001, gain * tune.output.volume * mix.gain)
	const panner = c.createStereoPanner()
	panner.pan.value = mix.pan
	src.connect(g).connect(panner).connect(out)
	return new Promise((resolve) => {
		src.onended = () => {
			src.disconnect()
			g.disconnect()
			panner.disconnect()
			resolve()
		}
		src.start()
	})
}

const pick = (arr) => arr[(Math.random() * arr.length) | 0]

export function blip({
	freq = 440,
	type = 'sine',
	dur = 0.12,
	gain = 0.2,
	slideTo = null,
	delay = 0,
	point = null,
}) {
	if (!tune.output.sound) return
	const c = ac()
	const t0 = c.currentTime + delay
	const osc = c.createOscillator()
	const g = c.createGain()
	osc.type = type
	osc.frequency.setValueAtTime(freq, t0)
	if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur)
	const mix = spatialMix(point)
	const peak = Math.max(0.0001, gain * tune.output.volume * mix.gain)
	g.gain.setValueAtTime(0.0001, t0)
	g.gain.exponentialRampToValueAtTime(peak, t0 + 0.005)
	g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
	const panner = c.createStereoPanner()
	panner.pan.value = mix.pan
	osc.connect(g).connect(panner).connect(buses[bus])
	osc.onended = () => {
		osc.disconnect()
		g.disconnect()
		panner.disconnect()
	}
	osc.start(t0)
	osc.stop(t0 + dur + 0.02)
}

let noiseBuffer = null
// Bandpass-filtered white noise swept from `from` to `to` Hz over `dur`; the one shared buffer serves every scuff, dash and whoosh.
function noise({ point = null, from, to, dur, gain: level, q = 0.7 }) {
	if (!tune.output.sound) return
	const c = ac()
	if (!noiseBuffer) {
		noiseBuffer = c.createBuffer(1, Math.ceil(c.sampleRate * 0.25), c.sampleRate)
		const samples = noiseBuffer.getChannelData(0)
		for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1
	}
	const source = c.createBufferSource()
	source.buffer = noiseBuffer
	const filter = c.createBiquadFilter()
	filter.type = 'bandpass'
	filter.Q.value = q
	const now = c.currentTime
	filter.frequency.setValueAtTime(from, now)
	filter.frequency.exponentialRampToValueAtTime(to, now + dur)
	const mix = spatialMix(point)
	const gain = c.createGain()
	gain.gain.setValueAtTime(0.0001, now)
	gain.gain.exponentialRampToValueAtTime(
		Math.max(0.0001, level * tune.output.volume * mix.gain),
		now + 0.008,
	)
	gain.gain.exponentialRampToValueAtTime(0.0001, now + dur)
	const pan = c.createStereoPanner()
	pan.pan.value = mix.pan
	source.connect(filter).connect(gain).connect(pan).connect(buses[bus])
	source.onended = () => {
		source.disconnect()
		filter.disconnect()
		gain.disconnect()
		pan.disconnect()
	}
	source.start(now)
	source.stop(now + dur)
}
function scuff(point, dash = false) {
	noise(
		dash
			? { point, from: 800, to: 2200, dur: 0.18, gain: 0.14 }
			: { point, from: 550, to: 300, dur: 0.065, gain: 0.07 },
	)
}

export const sfx = {
	// Synth blips — punchy, time-critical; `gain` scales the default (e.g. enemy shots quieter than the player's bow).
	loose: (gain = 1, point) =>
		blip({ freq: 360, slideTo: 150, type: 'sawtooth', dur: 0.16, gain: 0.16 * gain, point }),
	hit: (point) => blip({ freq: 200, slideTo: 55, type: 'square', dur: 0.22, gain: 0.3, point }),
	land: (point) => blip({ freq: 160, slideTo: 95, type: 'triangle', dur: 0.06, gain: 0.06, point }),
	deflect: (point) =>
		blip({ freq: 900, slideTo: 350, type: 'triangle', dur: 0.1, gain: 0.12, point }),
	fall: (point) => blip({ freq: 180, slideTo: 35, type: 'sine', dur: 0.35, gain: 0.2, point }),
	dash: (point) => {
		blip({ freq: 220, slideTo: 100, type: 'triangle', dur: 0.06, gain: 0.05, point })
		scuff(point, true)
	},
	step: (point) => scuff(point),
	splash: (point, gain = 1) =>
		noise({ point, from: 2600, to: 380, dur: 0.25, gain: 0.22 * gain, q: 0.5 }),
	// An arrow zipping past your ear: a falling noise sweep, louder the closer it came (closeness 0..1).
	whoosh: (point, closeness = 1) =>
		noise({
			point,
			from: 1200,
			to: 300,
			dur: 0.12,
			gain: 0.06 + 0.16 * Math.max(0, Math.min(1, closeness)),
			q: 1.2,
		}),
	// Short bright tick when your own arrow nearly hits someone.
	close: (point) =>
		blip({ freq: 1400, slideTo: 900, type: 'triangle', dur: 0.05, gain: 0.1, point }),
	// Player feet hitting the court: a low blip whose pitch drops with impact speed.
	thud: (point, speed = 3, gain = 1) => {
		const s = Math.max(0, speed)
		blip({
			freq: Math.max(70, Math.min(140, 140 - s * 4)),
			type: 'triangle',
			dur: 0.07,
			gain: (0.05 + 0.07 * Math.min(1, s / 12)) * gain,
			point,
		})
	},
	// A bright two-note chime for a perfectly-timed charge release.
	perfect: (point) =>
		[880, 1320].forEach((f, i) =>
			blip({ freq: f, type: 'triangle', dur: 0.14, gain: 0.18, delay: i * 0.07, point }),
		),
	// Low rumble for a bowl loosed along the ground.
	roll: (point) => blip({ freq: 120, slideTo: 70, type: 'sawtooth', dur: 0.3, gain: 0.18, point }),
	win: () =>
		[523, 659, 784, 1047].forEach((f, i) =>
			blip({ freq: f, type: 'triangle', dur: 0.2, gain: 0.2, delay: i * 0.12 }),
		),
	// Menu cursor-move blip — a short square wave, very handheld (D-pad thunk).
	nav: () => blip({ freq: 660, type: 'square', dur: 0.05, gain: 0.12 }),
	portal: () => {
		blip({ freq: 900, slideTo: 80, type: 'sawtooth', dur: 0.3, gain: 0.18 })
		blip({ freq: 160, slideTo: 900, type: 'square', dur: 0.22, gain: 0.16, delay: 0.3 })
	},

	// Sample-backed cues (Ogg files in public/sfx/kept/) — the UI / character layer.
	grab: (point, gain = 1) => sample(unboxUrl, { gain: 0.6 * gain, rateJitter: 0.05, point }),
	menuOpen: () => sample(menuOpenUrl, { gain: 0.5 }),
	menuClose: () => sample(menuCloseUrl, { gain: 0.5 }),
	// Menu buttons: hover whisper + mouse press/release pair; keyboard gets a single click.
	hover: () => sample(clickSoftUrl, { gain: 0.3, rateJitter: 0.06 }),
	press: () => sample(clickInUrl, { gain: 0.45, rateJitter: 0.05 }),
	confirm: () => sample(clickOutUrl, { gain: 0.5, rateJitter: 0.05 }),
	click: () => sample(clickUrl, { gain: 0.45, rateJitter: 0.06 }),
	switch: () => sample(click2Url, { gain: 0.5, rateJitter: 0.05 }),
	// Charge-meter ratchet: pitch rises with wind-up level (0→1); tickPerfect marks entering the band.
	tick: (level = 0) => sample(tick1Url, { gain: 0.3, rate: 0.85 + level * 0.9 }),
	tickPerfect: () => sample(tick2Url, { gain: 0.45, rate: 1.15 }),
	// At most one voice, including pending decodes, with space between phrases.
	taunt: async (point) => {
		if (!tune.output.sound || tauntPlaying || performance.now() < nextTaunt) return
		tauntPlaying = true
		nextTaunt = performance.now() + 1200
		try {
			await sample(pick(BOT_TALK), { gain: 0.18, rateJitter: 0.08, point })
		} finally {
			tauntPlaying = false
		}
	},
}
registerVoices(sfx)

// Render sounds into an OfflineAudioContext instead of the speakers, for their numbers (pages/sound/numbers.js).
// `play` runs while the offline context stands in for the live one; `warm` lists sample URLs to decode first.
export async function render(play, { seconds = 2, rate = 44100, warm = [] } = {}) {
	preload()
	await Promise.all(
		[...warm.map(load), ...buffers.values()].map((p) =>
			p.catch((error) => console.warn('audio: render sample failed:', error)),
		),
	)
	const live = [ctx, master, buses, tune.output.sound]
	const offline = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate)
	ctx = offline
	;[master, buses] = wire(offline)
	tune.output.sound = true
	capped = false
	try {
		play()
		await new Promise((resolve) => setTimeout(resolve)) // samples start once their cached decode resolves
	} finally {
		;[ctx, master, buses, tune.output.sound] = live
		capped = true
	}
	return offline.startRendering()
}

// A use the sound board swapped or kept (./sound-swap.js) plays that instead; returns whether it did.
// A shuffle plays one of its sounds at random, never the same one twice in a row.
const shuffled = new Map() // use id → last pick
export function swapped(id, point = null, gain = 1, ...extra) {
	let swap = swapOf(id)
	if (!swap) return false
	if (swap.shuffle?.length) {
		const count = swap.shuffle.length
		let pick = Math.floor(Math.random() * count)
		if (count > 1 && pick === shuffled.get(id)) pick = (pick + 1) % count
		shuffled.set(id, pick)
		swap = swap.shuffle[pick]
	}
	const url = swapUrl(swap)
	if (url) sample(url, { gain: (swap.gain ?? 0.5) * gain, point })
	else voiceNamed(swap.voice)?.(point, gain, ...extra)
	return true
}

// Menu sounds are uses too (`ui.<name>` in the sound table), so the board can swap them.
export function ui(name) {
	onBus('ui', () => swapped(`ui.${name}`) || sfx[name]())
}

// Every button answers a click: one whose handler played nothing gets `ui.confirm`. `data-quiet` on a button or
// its parent opts out, for buttons whose sound lands later (a fact on the next tick) or tools that should stay silent.
export function clickSounds() {
	window.addEventListener(
		'click',
		(event) => {
			const button = event.target.closest?.('button')
			if (!button || button.closest('[data-quiet], .tuner')) return
			const before = plays
			setTimeout(() => plays === before && ui('confirm'))
		},
		true,
	)
}
