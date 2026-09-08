import { expect, test } from 'bun:test'
import { setAudioListener, spatialMix } from '../src/audio.js'

test('world cues pan left/right and attenuate with distance; UI stays centered', () => {
	expect(spatialMix(null)).toEqual({ pan: 0, gain: 1 })
	expect(spatialMix({ x: 8, z: 0 }).pan).toBe(0.8)
	expect(spatialMix({ x: -8, z: 0 }).pan).toBe(-0.8)
	expect(spatialMix({ x: 0, z: 28 }).gain).toBeLessThan(spatialMix({ x: 0, z: 3 }).gain)
	const listener = { x: 4, z: 2 }
	setAudioListener(listener)
	listener.x = 100 // listener position was copied
	expect(spatialMix({ x: 4, z: 2 })).toEqual({ pan: 0, gain: 1 })
})
