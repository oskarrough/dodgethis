import { tune } from './tune.js'

// Use the shared mixer and mute policy, but no dodgeball combat presets.
export function createSounds(audio) {
	const sounds = { ...audio.sfx }
	for (const name of Object.keys(tune.sounds)) {
		sounds[name] = (point, gain = 1) =>
			audio.blip({ ...tune.sounds[name], gain: tune.sounds[name].gain * gain, point })
	}
	// A pea whistle: one short tweet per streak step (up to 3), then the long blast, each warbling between two pitches.
	sounds.whistle = (point, gain = 1, tweets = 1) => {
		const { freq, slideTo, type, dur, gain: level } = tune.sounds.whistle
		const { tweet, warble } = tune.out
		const half = Math.max(0.01, warble)
		let at = 0
		const blast = (length) => {
			for (let i = 0; i * half < length; i++)
				audio.blip({
					freq: i % 2 ? slideTo : freq,
					type,
					dur: half * 1.6,
					gain: level * gain,
					delay: at + i * half,
					point,
				})
			at += length + half * 2
		}
		for (let i = 0; i < Math.min(3, Math.max(1, tweets)); i++) blast(tweet)
		blast(dur)
	}
	// The corpse slaps the ground when its card fall ends, not when the fact arrives.
	sounds.cardSlap = (point, gain = 1) =>
		audio.blip({
			...tune.sounds.cardSlap,
			gain: tune.sounds.cardSlap.gain * gain,
			delay: tune.card.fall,
			point,
		})
	sounds.squeak = (point, gain = 1, pitch = 1) =>
		audio.blip({
			...tune.sounds.squeak,
			freq: tune.sounds.squeak.freq * pitch,
			slideTo: tune.sounds.squeak.slideTo * pitch,
			gain: tune.sounds.squeak.gain * gain,
			point,
		})
	return sounds
}
