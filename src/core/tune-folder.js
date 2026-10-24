// Hand-made controls for a tune section, for values that need more than the registry infers: a
// label, a range, an onChange, a list of choices, a button. The verbs follow lil-gui's, which this
// replaced: folder.add(object, key, min | choices, max, step).name(…).onChange(…), addColor, addFolder.
// Each control is a registry entry the Tuner can drive.

const hex = (n) => `#${Math.round(n).toString(16).padStart(6, '0')}`
const numberHex = { toHexString: hex, fromHexString: (h) => parseInt(h.slice(1), 16) }
const stringHex = { toHexString: (v) => v, fromHexString: (h) => h }

function control(path, object, property, extra = {}) {
	const changes = []
	const initialValue = object[property]
	const run = typeof initialValue === 'function' ? () => initialValue.call(object) : undefined
	const c = {
		path: `${path}/${property}`,
		object,
		property,
		label: String(property),
		unit: typeof initialValue === 'boolean' ? 'bool' : undefined,
		initialValue,
		run,
		...extra,
		getValue: () => object[property],
		setValue(v) {
			if (object[property] === v) return c
			object[property] = v
			for (const fn of changes) fn(v)
			return c
		},
		reset: () => c.setValue(initialValue),
		name(label) {
			c.label = label
			return c
		},
		onChange(fn) {
			changes.push(fn)
			return c
		},
		disable() {
			c.readonly = true
			return c
		},
		// The Tuner redraws from the live object every frame, so every control already listens.
		listen: () => c,
	}
	return c
}

export function createTuneFolder(path) {
	const folder = {
		path,
		controllers: [],
		folders: [],
		add(object, property, a, b, step) {
			const choices = Array.isArray(a)
				? a.map((v) => [String(v), v])
				: a && typeof a === 'object'
					? Object.entries(a)
					: undefined
			const extra = choices ? { choices } : { min: a, max: b, step }
			const c = control(path, object, property, extra)
			folder.controllers.push(c)
			return c
		},
		addColor(object, property) {
			const format = typeof object[property] === 'number' ? numberHex : stringHex
			const c = control(path, object, property, { format, unit: 'color' })
			folder.controllers.push(c)
			return c
		},
		addFolder(title) {
			const f = createTuneFolder(`${path}/${title}`)
			folder.folders.push(f)
			return f
		},
		controllersRecursive() {
			return [...folder.controllers, ...folder.folders.flatMap((f) => f.controllersRecursive())]
		},
	}
	return folder
}
