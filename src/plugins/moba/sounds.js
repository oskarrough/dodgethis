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
		if (swap?.shuffle) return `shuffle:${id}`
		if (swap)
			return swap.kept ? `kept:${swap.kept}` : swap.library ? `library:${swap.library}` : swap.voice
		return uses[id]?.voice ?? (uses[id] ? id : undefined)
	}
	sounds.play = (id, ...rest) => playUse(audio, id, ...rest)
	sounds.playOwn = (id, ...rest) => playOwn(audio, id, ...rest)
	return sounds
}

// Play a use from the sound table (sound-table.js): the board's swap or a kept file, else its voice, recipe or player.
// A hero use plays on the `mine` bus when it's yours (`playOwn`: the fact names you), else on `others`.
export const playUse = (audio, id, point, gain, ...extra) =>
	play(audio, false, id, point, gain, ...extra)
export const playOwn = (audio, id, point, gain, ...extra) =>
	play(audio, true, id, point, gain, ...extra)
function play(audio, own, id, point = null, gain = 1, ...extra) {
	const use = uses[id]
	if (!use) return
	audio.onBus(use.bus === 'hero' ? (own ? 'mine' : 'others') : use.bus, () => {
		if (audio.swapped(id, point, gain, ...extra)) return
		if (use.voice) voiceNamed(use.voice)?.(point, gain, ...extra)
		else if (use.recipe) {
			const recipe = use.recipe()
			audio.blip({ ...recipe, gain: recipe.gain * gain, point })
		} else use.play?.(audio, point, gain)
	})
}
