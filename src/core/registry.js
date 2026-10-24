// Every tunable value, found by walking the tune sections: each number, on/off, '#rrggbb' colour and
// number in an array is a value at `section/dotted/key`. Units decide the instrument and range; notes
// (optional, beside the values in each tune file) add labels, hints, ranges, timing or hide a value.
// The Tuner reads this; nobody has to write a slider for a value to be tunable. A section's `build`
// adds hand-made controls (tune-folder.js), which win over what the walk found for the same value.
import { createTuneFolder } from './tune-folder.js'

const HEX = /^#[0-9a-f]{6}$/i
const MAX_DEPTH = 6

// "dodgeReaction" → "dodge reaction"; array indices read as "far mist 1".
export function labelOf(key) {
	return String(key)
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/\./g, ' ')
		.replace(/\b(\d+)\b/g, (n) => String(+n + 1))
		.toLowerCase()
}

function kindOfValue(v) {
	if (typeof v === 'number') return Number.isFinite(v) ? 'number' : null
	if (typeof v === 'boolean') return 'boolean'
	if (typeof v === 'string' && HEX.test(v)) return 'color'
	return null
}

// Without a unit or a note, a range around the default leaves room either way.
function guessRange(v) {
	if (typeof v !== 'number') return [0, 1]
	if (v === 0) return [0, 1]
	const a = Math.abs(v)
	return v < 0 ? [v * 2, Math.max(0, -v)] : [0, Math.max(1, a * 2)]
}

// The last key names a value; an array index needs its array's name too ("depth 2").
function shortLabel(dotted, parts = 1) {
	const keys = dotted.split('.')
	const take = /^\d+$/.test(keys.at(-1)) ? parts + 1 : parts
	return labelOf(keys.slice(-take).join('.'))
}

const depth = (e) => e.dotted.split('.').length

const hexFormat = { toHexString: (v) => v, fromHexString: (h) => h }

// One value: the same verbs a Tuner instrument needs, whatever registered it.
function entry(section, dotted, object, property, options) {
	const note = options.notes?.[dotted] ?? {}
	const initialValue = object[property]
	const unit = note.unit ?? options.units?.(object, property, dotted)
	const type = kindOfValue(initialValue)
	const e = {
		path: `${section}/${dotted.replaceAll('.', '/')}`,
		section,
		dotted,
		object,
		property,
		label: note.label ?? shortLabel(dotted),
		hint: note.hint,
		when: note.when,
		unit: type === 'color' ? 'color' : type === 'boolean' && !unit ? 'bool' : unit,
		initialValue,
		min: note.range?.[0],
		max: note.range?.[1],
		step: note.step,
		format: type === 'color' ? hexFormat : undefined,
		guess: unit ? undefined : guessRange(initialValue),
		getValue: () => object[property],
		setValue(v) {
			if (object[property] === v) return
			object[property] = v
			options.onChange?.(dotted, v)
		},
		reset() {
			e.setValue(initialValue)
		},
	}
	return e
}

function walk(section, object, options, visit, prefix = '', depth = 0) {
	if (!object || typeof object !== 'object' || depth > MAX_DEPTH) return
	for (const [key, value] of Object.entries(object)) {
		const dotted = prefix ? `${prefix}.${key}` : key
		if (options.notes?.[dotted]?.hidden) continue
		if (kindOfValue(value)) visit(entry(section, dotted, object, key, options))
		else if (value && typeof value === 'object')
			walk(section, value, options, visit, dotted, depth + 1)
	}
}

export function createRegistry() {
	const sections = new Map() // id → { path, object, options, entries }
	let id = 0
	return {
		// `options`: { notes: { 'dotted.key': { label, hint, range, step, unit, when, hidden } },
		// units(object, key, dotted) → unit name, onChange(dotted, value), featured: ['dotted.key'] }.
		add(path, object, options = {}, build = null) {
			const key = ++id
			const folder = createTuneFolder(path)
			build?.(folder, object)
			const controls = folder.controllersRecursive()
			const entries = []
			walk(path, object, options, (e) => entries.push(e))
			// Short labels collide inside a section ("lift" under splash, lobby and apex); keep the parent there.
			const labels = new Map()
			for (const e of entries) labels.set(e.label, (labels.get(e.label) ?? 0) + 1)
			for (const e of entries)
				if (labels.get(e.label) > 1 && !options.notes?.[e.dotted]?.label)
					e.label = shortLabel(e.dotted, 2)
			sections.set(key, { path, object, options, entries, controls })
			return () => sections.delete(key)
		},
		// A value reachable from two sections (a style section nested in its map's) shows once, under
		// the section that holds it most directly, whose onChange is the one that knows about it.
		entries() {
			const best = new Map()
			const controls = []
			const handled = new Map()
			for (const s of sections.values())
				for (const c of s.controls) {
					controls.push(c)
					if (!handled.has(c.object)) handled.set(c.object, new Set())
					handled.get(c.object).add(c.property)
				}
			for (const s of sections.values())
				for (const e of s.entries) {
					if (handled.get(e.object)?.has(e.property)) continue
					let byKey = best.get(e.object)
					if (!byKey) best.set(e.object, (byKey = new Map()))
					const had = byKey.get(e.property)
					if (!had || depth(e) < depth(had)) byKey.set(e.property, e)
				}
			const all = controls
			for (const byKey of best.values()) all.push(...byKey.values())
			return all
		},
		featured() {
			const all = []
			for (const s of sections.values())
				for (const dotted of s.options.featured ?? []) {
					const e = s.entries.find((x) => x.dotted === dotted)
					if (e) all.push(e)
				}
			return all
		},
	}
}
