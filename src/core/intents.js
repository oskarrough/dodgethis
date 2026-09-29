// Intents (docs/plugin-architecture.md, line 3): devices become one plain frame per participant per step, and modes read only frames.
// DOM-free: the browser shell hands the kernel a device, and a scheme binds that device to the action vocabulary.

export const ACTIONS = Object.freeze([
	'primary',
	'dash',
	'jump',
	'stop',
	'cancel',
	'slot1',
	'slot2',
	'slot3',
	'slot4',
	'slot5',
])

// How long (seconds of simulation) an unconsumed press stays in the frame. Unlisted actions last one step.
const SLOT_WINDOW = 0.15
export const SCHEMES = Object.freeze({
	direct: Object.freeze({ windows: Object.freeze({ dash: 0.1, jump: 0.1 }) }),
	pointClick: Object.freeze({
		windows: Object.freeze({
			slot1: SLOT_WINDOW,
			slot2: SLOT_WINDOW,
			slot3: SLOT_WINDOW,
			slot4: SLOT_WINDOW,
			slot5: SLOT_WINDOW,
			primary: SLOT_WINDOW,
		}),
	}),
})

const MAX_EDGES = 16
const LIMIT = 1000
const point = (p) =>
	!!p &&
	typeof p === 'object' &&
	Number.isFinite(p.x) &&
	Number.isFinite(p.z) &&
	Math.abs(p.x) <= LIMIT &&
	Math.abs(p.z) <= LIMIT
const pointOrNull = (p) => p === null || point(p)
const plain = (o) => !!o && typeof o === 'object' && !Array.isArray(o)

export const neutralFrame = () => ({
	move: { x: 0, z: 0 },
	order: null,
	aim: null,
	held: {},
	pressed: [],
	released: [],
})

// An untrusted frame, checked whole: finite points, a move no longer than 1, and only known actions.
export function validIntent(frame) {
	if (!plain(frame) || !point(frame.move) || Math.hypot(frame.move.x, frame.move.z) > 1.001)
		return false
	if (!pointOrNull(frame.order) || !pointOrNull(frame.aim) || !plain(frame.held)) return false
	if (!Object.entries(frame.held).every(([a, v]) => ACTIONS.includes(a) && v === true)) return false
	if (!Array.isArray(frame.pressed) || frame.pressed.length > MAX_EDGES) return false
	if (!frame.pressed.every((e) => plain(e) && ACTIONS.includes(e.action) && pointOrNull(e.at)))
		return false
	if (!Array.isArray(frame.released) || frame.released.length > MAX_EDGES) return false
	return frame.released.every((a) => ACTIONS.includes(a))
}

// The `direct` scheme: WASD or the left stick moves, the pointer's ground point aims, the button is primary, Shift dashes, Space jumps.
// `device` is core/input.js (or a fake); `ground()` returns the pointer's ground point or null.
export function direct(device, ground) {
	const aim = ground()
	const at = aim && { x: aim.x, z: aim.z }
	const pressed = []
	const slot = device.consumeSlot()
	if (slot) pressed.push({ action: slot, at })
	if (device.consumePress()) pressed.push({ action: 'primary', at })
	if (device.consumeDash()) pressed.push({ action: 'dash', at })
	if (device.consumeJump()) pressed.push({ action: 'jump', at })
	const move = device.moveVector()
	return {
		move: { x: move.x, z: move.z },
		order: null,
		aim: at,
		held: device.pointerDown() ? { primary: true } : {},
		pressed,
		released: device.consumeRelease() ? ['primary'] : [],
	}
}

// The `pointClick` scheme. Mouse: RMB orders at the cursor (again every `resend` ms while held), Q W E R Z quick-cast at the cursor, S stops.
// Pad: the left stick moves; RB RT LB LT hold to aim (`held.slotN`) and cast on release; X mounts, A attacks, B cancels a held cast.
// `stickAim(dir, magnitude, slot)` is the mode's: it turns the right stick into a ground point (dir null when the stick rests).
export const POINT_CLICK = { deadzone: 0.18, curve: 1.5, resend: 100 }
const KEYS = {
	KeyQ: 'slot1',
	KeyW: 'slot2',
	KeyE: 'slot3',
	KeyR: 'slot4',
	KeyZ: 'slot5',
	KeyS: 'stop',
}
const PAD_AIMS = [
	[5, 'slot1'],
	[7, 'slot2'],
	[4, 'slot3'],
	[6, 'slot4'],
]
const PAD_TAPS = [
	[0, 'primary'],
	[2, 'slot5'],
]

// A radial deadzone, the usable range rescaled to 0–1 and bent by `curve`: fine steering near the centre, full speed at the rim.
export function stickVector(x, z, deadzone, curve = 1) {
	const len = Math.hypot(x, z)
	if (len <= deadzone) return { x: 0, z: 0, magnitude: 0 }
	const magnitude = ((Math.min(len, 1) - deadzone) / (1 - deadzone)) ** curve
	return { x: (x / len) * magnitude, z: (z / len) * magnitude, magnitude }
}

// Returns a sampler with its own edge state. `device` is core/input.js (or a fake), `ground()` the cursor's ground point or null.
export function pointClick(device, ground, options = POINT_CLICK) {
	const aiming = new Set() // pad slots held to aim, in press order
	let previous = []
	let resendAt = 0

	return function sample(stickAim = null) {
		// Direct-only edges must not pile up for the next mode that reads them.
		device.consumeSlot()
		device.consumePress()
		device.consumeRelease()
		device.consumeDash()
		device.consumeJump()
		const pad = device.pad()
		const buttons = pad?.buttons ?? []
		const down = (i) => !!buttons[i] && !previous[i]
		const up = (i) => !buttons[i] && !!previous[i]
		const onPad = device.activeDevice() === 'gamepad'
		const stick = pad
			? stickVector(pad.axes[0] ?? 0, pad.axes[1] ?? 0, options.deadzone, options.curve)
			: null
		const cursor = ground()
		const at = cursor && { x: cursor.x, z: cursor.z }

		const pressed = []
		if (!pad) aiming.clear() // a lost pad or a blur drops held aims without casting
		for (const [i, slot] of PAD_AIMS)
			if (down(i)) {
				aiming.delete(slot) // re-adding moves it last: the newest held aim is the one shown
				aiming.add(slot)
			}
		if (down(1)) {
			aiming.clear()
			pressed.push({ action: 'cancel', at: null })
		}
		const slot = [...aiming].at(-1) ?? null
		let aim = at
		if (onPad) {
			const right = pad ? stickVector(pad.axes[2] ?? 0, pad.axes[3] ?? 0, options.deadzone) : null
			const raw = pad ? Math.min(1, Math.hypot(pad.axes[2] ?? 0, pad.axes[3] ?? 0)) : 0
			const dir = right?.magnitude
				? { x: right.x / right.magnitude, z: right.z / right.magnitude }
				: null
			const point = stickAim?.(dir, dir ? raw : 0, slot)
			aim = point ? { x: point.x, z: point.z } : null
		}
		for (const [i, action] of PAD_AIMS)
			if (up(i) && aiming.delete(action)) pressed.push({ action, at: aim })
		for (const [i, action] of PAD_TAPS) if (down(i)) pressed.push({ action, at: aim })
		for (const code of device.consumeKeys())
			if (KEYS[code]) pressed.push({ action: KEYS[code], at: KEYS[code] === 'stop' ? null : at })
		previous = buttons.slice()

		let order = null
		const now = device.now()
		if (device.consumeOrder() || (device.orderDown() && now >= resendAt)) {
			order = at
			resendAt = now + options.resend
		}
		return {
			move: stick ? { x: stick.x, z: stick.z } : { x: 0, z: 0 },
			order,
			aim,
			held: Object.fromEntries([...aiming].map((a) => [a, true])),
			pressed,
			released: [],
		}
	}
}

// The frame store. Continuous fields are overwritten by each device sample; edges queue until a step consumes them or their window closes.
// An order point is an edge too: it stays until the next step has seen it, so a 144 Hz screen cannot drop one between steps.
// A step sees an action pressed and released at once; `held` then says which came last.
export function createIntents() {
	const slots = new Map()
	let windows = SCHEMES.direct.windows

	function slot(id) {
		let s = slots.get(id)
		if (!s) slots.set(id, (s = { frame: neutralFrame(), ages: [], suspended: false }))
		return s
	}
	function push(s, edge) {
		if (s.frame.pressed.length >= MAX_EDGES) return
		s.frame.pressed.push(edge)
		s.ages.push(0)
	}
	function clear(s) {
		const f = s.frame
		f.move = { x: 0, z: 0 }
		f.order = null
		f.held = {}
		f.pressed.length = 0
		f.released.length = 0
		s.ages.length = 0
	}
	function remove(s, i) {
		s.frame.pressed.splice(i, 1)
		s.ages.splice(i, 1)
	}

	return {
		use(scheme) {
			if (!SCHEMES[scheme]) throw new Error(`Unknown scheme: ${scheme}`)
			windows = SCHEMES[scheme].windows
		},
		get: (id) => slot(id).frame,
		// Merge one sample. A suspended sample only moves the aim, and entering suspension cancels.
		feed(id, sample, suspended = false) {
			const s = slot(id)
			if (suspended) {
				if (!s.suspended) {
					s.suspended = true
					clear(s)
					push(s, { action: 'cancel', at: null })
				}
				s.frame.aim = sample.aim
				return
			}
			s.suspended = false
			const f = s.frame
			f.move = sample.move
			if (sample.order) f.order = sample.order
			f.aim = sample.aim
			f.held = sample.held
			for (const edge of sample.pressed) push(s, edge)
			for (const action of sample.released)
				if (!f.released.includes(action)) f.released.push(action)
		},
		// Queue a press that came from somewhere other than the device, like a HUD button.
		press(id, action, at = null) {
			if (!ACTIONS.includes(action)) throw new Error(`Unknown action: ${action}`)
			push(slot(id), { action, at })
		},
		// The mode acknowledges that a buffered press took effect.
		consume(id, action) {
			const s = slots.get(id)
			const i = s ? s.frame.pressed.findIndex((e) => e.action === action) : -1
			if (i >= 0) remove(s, i)
		},
		// Take every pending edge at once, for code that runs per frame rather than per step.
		drain(id) {
			const s = slot(id)
			const f = s.frame
			const taken = { ...f, pressed: f.pressed.slice(), released: f.released.slice() }
			f.order = null
			f.pressed.length = 0
			f.released.length = 0
			s.ages.length = 0
			return taken
		},
		// After each simulation step: age presses past their window and forget releases.
		age(dt) {
			for (const s of slots.values()) {
				for (let i = s.ages.length - 1; i >= 0; i--) {
					s.ages[i] += dt
					if (s.ages[i] >= (windows[s.frame.pressed[i].action] ?? 0) - 1e-9) remove(s, i)
				}
				s.frame.released.length = 0
				s.frame.order = null
			}
		},
		// Drop everything held or queued and queue one cancel, e.g. when a modal takes the input. No id means every participant.
		cancel(id) {
			for (const s of id === undefined ? slots.values() : [slot(id)]) {
				clear(s)
				push(s, { action: 'cancel', at: null })
			}
		},
	}
}
