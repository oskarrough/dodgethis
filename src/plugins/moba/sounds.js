import { tune } from './tune.js'

// Use the shared mixer and mute policy, but no dodgeball combat presets.
export function createSounds(audio) {
	const sounds = { ...audio.sfx }
	for (const name of Object.keys(tune.sounds)) {
		sounds[name] = (point, gain = 1) =>
			audio.blip({ ...tune.sounds[name], gain: tune.sounds[name].gain * gain, point })
	}
	return sounds
}
