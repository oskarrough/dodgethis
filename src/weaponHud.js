import { WEAPONS } from './weapons.js'
import { tune } from './tune.js'

const ORDER = ['bow', 'bowl']
const KEYS = { bow: '1', bowl: '2' }
const ACCENT = { bow: '#ffd35d', bowl: '#8a6cff' }

// Bottom-center weapon picker + charge meter. Keyboard 1/2 still switches via
// main.js; slots are clickable during play for mouse users. Armed status sits
// here with the weapon chrome — not in the left-stack debug HUD.
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

	const armed = document.createElement('div')
	armed.className = 'armed off'
	armed.textContent = 'UNARMED'

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

	root.append(armed, row, chargeWrap)

	return {
		update({ weapon, charge, visible, holding = false }) {
			root.hidden = !visible
			if (!visible) return

			armed.textContent = holding ? 'ARMED' : 'UNARMED'
			armed.classList.toggle('off', !holding)

			for (const [id, btn] of slots) {
				btn.classList.toggle('active', id === weapon)
			}

			const showCharge = weapon === 'bow'
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
