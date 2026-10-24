import { el } from '../../core/dom.js'
import { controls, setPreset } from '../../core/controls.js'

const WALK = ['KeyW', 'KeyA', 'KeyS', 'KeyD']
// Once a page load: a player who turned the offer down isn't asked again.
let offered = false

// The lobby's one-time WASD offer, bottom right: WASD pressed under MOBA offers the switch once. The preset
// itself lives on the top-right controls tile (core/browser.js). `onChange` drops held aims from the old
// bindings. Gamepad and touch hide it (lobby.css).
export function createLobbyControls(parent, { onChange }) {
	const box = el('div', 'lobby-controls', parent)
	const offer = el('button', 'lobby-controls-offer', box, 'Switch to WASD? <kbd>Enter</kbd>')
	offer.type = 'button'
	offer.hidden = true
	const dismiss = () => {
		offer.hidden = true
	}
	const accept = () => {
		dismiss()
		setPreset('wasd')
		onChange()
	}
	offer.onclick = accept
	// Any other click turns the offer down.
	const away = (event) => {
		if (!offer.hidden && !offer.contains(event.target)) dismiss()
	}
	window.addEventListener('pointerdown', away, true)
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
