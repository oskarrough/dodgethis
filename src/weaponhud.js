import { WEAPONS } from './weapons.js'
import { tune } from './tune.js'
import { hex } from './style.js'

const ORDER = Object.keys(WEAPONS)

// Bottom-center weapon picker + charge meter. Keyboard 1/2 still switches via
// main.js; slots are clickable during play for mouse users. Armed status sits
// here with the weapon chrome — not in the left-stack debug HUD.
export function createWeaponHud({ onSelect } = {}) {
	const root = document.querySelector('.weapons')
	const slots = new Map()
	let pickupUntil = 0
	const controls = document.createElement('div')
	controls.className = 'controls'
	const chargeWrap = document.createElement('div')
	chargeWrap.className = 'charge'

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
		btn.className = 'slot sticker'
		btn.dataset.weapon = id
		btn.style.setProperty('--accent', hex(def.role))
		btn.innerHTML = `<span class="key">${def.key}</span>` + `<span class="name">${def.label}</span>`
		btn.addEventListener('click', () => onSelect?.(id))
		slots.set(id, btn)
		row.append(btn)
	}

	root.append(armed, row, chargeWrap, controls)

	return {
		emphasizePickup() {
			pickupUntil = performance.now() + 350
		},
		reset() {
			pickupUntil = 0
			armed.classList.remove('picked-up')
		},
		update({ weapon, charge, visible, holding = false, device = 'keyboard' }) {
			root.hidden = !visible
			if (!visible) return

			armed.textContent = holding ? 'ARMED' : 'UNARMED'
			armed.classList.toggle('off', !holding)
			armed.classList.toggle('picked-up', holding && performance.now() < pickupUntil)
			const pad = device === 'gamepad'
			controls.textContent = pad
				? 'LS move · RS aim · LB/RB dash · D-pad weapon'
				: 'WASD move · mouse aim · Space/Shift dash'

			for (const [id, btn] of slots) {
				btn.classList.toggle('active', id === weapon)
				btn.querySelector('.key').textContent = pad ? WEAPONS[id].pad : WEAPONS[id].key
			}

			const showCharge = weapon === 'bow'
			track.hidden = !showCharge
			if (!showCharge) {
				chargeLabel.textContent = holding
					? pad
						? 'press RT / A to roll'
						: 'click to roll'
					: 'grab an arrow to rearm'
				return
			}

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
				chargeLabel.textContent = holding
					? pad
						? 'hold RT / A to wind up'
						: 'hold click to wind up'
					: 'grab an arrow to rearm'
			}
		},
	}
}
