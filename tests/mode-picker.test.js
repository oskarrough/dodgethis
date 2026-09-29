import { expect, test } from 'bun:test'
import { createApp } from '../src/core/app.js'
import modePicker from '../src/plugins/mode-picker/index.js'

function withPicker(check, destinations = {}) {
	const originals = Object.fromEntries(
		['document', 'location', 'history'].map((key) => [key, globalThis[key]]),
	)
	const buttons = ['dodgeball', 'moba'].map((mode) =>
		Object.assign(new EventTarget(), {
			dataset: { mode, description: mode },
			attributes: {},
			setAttribute(key, value) {
				this.attributes[key] = value
			},
			focus() {
				document.activeElement = this
			},
			blur() {
				document.activeElement = null
			},
		}),
	)
	const root = Object.assign(new EventTarget(), {
		querySelectorAll: () => buttons,
		contains: (element) => buttons.includes(element),
	})
	globalThis.document = { querySelector: () => root, activeElement: null }
	globalThis.location = { href: 'https://example.test/?debug&mode=dodgeball#court' }
	let replaced
	globalThis.history = {
		replaceState: (_state, _title, url) => {
			replaced = url
		},
	}
	let starts = 0
	let stops = 0
	const app = createApp({ audio: { sfx: { hover() {}, switch() {} } } })
	for (const mode of ['dodgeball', 'moba', 'moba-front', 'moba-replay'])
		app.modes.define(mode, {
			scheme: mode === 'moba' ? 'pointClick' : 'direct',
			start(run) {
				starts++
				run.signal.addEventListener('abort', () => stops++)
				return { snapshot: () => ({}), apply: () => true, validFact: () => true }
			},
		})
	app.modes.start('dodgeball')
	app.use((scope) => modePicker(scope, destinations))
	try {
		check({ app, buttons, root, counts: () => ({ starts, stops }), url: () => replaced })
	} finally {
		app.dispose()
		for (const [key, value] of Object.entries(originals)) {
			if (value === undefined) delete globalThis[key]
			else globalThis[key] = value
		}
	}
}

test('picker switches runs, updates selection and preserves unrelated URL state', () =>
	withPicker(({ app, buttons, counts, url }) => {
		expect(buttons[0].attributes['aria-pressed']).toBe('true')
		buttons[0].dispatchEvent(new Event('click'))
		expect(counts()).toEqual({ starts: 1, stops: 0 })
		buttons[1].dispatchEvent(new Event('click'))
		expect(app.modes.active).toBe('moba')
		expect(counts()).toEqual({ starts: 2, stops: 1 })
		expect(buttons.map((b) => b.attributes['aria-pressed'])).toEqual(['false', 'true'])
		expect(url().searchParams.has('debug')).toBe(true)
		expect(url().searchParams.get('mode')).toBe('moba')
		expect(url().hash).toBe('#court')
		buttons[0].dispatchEvent(new Event('click'))
		expect(app.modes.active).toBe('dodgeball')
		expect(counts()).toEqual({ starts: 3, stops: 2 })
	}))

test('shared matches cannot be switched and leaving restores the picker', () =>
	withPicker(({ app, buttons, counts }) => {
		app.modes.start('dodgeball', {
			session: { local: ['local'], authoritative: true, shared: true, actions: [] },
		})
		app.frame(0)
		expect(buttons.every((b) => b.disabled)).toBe(true)
		buttons[1].dispatchEvent(new Event('click'))
		expect(app.modes.active).toBe('dodgeball')
		expect(counts()).toEqual({ starts: 2, stops: 1 })
		app.modes.start('dodgeball')
		app.frame(0)
		expect(buttons.every((b) => !b.disabled)).toBe(true)
	}))

test('picker arrow navigation keeps gameplay keys out of the window and disposes listeners', () =>
	withPicker(({ app, buttons, root, counts }) => {
		buttons[0].focus()
		const key = Object.assign(new Event('keydown', { bubbles: true, cancelable: true }), {
			key: 'ArrowRight',
		})
		root.dispatchEvent(key)
		expect(document.activeElement).toBe(buttons[1])
		expect(key.defaultPrevented).toBe(true)
		app.dispose()
		const before = counts()
		buttons[1].dispatchEvent(new Event('click'))
		expect(counts()).toEqual(before)
		expect(root.hidden).toBe(true)
	}))

test('picker opens the MOBA menu and keeps MOBA selected in matches and replays', () =>
	withPicker(
		({ app, buttons, counts, url }) => {
			buttons[1].dispatchEvent(new Event('click'))
			expect(app.modes.active).toBe('moba-front')
			expect(url().searchParams.get('mode')).toBe('moba')
			for (const mode of ['moba-front', 'moba', 'moba-replay']) {
				app.modes.start(mode)
				app.frame(0)
				expect(buttons.map((b) => b.attributes['aria-pressed'])).toEqual(['false', 'true'])
				const before = counts()
				buttons[1].dispatchEvent(new Event('click'))
				expect(counts()).toEqual(before)
			}
			buttons[0].dispatchEvent(new Event('click'))
			expect(app.modes.active).toBe('dodgeball')
		},
		{ moba: 'moba-front' },
	))
