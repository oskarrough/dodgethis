import { tune } from './tune.js'

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

function ac() {
	if (!ctx) ctx = new (window.AudioContext || window['webkitAudioContext'])()
	return ctx
}

const resume = () => {
	if (ctx && ctx.state === 'suspended') ctx.resume()
}
function wake() {
	ac()
	resume()
	preload() // warm the decode cache so the first real cue has no lag
}
window.addEventListener('pointerdown', wake)
window.addEventListener('keydown', wake)

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
async function sample(url, { gain = 1, rate = 1, rateJitter = 0 } = {}) {
	if (!tune.fx.sound) return
	const c = ac()
	let buf
	try {
		buf = await load(url)
	} catch {
		return // decode/network failure — stay silent rather than throw into the game loop
	}
	if (!tune.fx.sound) return // re-check: the toggle may have flipped during the await
	const src = c.createBufferSource()
	src.buffer = buf
	const jitter = rateJitter ? (Math.random() * 2 - 1) * rateJitter : 0
	if (rate !== 1 || jitter) src.playbackRate.value = Math.max(0.05, rate + jitter)
	const g = c.createGain()
	g.gain.value = Math.max(0.0001, gain * tune.fx.volume)
	src.connect(g).connect(c.destination)
	src.start()
}

const pick = (arr) => arr[(Math.random() * arr.length) | 0]

function blip({ freq = 440, type = 'sine', dur = 0.12, gain = 0.2, slideTo = null }) {
	if (!tune.fx.sound) return
	const c = ac()
	const t0 = c.currentTime
	const osc = c.createOscillator()
	const g = c.createGain()
	osc.type = type
	osc.frequency.setValueAtTime(freq, t0)
	if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur)
	const peak = Math.max(0.0001, gain * tune.fx.volume)
	g.gain.setValueAtTime(0.0001, t0)
	g.gain.exponentialRampToValueAtTime(peak, t0 + 0.005)
	g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
	osc.connect(g).connect(c.destination)
	osc.start(t0)
	osc.stop(t0 + dur + 0.02)
}

export const sfx = {
	// Synth blips — punchy, time-critical, pitch-varied procedurally.
	// `gain` scales the default so enemy shots can read quieter than the player's own bow.
	loose: (gain = 1) =>
		blip({ freq: 360, slideTo: 150, type: 'sawtooth', dur: 0.16, gain: 0.16 * gain }),
	hit: () => blip({ freq: 200, slideTo: 55, type: 'square', dur: 0.22, gain: 0.3 }),
	// A bright two-note chime for a perfectly-timed charge release.
	perfect: () =>
		[880, 1320].forEach((f, i) =>
			setTimeout(() => blip({ freq: f, type: 'triangle', dur: 0.14, gain: 0.18 }), i * 70),
		),
	// Low rumble for a bowl loosed along the ground.
	roll: () => blip({ freq: 120, slideTo: 70, type: 'sawtooth', dur: 0.3, gain: 0.18 }),
	win: () =>
		[523, 659, 784, 1047].forEach((f, i) =>
			setTimeout(() => blip({ freq: f, type: 'triangle', dur: 0.2, gain: 0.2 }), i * 120),
		),
	// Menu cursor-move blip — a short square wave, very handheld (D-pad thunk).
	nav: () => blip({ freq: 660, type: 'square', dur: 0.05, gain: 0.12 }),
	// Portal: a downward suck-in sweep, then a rising pop-out on arrival.
	portal: () => {
		blip({ freq: 900, slideTo: 80, type: 'sawtooth', dur: 0.3, gain: 0.18 })
		setTimeout(() => blip({ freq: 160, slideTo: 900, type: 'square', dur: 0.22, gain: 0.16 }), 300)
	},

	// Sample-backed cues (mp3s in ./sfx) — the UI / character layer.
	grab: () => sample(unboxUrl, { gain: 0.6, rateJitter: 0.05 }),
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
	// Random enemy chatter — one of five bot-talk variants, detuned for variety.
	// Quiet enough to sit under the action; every enemy shot triggers one, so a
	// full team firing at once can otherwise pile up.
	taunt: () => sample(pick(BOT_TALK), { gain: 0.18, rateJitter: 0.08 }),
}
