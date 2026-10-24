import { compile } from './jukebox/score.js'
import { createSynth } from './jukebox/synth.js'
import { AHEAD, feed, join } from './jukebox/player.js'

// A short Web Audio lookahead keeps the beat steady; a delayed tick skips missed notes.
const PROFILES = {
	lobby: { bpm: 88, gain: 0.032 },
	play: { bpm: 120, gain: 0.045 },
	clutch: { bpm: 138, gain: 0.05 },
	victory: { bpm: 118, gain: 0.045 },
	defeat: { bpm: 88, gain: 0.032 },
}
// Scenes scored in Oskar's jukebox (scripts/sync-jukebox.js copies them to public/music/), by scene.
export const SONGS = {
	theme: 'dodgethis-theme',
	altamesa: 'altamesa',
	overthrow: 'overthrow',
	flagfall: 'flagfall',
}
const SONG_LEVEL = 0.22 // the jukebox mixes hot; this sits it under the effects
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
	let scene = 'lobby'
	let enabled = false
	let timer = null
	let step = 0
	let next = 0
	let finished = false
	const voices = new Set()
	let wind = null
	let jukebox = null // { synth, level }, made on the first song
	let song = null // the playing song: { song, session, start, cue }
	let wanted = 0 // bumps on every start and stop, so a song that loads late stays quiet
	const loaded = new Map() // file → Promise<compiled song>

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
				if (beat % (scene === 'lobby' ? 4 : 2) === 0)
					note(root - 12 + (beat === 6 ? 7 : 0), at, eighth * 1.5, level * 0.85, 'sine')
				const melody = MELODY[beat]
				if (melody !== null && (scene !== 'lobby' || beat % 2 === 0))
					note(root + melody, at, eighth * 1.1, level * 0.5)
				if (scene === 'clutch' && beat % 2 === 1)
					note(root + [12, 16, 19, 16][beat % 4], at, eighth * 0.5, level * 0.25)
			}
			step++
			next += eighth
		}
	}

	function load(file) {
		let p = loaded.get(file)
		if (!p) {
			p = fetch(`/music/${file}.song`)
				.then((r) => r.text())
				.then(compile)
				.catch((err) => {
					loaded.delete(file)
					throw err
				})
			loaded.set(file, p)
		}
		return p
	}

	function startSong(file) {
		const ask = ++wanted
		load(file)
			.then((compiled) => {
				if (ask !== wanted || !enabled) return
				if (!jukebox) {
					const level = context.createGain()
					level.connect(destination)
					const synth = createSynth(context, level)
					synth.out.gain.value = 0.6
					jukebox = { synth, level }
				}
				jukebox.level.gain.setValueAtTime(SONG_LEVEL * volume(), context.currentTime)
				jukebox.synth.warm(compiled)
				const now = context.currentTime
				song = {
					song: compiled,
					session: jukebox.synth.session(compiled),
					...join(compiled, 0, now + 0.05),
				}
				const tick = () => feed(song, context.currentTime + AHEAD, context.currentTime)
				timer = startTimer(tick)
				tick()
			})
			.catch(() => {
				/* No song, no music; the game plays on. */
			})
	}

	function stop() {
		wanted++
		if (song) {
			song.session.stop(0.25)
			song = null
		}
		if (wind) {
			wind.source.stop()
			wind.source.disconnect()
			wind.filter.disconnect()
			wind.gain.disconnect()
			wind = null
		}
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
		if (!enabled || finished || timer !== null || wind || song) return
		if (SONGS[scene]) return startSong(SONGS[scene])
		if (scene === 'wind') {
			const buffer = context.createBuffer(1, context.sampleRate * 4, context.sampleRate)
			const samples = buffer.getChannelData(0)
			for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1
			const source = context.createBufferSource()
			source.buffer = buffer
			source.loop = true
			const filter = context.createBiquadFilter()
			filter.type = 'lowpass'
			filter.frequency.value = 180
			const gain = context.createGain()
			gain.gain.value = 0.055 * volume()
			source.connect(filter).connect(gain).connect(destination)
			source.start()
			wind = { source, filter, gain }
			return
		}
		if (!PROFILES[scene]) return
		next = context.currentTime + 0.025
		timer = startTimer(tick)
		tick()
	}
	return {
		refreshVolume() {
			if (wind) wind.gain.gain.setValueAtTime(0.055 * volume(), context.currentTime)
			if (jukebox) jukebox.level.gain.setValueAtTime(SONG_LEVEL * volume(), context.currentTime)
		},
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
