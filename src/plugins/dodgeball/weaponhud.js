import { WEAPONS } from './weapons.js'
import { tune } from './tune.js'
import { hex } from '../../core/style.js'
import { el } from '../../core/dom.js'

const ORDER = Object.keys(WEAPONS)

// Bottom-center picker, charge and armed status; clickable slots complement main's 1/2 keys, separate from debug HUD.
export function createWeaponHud({ onSelect } = {}) {
	const root = document.querySelector('.weapons')
	const slots = new Map()
	let pickupUntil = 0
	const controls = el('div', 'controls')
	const chargeWrap = el('div', 'charge')

	const track = el('div', 'charge-track', chargeWrap)
	const perfectZone = el('div', 'charge-perfect', track)
	const fill = el('div', 'charge-fill', track)
	const chargeLabel = el('div', 'charge-label', chargeWrap)

	const armed = el('div', 'armed off', null, 'UNARMED')

	const row = el('div', 'slots')
	for (const id of ORDER) {
		const def = WEAPONS[id]
		const btn = el(
			'button',
			'slot sticker',
			row,
			`<span class="key">${def.key}</span>` + `<span class="name">${def.label}</span>`,
		)
		btn.type = 'button'
		btn.dataset.weapon = id
		btn.style.setProperty('--accent', hex(def.role))
		btn.addEventListener('click', () => onSelect?.(id))
		slots.set(id, btn)
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
		update({ weapon, charge, visible, holding = false, device = 'keyboard', pausable = true }) {
			root.hidden = !visible
			if (!visible) return

			armed.textContent = holding ? 'ARMED' : 'UNARMED'
			armed.classList.toggle('off', !holding)
			armed.classList.toggle('picked-up', holding && performance.now() < pickupUntil)
			const pad = device === 'gamepad'
			controls.textContent = pad
				? `LS move · RS aim · LB/RB dash · D-pad weapon · Start ${pausable ? 'pause' : 'menu'}`
				: `WASD move · mouse aim · Space jump · Shift dash · Esc ${pausable ? 'pause' : 'menu'}`

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
					: `${Math.round(charge.value * 100)}% reach · release!`
			} else {
				chargeLabel.textContent = holding
					? pad
						? 'hold RT / A for reach'
						: 'hold click for reach'
					: 'grab an arrow to rearm'
			}
		},
	}
}
