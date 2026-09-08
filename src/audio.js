import { tune } from './tune.js'
import { createMusic } from './music.js'

// Vite resolves these imports to hashed asset URLs at build time, so the files
// are fingerprinted and copied without any path juggling. The sample player
// below decodes each one into an AudioBuffer the first time it's needed.
import menuOpenUrl from './sfx/menu-open.mp3'
import menuCloseUrl from './sfx/menu-close.mp3'
import clickUrl from './sfx/click-1.mp3'
import click2Url from './sfx/click-2.mp3'
import clickSoftUrl from './sfx/click-soft.mp3'
import clickInUrl from './sfx/click-in.mp3'
import clickOutUrl from './sfx/click-out.mp3'
import tick1Url from './sfx/tick-1.mp3'
import tick2Url from './sfx/tick-2.mp3'
import unboxUrl from './sfx/unbox.mp3'
import botTalk1 from './sfx/bot-talk-1-v2.mp3'
import botTalk2 from './sfx/bot-talk-2-v2.mp3'
import botTalk3 from './sfx/bot-talk-3-v2.mp3'
import botTalk4 from './sfx/bot-talk-4-v2.mp3'
import botTalk5 from './sfx/bot-talk-5-v2.mp3'

const BOT_TALK = [botTalk1, botTalk2, botTalk3, botTalk4, botTalk5]

// Two audio sources share one context: the synth (oscillator blips, below) and
// a sample player (mp3s in ./sfx). The AudioContext can't start until a user
// gesture, so we lazily create it and resume + preload samples on the first
// pointer/key event. Both honour the same tune.fx.sound / tune.fx.volume gate.

let ctx = null
let master = null
let music = null
let musicScene = 'hub'
let musicEnabled = true
let gestureReceived = false
try {
	musicEnabled = globalThis.localStorage?.getItem('dodgethis.music') !== 'off'
} catch {
	/* Storage can be unavailable in private contexts. */
}

function syncMusic() {
	if (!gestureReceived || !ctx) return
	if (!music) music = createMusic(ctx, master, { volume: () => tune.fx.volume })
	music.setScene(musicScene)
	music.setEnabled(
		musicEnabled && tune.fx.sound && ctx.state === 'running' && !globalThis.document?.hidden,
	)
}

export function setMusicScene(scene) {
	musicScene = scene
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

function ac() {
	if (!ctx) {
		ctx = new (window.AudioContext || window['webkitAudioContext'])()
		master = ctx.createGain()
		master.gain.value = tune.fx.sound ? 1 : 0
		master.connect(ctx.destination)
		ctx.addEventListener?.('statechange', syncMusic)
	}
	return ctx
}

export function setSound(enabled) {
	tune.fx.sound = enabled
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

// --- Sample player ----------------------------------------------------------
// Decode each file once into an AudioBuffer (cached by URL); play it through a
// throwaway BufferSourceNode. Sources are one-shot, so overlapping retriggers
// need no pooling — each play() spins up a fresh node and lets it GC on end.

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
	])
		load(url).catch(() => {})
}

// gain is relative (multiplied by tune.fx.volume); rate sets the base playback
// speed (1 = original pitch), and rateJitter detunes it by ±frac so repeated
// cues don't sound mechanically identical.
async function sample(url, { gain = 1, rate = 1, rateJitter = 0, point = null } = {}) {
	if (!tune.fx.sound) return
	const generation = soundGeneration
	const c = ac()
	let buf
	try {
		buf = await load(url)
	} catch {
		return // decode/network failure — stay silent rather than throw into the game loop
	}
	if (!tune.fx.sound || generation !== soundGeneration) return
	const src = c.createBufferSource()
	src.buffer = buf
	const jitter = rateJitter ? (Math.random() * 2 - 1) * rateJitter : 0
	if (rate !== 1 || jitter) src.playbackRate.value = Math.max(0.05, rate + jitter)
	const g = c.createGain()
	const mix = spatialMix(point)
	g.gain.value = Math.max(0.0001, gain * tune.fx.volume * mix.gain)
	const panner = c.createStereoPanner()
	panner.pan.value = mix.pan
	src.connect(g).connect(panner).connect(master)
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

function blip({
	freq = 440,
	type = 'sine',
	dur = 0.12,
	gain = 0.2,
	slideTo = null,
	delay = 0,
	point = null,
}) {
	if (!tune.fx.sound) return
	const c = ac()
	const t0 = c.currentTime + delay
	const osc = c.createOscillator()
	const g = c.createGain()
	osc.type = type
	osc.frequency.setValueAtTime(freq, t0)
	if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur)
	const mix = spatialMix(point)
	const peak = Math.max(0.0001, gain * tune.fx.volume * mix.gain)
	g.gain.setValueAtTime(0.0001, t0)
	g.gain.exponentialRampToValueAtTime(peak, t0 + 0.005)
	g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
	const panner = c.createStereoPanner()
	panner.pan.value = mix.pan
	osc.connect(g).connect(panner).connect(master)
	osc.onended = () => {
		osc.disconnect()
		g.disconnect()
		panner.disconnect()
	}
	osc.start(t0)
	osc.stop(t0 + dur + 0.02)
}

let noiseBuffer = null
function scuff(point, dash = false) {
	if (!tune.fx.sound) return
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
	filter.Q.value = 0.7
	const now = c.currentTime
	const duration = dash ? 0.18 : 0.065
	filter.frequency.setValueAtTime(dash ? 800 : 550, now)
	filter.frequency.exponentialRampToValueAtTime(dash ? 2200 : 300, now + duration)
	const mix = spatialMix(point)
	const gain = c.createGain()
	gain.gain.setValueAtTime(0.0001, now)
	gain.gain.exponentialRampToValueAtTime(
		Math.max(0.0001, (dash ? 0.14 : 0.07) * tune.fx.volume * mix.gain),
		now + 0.008,
	)
	gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
	const pan = c.createStereoPanner()
	pan.pan.value = mix.pan
	source.connect(filter).connect(gain).connect(pan).connect(master)
	source.onended = () => {
		source.disconnect()
		filter.disconnect()
		gain.disconnect()
		pan.disconnect()
	}
	source.start(now)
	source.stop(now + duration)
}

export const sfx = {
	// Synth blips — punchy, time-critical, pitch-varied procedurally.
	// `gain` scales the default so enemy shots can read quieter than the player's own bow.
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
	// Portal: a downward suck-in sweep, then a rising pop-out on arrival.
	portal: () => {
		blip({ freq: 900, slideTo: 80, type: 'sawtooth', dur: 0.3, gain: 0.18 })
		blip({ freq: 160, slideTo: 900, type: 'square', dur: 0.22, gain: 0.16, delay: 0.3 })
	},

	// Sample-backed cues (mp3s in ./sfx) — the UI / character layer.
	grab: (point, gain = 1) => sample(unboxUrl, { gain: 0.6 * gain, rateJitter: 0.05, point }),
	menuOpen: () => sample(menuOpenUrl, { gain: 0.5 }),
	menuClose: () => sample(menuCloseUrl, { gain: 0.5 }),
	// Menu buttons: hover whisper, then a press/release pair (mouse) for a tactile
	// down→up feel; keyboard activation gets its own single click instead.
	hover: () => sample(clickSoftUrl, { gain: 0.3, rateJitter: 0.06 }),
	press: () => sample(clickInUrl, { gain: 0.45, rateJitter: 0.05 }),
	confirm: () => sample(clickOutUrl, { gain: 0.5, rateJitter: 0.05 }),
	click: () => sample(clickUrl, { gain: 0.45, rateJitter: 0.06 }),
	switch: () => sample(click2Url, { gain: 0.5, rateJitter: 0.05 }),
	// Charge-meter ratchet: pitch rises with the wind-up level (0→1), so the bow
	// audibly tightens. tickPerfect is the brighter cue for entering the band.
	tick: (level = 0) => sample(tick1Url, { gain: 0.3, rate: 0.85 + level * 0.9 }),
	tickPerfect: () => sample(tick2Url, { gain: 0.45, rate: 1.15 }),
	// At most one voice, including pending decodes, with space between phrases.
	taunt: async (point) => {
		if (!tune.fx.sound || tauntPlaying || performance.now() < nextTaunt) return
		tauntPlaying = true
		nextTaunt = performance.now() + 1200
		try {
			await sample(pick(BOT_TALK), { gain: 0.18, rateJitter: 0.08, point })
		} finally {
			tauntPlaying = false
		}
	},
}
