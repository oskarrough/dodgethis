import { tune } from './tune.js'
import { PALETTE } from './style.js'

// Weapon identity belongs to the shooter, not ammo; `kind` selects flight behavior, tune.weapons holds the numbers.
export const WEAPONS = {
	bow: { label: 'Bow', kind: 'arrow', role: 'ammo', key: '1', pad: '←' },
	bowl: { label: 'Bowl', kind: 'bowl', role: 'bowl', key: '2', pad: '→' },
}

// Shared preview/trail colors by projectile kind, plus the perfect-release highlight.
export const TRAIL = { arrow: PALETTE.ammo, bowl: PALETTE.bowl, perfect: PALETTE.perfect }

// Held charge ping-pongs 0→1→0 with a top perfectWindow band; main drives it, HUD reads it, speed uses live tune.weapons.
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
