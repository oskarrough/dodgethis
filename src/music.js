// A short Web Audio lookahead keeps the beat steady without scheduling a whole
// song ahead. Like Doodle's scheduler, a delayed tick skips missed notes.
const PROFILES = {
	hub: { bpm: 88, gain: 0.032 },
	play: { bpm: 120, gain: 0.045 },
	clutch: { bpm: 138, gain: 0.05 },
	victory: { bpm: 118, gain: 0.045 },
	defeat: { bpm: 88, gain: 0.032 },
}
const ROOTS = [48, 53, 57, 55]
const MELODY = [12, null, 16, 19, null, 16, 14, null]

export function createMusic(
	context,
	destination,
	{
		volume = () => 1,
		startTimer = (tick) => setInterval(tick, 50),
		stopTimer = clearInterval,
	} = {},
) {
	let scene = 'hub'
	let enabled = false
	let timer = null
	let step = 0
	let next = 0
	let finished = false
	const voices = new Set()

	function note(midi, at, duration, level, type = 'triangle') {
		const osc = context.createOscillator()
		const gain = context.createGain()
		osc.type = type
		osc.frequency.setValueAtTime(440 * 2 ** ((midi - 69) / 12), at)
		gain.gain.setValueAtTime(0.0001, at)
		gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, level * volume()), at + 0.012)
		gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
		osc.connect(gain).connect(destination)
		const voice = { osc, gain }
		voices.add(voice)
		osc.onended = () => {
			osc.disconnect()
			gain.disconnect()
			voices.delete(voice)
		}
		osc.start(at)
		osc.stop(at + duration + 0.02)
	}

	function tick() {
		const profile = PROFILES[scene]
		if (!enabled || !profile || finished) return
		const now = context.currentTime
		const eighth = 60 / profile.bpm / 2
		if (next < now - 0.2) next = now + 0.025
		while (next < now + 0.12) {
			const at = next
			const beat = step % 8
			const root = ROOTS[Math.floor(step / 8) % ROOTS.length]
			const level = profile.gain
			if (scene === 'victory' || scene === 'defeat') {
				const phrase = scene === 'victory' ? [60, 64, 67, 72] : [64, 62, 60, 55]
				note(phrase[step], at, eighth * 1.8, level)
				if (step === 3) {
					finished = true
					stopTimer(timer)
					timer = null
					return
				}
			} else {
				if (beat % (scene === 'hub' ? 4 : 2) === 0)
					note(root - 12 + (beat === 6 ? 7 : 0), at, eighth * 1.5, level * 0.85, 'sine')
				const melody = MELODY[beat]
				if (melody !== null && (scene !== 'hub' || beat % 2 === 0))
					note(root + melody, at, eighth * 1.1, level * 0.5)
				if (scene === 'clutch' && beat % 2 === 1)
					note(root + [12, 16, 19, 16][beat % 4], at, eighth * 0.5, level * 0.25)
			}
			step++
			next += eighth
		}
	}

	function stop() {
		if (timer !== null) stopTimer(timer)
		timer = null
		const now = context.currentTime
		for (const { osc, gain } of voices) {
			gain.gain.cancelScheduledValues(now)
			gain.gain.setTargetAtTime(0.0001, now, 0.008)
			osc.stop(now + 0.035)
		}
	}
	function start() {
		if (!enabled || !PROFILES[scene] || finished || timer !== null) return
		next = context.currentTime + 0.025
		timer = startTimer(tick)
		tick()
	}
	return {
		setScene(value) {
			if (value === scene) return
			stop()
			scene = value
			step = 0
			finished = false
			start()
		},
		setEnabled(value) {
			if (value === enabled) return
			enabled = value
			if (enabled) start()
			else stop()
		},
		dispose() {
			enabled = false
			stop()
		},
	}
}
