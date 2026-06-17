import { WEAPONS } from './weapons.js'
import { tune } from './tune.js'

const ORDER = ['arrow', 'charge', 'bowl']
const KEYS = { arrow: '1', charge: '2', bowl: '3' }
const ACCENT = { arrow: '#ffd35d', charge: '#ffd35d', bowl: '#8a6cff' }

// Bottom-center weapon picker + charge meter. Keyboard 1/2/3 still switches via
// main.js; slots are clickable during play for mouse users.
export function createWeaponHud({ onSelect } = {}) {
	const root = document.querySelector('.weapons')
	const slots = new Map()
	const chargeWrap = document.createElement('div')
	chargeWrap.className = 'charge'
	chargeWrap.hidden = true

	const track = document.createElement('div')
	track.className = 'charge-track'
	const perfectZone = document.createElement('div')
	perfectZone.className = 'charge-perfect'
	const fill = document.createElement('div')
	fill.className = 'charge-fill'
	track.append(perfectZone, fill)

	const chargeLabel = document.createElement('div')
	chargeLabel.className = 'charge-label'
	chargeWrap.append(track, chargeLabel)

	const row = document.createElement('div')
	row.className = 'slots'
	for (const id of ORDER) {
		const def = WEAPONS[id]
		const btn = document.createElement('button')
		btn.type = 'button'
		btn.className = 'slot'
		btn.dataset.weapon = id
		btn.style.setProperty('--accent', ACCENT[id])
		btn.innerHTML =
			`<span class="key">${KEYS[id]}</span>` + `<span class="name">${def.label}</span>`
		btn.addEventListener('click', () => onSelect?.(id))
		slots.set(id, btn)
		row.append(btn)
	}

	root.append(row, chargeWrap)

	return {
		update({ weapon, charge, visible }) {
			root.hidden = !visible
			if (!visible) return

			for (const [id, btn] of slots) {
				btn.classList.toggle('active', id === weapon)
			}

			const showCharge = weapon === 'charge'
			chargeWrap.hidden = !showCharge
			if (!showCharge) return

			const window = tune.weapons.perfectWindow
			perfectZone.style.left = `${(1 - window) * 100}%`
			perfectZone.style.width = `${window * 100}%`
			fill.style.width = `${charge.value * 100}%`
			fill.classList.toggle('perfect', charge.charging && charge.perfect)

			if (charge.charging) {
				chargeLabel.textContent = charge.perfect
					? 'PERFECT — release!'
					: `${Math.round(charge.value * 100)}% — release to fire`
			} else {
				chargeLabel.textContent = 'hold click to wind up'
			}
		},
	}
}
