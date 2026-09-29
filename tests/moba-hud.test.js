import { expect, test } from 'bun:test'
import { createHud } from '../src/plugins/moba/hud.js'
import { createSounds } from '../src/plugins/moba/sounds.js'
import { tune } from '../src/plugins/moba/tune.js'

// The HUD's text contract without a browser: count actual DOM writes.
function element() {
	let value = ''
	return {
		writes: 0,
		get textContent() {
			return value
		},
		set textContent(text) {
			value = text
			this.writes++
		},
		style: { setProperty() {} },
		classList: { add() {}, remove() {} },
		remove() {},
		append() {},
	}
}
test('Momentum text follows live tuning and unchanged HUD frames do not rewrite it', () => {
	const previous = globalThis.document
	const old = tune.momentum.reduction
	const health = element(),
		help = element()
	const slots = Array.from({ length: 3 }, () => {
		const slot = element(),
			key = element(),
			left = element()
		slot.querySelector = (selector) => (selector === '.key' ? key : left)
		return slot
	})
	globalThis.document = {
		head: element(),
		body: element(),
		createElement() {
			const node = element()
			node.querySelectorAll = () => slots
			node.querySelector = (selector) => (selector === '.moba-health' ? health : help)
			return node
		},
	}
	const hud = createHud()
	const frame = {
		cooldowns: [0, 0, 0],
		totals: [4, 3, 6],
		device: 'keyboard',
		pausedNow: false,
		hp: 1400,
		maxHp: 1400,
		respawn: null,
	}
	try {
		hud.update(0, frame)
		expect(health.textContent).toContain('Vault by 2 s')
		hud.update(0, frame)
		expect(health.writes).toBe(1)
		tune.momentum.reduction = 1.25
		hud.update(0, frame)
		expect(health.textContent).toContain('Vault by 1.25 s')
		expect(health.writes).toBe(2)
		hud.update(0, { ...frame, respawn: 7.6 })
		hud.update(0, { ...frame, respawn: 7.4 })
		expect(health.textContent).toBe('Respawn in 8 s')
		expect(health.writes).toBe(3)
	} finally {
		hud.dispose()
		tune.momentum.reduction = old
		if (previous === undefined) delete globalThis.document
		else globalThis.document = previous
	}
})

test('MOBA combat cues have separate synth presets and read tuning live', () => {
	const calls = []
	const sounds = createSounds({ sfx: { step() {} }, blip: (options) => calls.push(options) })
	const point = { x: 2, z: 3 }
	for (const name of Object.keys(tune.sounds)) sounds[name](point)
	expect(calls).toHaveLength(Object.keys(tune.sounds).length)
	expect(new Set(calls.map((c) => `${c.freq}:${c.slideTo}:${c.type}:${c.dur}`)).size).toBe(
		Object.keys(tune.sounds).length,
	)
	expect(calls.every((c) => c.point === point)).toBe(true)
	const old = tune.sounds.attack.freq
	try {
		tune.sounds.attack.freq = 990
		sounds.attack(point, 0.5)
		expect(calls.at(-1).freq).toBe(990)
		expect(calls.at(-1).gain).toBe(tune.sounds.attack.gain * 0.5)
	} finally {
		tune.sounds.attack.freq = old
	}
})
