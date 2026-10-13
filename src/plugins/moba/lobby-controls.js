import { el } from '../../core/dom.js'
import { controls, cyclePreset, setPreset } from '../../core/controls.js'
import { PRESETS } from '../../core/intents.js'

const WALK = ['KeyW', 'KeyA', 'KeyS', 'KeyD']
// Once a page load: a player who turned the offer down isn't asked again.
let offered = false

// The lobby's bottom-right "Controls: MOBA" label, since Esc here leaves instead of pausing. A click cycles
// the preset, the same one the pause menu shows. WASD pressed under MOBA offers the switch once.
// `onChange` drops held aims from the old bindings. Gamepad and touch hide it (lobby.css).
export function createLobbyControls(parent, { onChange }) {
	const box = el('div', 'lobby-controls', parent)
	const offer = el('button', 'lobby-controls-offer', box, 'Switch to WASD? <kbd>Enter</kbd>')
	const label = el('button', 'lobby-controls-label', box)
	offer.type = label.type = 'button'
	offer.hidden = true
	const show = () => {
		label.textContent = `Controls: ${PRESETS[controls.preset]?.name ?? PRESETS.moba.name}`
	}
	const dismiss = () => {
		offer.hidden = true
	}
	const accept = () => {
		dismiss()
		setPreset('wasd')
		show()
		onChange()
	}
	label.onclick = () => {
		dismiss()
		cyclePreset()
		show()
		onChange()
	}
	offer.onclick = accept
	// Any other click turns the offer down.
	const away = (event) => {
		if (!offer.hidden && !offer.contains(event.target)) dismiss()
	}
	window.addEventListener('pointerdown', away, true)
	show()
	return {
		// Lobby keys go through here first; true means the key was the offer's.
		key(event) {
			if (event.type !== 'keydown' || event.repeat) return false
			if (offer.hidden) {
				if (!offered && controls.preset === 'moba' && WALK.includes(event.code)) {
					offered = true
					offer.hidden = false
				}
				return false
			}
			// More walking keeps the offer up; Enter takes it; Esc and anything else turn it down.
			if (WALK.includes(event.code)) return false
			if (event.code === 'Enter') accept()
			else dismiss()
			if (event.code !== 'Enter' && event.code !== 'Escape') return false
			event.preventDefault()
			return true
		},
		dispose() {
			window.removeEventListener('pointerdown', away, true)
			box.remove()
		},
	}
}
