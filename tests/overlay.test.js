import { expect, test } from 'bun:test'
import { createOverlay } from '../src/core/overlay.js'
import { tune } from '../src/core/tune.js'

test('guarded cards keep Resume under a stationary pointer, ignore Space, and accept deliberate navigation', () => {
	const oldWindow = globalThis.window,
		oldDocument = globalThis.document,
		oldSound = tune.output.sound
	globalThis.window = new EventTarget()
	tune.output.sound = false
	class Element extends EventTarget {
		constructor() {
			super()
			this.children = []
			this.hidden = true
			this.dataset = {}
			this.style = { setProperty() {}, removeProperty() {} }
			const classes = new Set()
			this.classList = {
				toggle: (value, on) => (on ? classes.add(value) : classes.delete(value)),
				remove: (value) => classes.delete(value),
				contains: (value) => classes.has(value),
			}
		}
		setAttribute() {}
		append(...nodes) {
			this.children.push(...nodes)
		}
		replaceChildren(...nodes) {
			this.children = nodes
		}
		focus() {
			document.activeElement = this
			this.dispatchEvent(new Event('focus'))
		}
		querySelector(selector) {
			return this.children.find((child) => child.className === selector.slice(1))
		}
	}
	const root = new Element(),
		outside = new Element()
	globalThis.document = {
		activeElement: outside,
		body: { children: [root, outside] },
		querySelector: () => root,
		createElement: () => new Element(),
	}
	const key = (code) => {
		const event = new Event('keydown', { cancelable: true })
		Object.assign(event, { code, repeat: false })
		window.dispatchEvent(event)
		return event
	}
	try {
		const overlay = createOverlay()
		const selected = []
		const show = () =>
			overlay.show({
				title: 'PAUSED',
				pointerGuard: true,
				spaceConfirm: false,
				actions: ['Resume', 'Hero select'].map((label) => ({
					label,
					onSelect: () => selected.push(label),
				})),
			})
		show()
		const buttons = root.children[0].children.at(-1).children
		buttons[1].dispatchEvent(new Event('pointerenter'))
		expect(buttons[0].classList.contains('selected')).toBe(true)
		expect(key('Space').defaultPrevented).toBe(true)
		expect(selected).toEqual([])
		key('Enter')
		expect(selected).toEqual(['Resume'])
		buttons[1].dispatchEvent(new Event('pointermove'))
		key('Enter')
		expect(selected).toEqual(['Resume', 'Hero select'])
		show()
		expect(document.activeElement).toBe(root.children[0].children.at(-1).children[0])
		key('ArrowRight')
		key('Enter')
		expect(selected.at(-1)).toBe('Hero select')
		overlay.hide()
		expect(outside.inert).toBe(false)
		overlay.show({ actions: [{ label: 'Default', onSelect: () => selected.push('Default') }] })
		key('Space')
		expect(selected.at(-1)).toBe('Default')
		overlay.hide()
	} finally {
		globalThis.window = oldWindow
		globalThis.document = oldDocument
		tune.output.sound = oldSound
	}
})
