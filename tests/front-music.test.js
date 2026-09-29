import { expect, test } from 'bun:test'
import { createMusic } from '../src/core/music.js'

test('front wind uses one looping voice, no timer, and releases all nodes on scene change', () => {
	const nodes = []
	const timers = []
	const node = () => {
		const value = {
			connect(next) {
				return next
			},
			disconnects: 0,
			disconnect() {
				this.disconnects++
			},
			stops: 0,
			stop() {
				this.stops++
			},
			start() {},
			gain: { value: 0 },
			frequency: { value: 0 },
		}
		nodes.push(value)
		return value
	}
	const context = {
		currentTime: 0,
		sampleRate: 60,
		createBuffer: (_channels, frames) => ({ getChannelData: () => new Float32Array(frames) }),
		createBufferSource: node,
		createBiquadFilter: node,
		createGain: node,
	}
	const music = createMusic(
		context,
		{},
		{
			startTimer: (tick) => {
				timers.push(tick)
				return timers.length
			},
			stopTimer() {},
		},
	)
	music.setScene('front')
	music.setEnabled(true)
	expect(nodes).toHaveLength(3)
	expect(nodes[0].loop).toBe(true)
	expect(timers).toHaveLength(0)
	music.setEnabled(true)
	expect(nodes).toHaveLength(3)
	music.setScene('silent')
	expect(nodes[0].stops).toBe(1)
	expect(nodes.every((n) => n.disconnects === 1)).toBe(true)
	music.setScene('front')
	expect(nodes).toHaveLength(6)
	music.dispose()
	expect(nodes[3].stops).toBe(1)
	expect(nodes.every((n) => n.disconnects === 1)).toBe(true)
})
