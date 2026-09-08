import { expect, test } from 'bun:test'
import { createMusic } from '../src/music.js'

function fixture() {
	const notes = []
	const timers = new Map()
	let timerId = 0
	const parameter = () => ({
		setValueAtTime() {},
		exponentialRampToValueAtTime() {},
		cancelScheduledValues() {},
		setTargetAtTime() {},
	})
	const node = (props = {}) => ({
		...props,
		connect(other) {
			return other
		},
		disconnect() {
			this.disconnected = true
		},
	})
	const context = {
		currentTime: 0,
		createGain: () => node({ gain: parameter() }),
		createOscillator() {
			const osc = node({
				frequency: parameter(),
				start(at) {
					this.at = at
					notes.push(this)
				},
				stop(at) {
					this.stopAt = at
				},
			})
			return osc
		},
	}
	const music = createMusic(context, node(), {
		startTimer(tick) {
			timers.set(++timerId, tick)
			return timerId
		},
		stopTimer(id) {
			timers.delete(id)
		},
	})
	return { music, context, timers, notes, tick: () => [...timers.values()].forEach((fn) => fn()) }
}

test('music is dormant until enabled, has one timer, and cancels queued voices on pause', () => {
	const { music, timers, notes } = fixture()
	expect(timers.size).toBe(0)
	expect(notes).toHaveLength(0)
	music.setEnabled(true)
	music.setEnabled(true)
	music.setScene('hub')
	expect(timers.size).toBe(1)
	expect(notes.length).toBeGreaterThan(0)
	music.setScene('paused')
	expect(timers.size).toBe(0)
	for (const osc of notes) expect(osc.stopAt).toBe(0.035)
	music.setScene('play')
	expect(timers.size).toBe(1)
	music.dispose()
	expect(timers.size).toBe(0)
})

test('long timer gaps and disable/resume skip elapsed music instead of scheduling a burst', () => {
	const { music, context, notes, tick } = fixture()
	music.setScene('clutch')
	music.setEnabled(true)
	let previous = notes.length
	context.currentTime = 200
	tick()
	expect(notes.length - previous).toBeLessThanOrEqual(2)
	for (const osc of notes.slice(previous)) expect(osc.at).toBeGreaterThan(200)
	music.setEnabled(false)
	previous = notes.length
	context.currentTime = 500
	music.setEnabled(true)
	expect(notes.length - previous).toBeLessThanOrEqual(2)
	for (const osc of notes.slice(previous)) expect(osc.at).toBeGreaterThan(500)
	music.dispose()
})

test('result music plays four notes once and releases its scheduler and finished nodes', () => {
	const { music, context, timers, notes, tick } = fixture()
	music.setScene('victory')
	music.setEnabled(true)
	for (let i = 1; i <= 40; i++) {
		context.currentTime = i * 0.05
		tick()
	}
	expect(notes).toHaveLength(4)
	expect(timers.size).toBe(0)
	music.setScene('victory')
	music.setEnabled(false)
	music.setEnabled(true)
	expect(notes).toHaveLength(4)
	for (const osc of notes) {
		osc.onended()
		expect(osc.disconnected).toBe(true)
	}
	music.dispose()
})
