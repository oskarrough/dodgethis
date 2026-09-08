import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test'

const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
const oldFetch = globalThis.fetch
const sources = []
const parameter = () => ({
	value: 0,
	setValueAtTime(value) {
		this.value = value
	},
	exponentialRampToValueAtTime(value) {
		this.peak = Math.max(this.peak ?? 0, value)
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
			stop() {},
		})
	}
	createOscillator() {
		return node({
			frequency: parameter(),
			start() {
				sources.push(this)
			},
			stop() {},
		})
	}
	createBiquadFilter() {
		return node({ frequency: parameter(), Q: parameter() })
	}
	createBuffer(channels, length) {
		return { getChannelData: () => new Float32Array(length) }
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

test('a thud drops in pitch and rises in volume with landing speed; a whoosh scales with closeness', () => {
	sfx.thud({ x: 0, z: 0 }, 3)
	sfx.thud({ x: 0, z: 0 }, 12)
	sfx.thud({ x: 0, z: 0 }, 40)
	expect(sources).toHaveLength(3)
	expect(sources[0].frequency.value).toBe(128)
	expect(sources[1].frequency.value).toBe(92)
	expect(sources[2].frequency.value).toBe(70) // clamped floor
	expect(sources[1].output.gain.peak).toBeGreaterThan(sources[0].output.gain.peak)
	sfx.thud({ x: 0, z: 0 }, 12, 0.4)
	expect(sources[3].output.gain.peak).toBeLessThan(sources[1].output.gain.peak)
	sfx.whoosh({ x: 4, z: 0 }, 0)
	sfx.whoosh({ x: 4, z: 0 }, 1)
	expect(sources).toHaveLength(6)
	expect(sources[4].output.frequency.value).toBe(1200) // bandpass sweep starts high
	expect(sources[5].output.output.gain.peak).toBeGreaterThan(sources[4].output.output.gain.peak)
	expect(sources[5].output.output.output.pan.value).toBe(0.5)
	sfx.close({ x: 0, z: 0 })
	expect(sources[6].frequency.value).toBe(1400)
})
