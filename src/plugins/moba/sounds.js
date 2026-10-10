import { look } from './look.js'

// Use the shared mixer and mute policy, but no dodgeball combat presets.
export function createSounds(audio) {
	const sounds = { ...audio.sfx }
	for (const name of Object.keys(look.sounds)) {
		sounds[name] = (point, gain = 1) =>
			audio.blip({ ...look.sounds[name], gain: look.sounds[name].gain * gain, point })
	}
	// A pea whistle: one short tweet per streak step (up to 3), then the long blast, each warbling between two pitches.
	sounds.whistle = (point, gain = 1, tweets = 1) => {
		const { freq, slideTo, type, dur, gain: level } = look.sounds.whistle
		const { tweet, warble } = look.out
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
			...look.sounds.cardSlap,
			gain: look.sounds.cardSlap.gain * gain,
			delay: look.card.fall,
			point,
		})
	sounds.squeak = (point, gain = 1, pitch = 1) =>
		audio.blip({
			...look.sounds.squeak,
			freq: look.sounds.squeak.freq * pitch,
			slideTo: look.sounds.squeak.slideTo * pitch,
			gain: look.sounds.squeak.gain * gain,
			point,
		})
	return sounds
}
