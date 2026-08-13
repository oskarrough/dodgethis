import { tune } from './tune.js'

// Weapon definitions — the one place a weapon's identity lives (Godot would make
// these Resources). The human picks one (1/2); it's a property of the shooter,
// not the ammo. `kind` is what the projectile reads to decide how it flies; the
// numbers that tune each weapon live in tune.weapons (debug.js).
export const WEAPONS = {
	bow: { label: 'Bow', kind: 'arrow' },
	bowl: { label: 'Bowl', kind: 'bowl' },
}

// Shared palette so an arc preview and the in-flight trail of the same shot
// always agree (keyed by projectile kind, plus the perfect-release highlight).
export const TRAIL = { arrow: 0xffd35d, bowl: 0x8a6cff, perfect: 0xff5dff }

// The charge bow's wind-up meter, as a small self-contained component: hold to
// charge and the meter ping-pongs (0→1→0…), so holding too long unwinds it. The
// top `perfectWindow` slice is the "perfect" band. main.js drives press/update/
// release; the HUD reads value/perfect. Speed math reads tune.weapons live.
export function createChargeMeter() {
	let charging = false
	let clock = 0
	let value = 0
	let perfect = false

	// Base launch speed for the current meter position (before the perfect bonus).
	function base() {
		const w = tune.weapons
		return w.chargeMin + (w.chargeMax - w.chargeMin) * value
	}

	return {
		get charging() {
			return charging
		},
		get value() {
			return value
		},
		get perfect() {
			return perfect
		},
		previewSpeed: base, // what the live aim arc should draw

		press() {
			charging = true
			clock = 0
		},

		update(dt) {
			if (!charging) return
			clock += dt
			const x = clock / tune.weapons.chargeTime
			const m = x % 2
			value = m <= 1 ? m : 2 - m // triangle wave: winds up, then unwinds
			perfect = value >= 1 - tune.weapons.perfectWindow
		},

		// Resolve to a fired shot { speed, perfect }, or null if it wasn't charging.
		release() {
			if (!charging) return null
			const shot = { speed: perfect ? base() * tune.weapons.perfectMult : base(), perfect }
			charging = false
			return shot
		},

		cancel() {
			charging = false
			value = 0
			perfect = false
		},
	}
}
