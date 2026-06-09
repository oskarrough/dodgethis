import { tune } from './tune.js'

// Tiny WebAudio synth — no asset files, just oscillator blips. The AudioContext
// can't start until a user gesture, so we lazily create it and resume on the
// first pointer/key event. Each cue is a short envelope on one oscillator.

let ctx = null

function ac() {
	if (!ctx) ctx = new (window.AudioContext || window['webkitAudioContext'])()
	return ctx
}

const resume = () => {
	if (ctx && ctx.state === 'suspended') ctx.resume()
}
window.addEventListener('pointerdown', () => {
	ac()
	resume()
})
window.addEventListener('keydown', () => {
	ac()
	resume()
})

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
	loose: () => blip({ freq: 360, slideTo: 150, type: 'sawtooth', dur: 0.16, gain: 0.16 }),
	grab: () => blip({ freq: 520, slideTo: 780, type: 'triangle', dur: 0.08, gain: 0.14 }),
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
}
