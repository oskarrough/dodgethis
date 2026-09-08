import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test'

const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
const oldFetch = globalThis.fetch
const sources = []
const parameter = () => ({
	value: 0,
	setValueAtTime(value) {
		this.value = value
	},
})
const node = (properties = {}) => ({
	...properties,
	connect(output) {
		this.output = output
		return output
	},
	disconnect() {},
})
class AudioContext {
	constructor() {
		this.destination = node()
		this.currentTime = 0
		this.state = 'running'
	}
	createGain() {
		return node({ gain: parameter() })
	}
	createStereoPanner() {
		return node({ pan: parameter() })
	}
	createBufferSource() {
		return node({
			playbackRate: parameter(),
			start() {
				sources.push(this)
			},
		})
	}
	async decodeAudioData() {
		return {}
	}
}
Object.defineProperty(globalThis, 'window', {
	configurable: true,
	value: Object.assign(new EventTarget(), { AudioContext }),
})
globalThis.fetch = async () => ({ arrayBuffer: async () => new ArrayBuffer(1) })
const { setAudioListener, spatialMix, setSound, sfx } = await import('../src/audio.js')
beforeEach(() => {
	sources.length = 0
	setSound(true)
	setAudioListener({ x: 0, z: 0 })
})
afterEach(() => {
	for (const source of sources) source.onended?.()
	setSound(false)
})
afterAll(() => {
	setSound(true)
	if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow)
	else delete globalThis.window
	globalThis.fetch = oldFetch
})

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

test('mute cancels pending decodes and silences the shared output of an active sample', async () => {
	const pending = sfx.grab({ x: 3, z: 0 })
	setSound(false)
	setSound(true)
	await pending
	expect(sources).toHaveLength(0)
	const playing = sfx.grab({ x: 3, z: 0 })
	await Bun.sleep(0)
	expect(sources).toHaveLength(1)
	const source = sources[0]
	const panner = source.output.output
	expect(panner.pan.value).toBeCloseTo(3 / 8, 6)
	setSound(false)
	expect(panner.output.gain.value).toBe(0)
	source.onended()
	await playing
})

test('a whole team requesting chatter produces one voice, not a decode/playback pile-up', async () => {
	const first = sfx.taunt({ x: -4, z: 0 })
	for (let i = 0; i < 20; i++) await sfx.taunt({ x: 4, z: 0 })
	await Bun.sleep(0)
	expect(sources).toHaveLength(1)
	expect(sources[0].output.output.pan.value).toBe(-0.5)
	sources[0].onended()
	await first
	await sfx.taunt({ x: 4, z: 0 }) // leave a gap even after a short phrase ends
	expect(sources).toHaveLength(1)
})
