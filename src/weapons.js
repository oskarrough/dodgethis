import { tune } from './tune.js'
import { PALETTE } from './style.js'

// Weapon definitions — the one place a weapon's identity lives (Godot would make
// these Resources). The human picks one (1/2); it's a property of the shooter,
// not the ammo. `kind` is what the projectile reads to decide how it flies; the
// numbers that tune each weapon live in tune.weapons (debug.js).
export const WEAPONS = {
	bow: { label: 'Bow', kind: 'arrow', role: 'ammo', key: '1', pad: '←' },
	bowl: { label: 'Bowl', kind: 'bowl', role: 'bowl', key: '2', pad: '→' },
}

// Shared palette so an arc preview and the in-flight trail of the same shot
// always agree (keyed by projectile kind, plus the perfect-release highlight).
export const TRAIL = { arrow: PALETTE.ammo, bowl: PALETTE.bowl, perfect: PALETTE.perfect }

// The charge bow's wind-up meter, as a small self-contained component: hold to
// charge and the meter ping-pongs (0→1→0…), so holding too long unwinds it. The
// top `perfectWindow` slice is the "perfect" band. main.js drives press/update/
// release; the HUD reads value/perfect. Speed math reads tune.weapons live.
export function createChargeMeter() {
	let charging = false
	let clock = 0
	let value = 0
	let perfect = false

	// Resolve the launch speed once so the preview and fired shot cannot disagree.
	function speed() {
		const w = tune.weapons
		const base = w.chargeMin + (w.chargeMax - w.chargeMin) * value
		return perfect ? base * w.perfectMult : base
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
		previewSpeed: speed, // what the live aim arc should draw

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
			const shot = { speed: speed(), perfect }
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
