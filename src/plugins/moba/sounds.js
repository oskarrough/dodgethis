import { look } from './look.js'
import { uses } from './sound-table.js'
import { registerVoices, swapOf, voiceNamed } from '../../core/sound-swap.js'

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
	registerVoices(sounds)
	// The voice key a use plays now, so one sound plays once per tick however many uses set it off.
	sounds.voiceOf = (id) => {
		const swap = swapOf(id)
		if (swap) return swap.kept ? `kept:${swap.kept}` : swap.file ? `file:${swap.file}` : swap.voice
		return uses[id]?.voice ?? (uses[id] ? id : undefined)
	}
	sounds.play = (id, point, gain = 1, ...extra) => playUse(audio, id, point, gain, ...extra)
	return sounds
}

// Play a use from the sound table (sound-table.js): the board's swap or a kept file, else its voice, recipe or player.
export function playUse(audio, id, point = null, gain = 1, ...extra) {
	if (audio.swapped(id, point, gain, ...extra)) return
	const use = uses[id]
	if (use?.voice) voiceNamed(use.voice)?.(point, gain, ...extra)
	else if (use?.recipe) {
		const recipe = use.recipe()
		audio.blip({ ...recipe, gain: recipe.gain * gain, point })
	} else use?.play?.(audio, point, gain)
}
