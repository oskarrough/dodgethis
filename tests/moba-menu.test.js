import { afterEach, beforeEach, expect, test } from 'bun:test'
import { createApp, STEP } from '../src/core/app.js'
import { createMatchMenu } from '../src/plugins/moba/menu.js'

let app, sim, menu, overlay, pad, nav, cancelled, cleared, target, oldWindow
beforeEach(() => {
	oldWindow = globalThis.window
	globalThis.window = new EventTarget()
	pad = { buttons: Array(17).fill(false) }
	nav = { move: 0, confirm: false }
	cancelled = []
	cleared = 0
	target = null
	overlay = {
		visible: false,
		card: null,
		show(card) {
			this.card = card
			this.visible = true
		},
		hide() {
			this.visible = false
		},
		handleGamepad(input) {
			if (input.confirm) this.card.actions[0].onSelect()
		},
	}
	app = createApp({
		overlay,
		audio: { setMusicScene() {} },
		input: { pad: () => pad, consumeMenuInput: () => nav },
	})
	app.modes.define('moba-front', {
		scheme: 'pointClick',
		start(run, { options }) {
			target = options.hero ? 'hero' : 'modes'
			return { snapshot: () => ({}), apply: () => false, validFact: () => false }
		},
	})
	app.modes.define('moba', {
		scheme: 'pointClick',
		start(run) {
			sim = {
				tick: 0,
				lane: { match: { winner: null } },
				heroes: [
					{ id: 'other', team: 'A' },
					{ id: 'me', team: 'B' },
				],
			}
			menu = createMatchMenu({
				app: {
					...app,
					intents: {
						...app.intents,
						cancel(id) {
							cancelled.push(id)
							app.intents.cancel(id)
						},
					},
				},
				run,
				sim,
				hero: sim.heroes.find((h) => h.id === 'me'),
				clearCamera: () => cleared++,
			})
			run.system('simulate', () => sim.tick++)
			run.system('present', menu.result)
			return { snapshot: () => ({ t: sim.tick }), apply: () => false, validFact: () => false }
		},
	})
	app.modes.start('moba')
})
afterEach(() => {
	app.dispose()
	if (oldWindow === undefined) delete globalThis.window
	else globalThis.window = oldWindow
})
const escape = (type = 'keydown') => {
	const event = new Event(type)
	Object.assign(event, { code: 'Escape', repeat: false })
	window.dispatchEvent(event)
}
test('pause freezes ticks, cancels the local seat, resumes by Esc or B without replaying held B', () => {
	app.frame(STEP)
	escape()
	expect(menu.frozen()).toBe(true)
	expect(overlay.card.actions.map((a) => a.label)).toEqual([
		'Resume',
		'Restart',
		'Hero select',
		'Modes',
	])
	expect(cancelled).toEqual(['me'])
	expect(cleared).toBe(1)
	const tick = sim.tick
	app.frame(1)
	expect(sim.tick).toBe(tick)
	escape('keyup')
	expect(menu.frozen()).toBe(true)
	pad.buttons[1] = true
	app.frame(STEP)
	expect(menu.frozen()).toBe(false)
	app.emit('menu')
	app.frame(STEP)
	expect(menu.frozen()).toBe(true)
	pad.buttons[1] = false
	app.frame(STEP)
	pad.buttons[1] = true
	app.frame(STEP)
	expect(menu.frozen()).toBe(false)
})
test.each([
	['A', 'DEFEAT'],
	['B', 'VICTORY'],
])('result %s is relative, cannot resume, stays frozen and restarts clean', (winner, title) => {
	sim.lane.match.winner = winner
	app.frame(STEP)
	expect(overlay.card.title).toBe(title)
	expect(overlay.card.actions.map((a) => a.label)).toEqual(['Again', 'Hero', 'Modes'])
	const old = sim
	for (let i = 0; i < 20; i++) app.frame(STEP)
	expect(old.tick).toBe(0)
	escape()
	app.emit('menu')
	expect(menu.frozen()).toBe(true)
	expect(overlay.card.title).toBe(title)
	nav.confirm = true
	app.frame(STEP)
	expect(sim).not.toBe(old)
	expect(sim.tick).toBeLessThanOrEqual(1)
	expect(menu.frozen()).toBe(false)
	expect(overlay.visible).toBe(false)
})
test.each([
	['Hero select', 'hero'],
	['Modes', 'modes'],
])('pause %s exits and disposes the overlay', (label, destination) => {
	escape()
	overlay.card.actions.find((a) => a.label === label).onSelect()
	expect(target).toBe(destination)
	expect(overlay.visible).toBe(false)
	expect(app.modes.active).toBe('moba-front')
})
test('fresh results offer hero and modes and no previous menu listener survives', () => {
	sim.lane.match.winner = 'B'
	app.frame(STEP)
	overlay.card.actions.find((a) => a.label === 'Hero').onSelect()
	expect(target).toBe('hero')
	escape()
	expect(overlay.visible).toBe(false)
})
