import * as THREE from 'three'

// Live style knobs: what a map builds from its colours, light and haze stays bound to the tune
// values, so the debug panel's style folder repaints a running match without a restart.
// Bindings are weak: a disposed map drops out on its own.
const bound = new Set()

// `apply(target)` runs now and again on every restyle() while `target` lives.
// Keep `target` out of the closure, or it never lets go.
export function bind(target, apply) {
	apply(target)
	bound.add({ ref: new WeakRef(target), apply })
	return target
}

// A colour that follows `object[key]`.
export const paint = (object, key) => bind(new THREE.Color(), (c) => c.set(object[key]))

export function restyle() {
	for (const b of bound) {
		const target = b.ref.deref()
		if (target) b.apply(target)
		else bound.delete(b)
	}
}

// The debug panel's style folder, one subfolder per section of a map's look (?knobs=style pins them).
const colours = (keys) => (f, o) => {
	for (const key of keys ?? Object.keys(o)) f.addColor(o, key).unit = 'color'
}
export const styleKnobs = {
	colors: colours(),
	palette: colours(),
	light(f, o) {
		colours(['sun', 'shade', 'shadow'])(f, o)
		f.add(o, 'shadowStrength', 0, 1, 0.01).unit = 'fraction'
		const bands = {
			get litBand() {
				return o.bandMix[0]
			},
			set litBand(v) {
				o.bandMix[0] = v
			},
			get shadeBand() {
				return o.bandMix[1]
			},
			set shadeBand(v) {
				o.bandMix[1] = v
			},
		}
		f.add(bands, 'litBand', 0, 1, 0.01).unit = 'fraction'
		f.add(bands, 'shadeBand', 0, 1, 0.01).unit = 'fraction'
	},
	haze(f, o) {
		f.add(o, 'bottom', 5, 80, 1).unit = 'm'
		f.add(o, 'far', 30, 300, 5).unit = 'm'
		f.add(o, 'power', 0.3, 3, 0.05).unit = 'multiplier'
		f.add(o, 'max', 0, 1, 0.01).unit = 'fraction'
	},
}
