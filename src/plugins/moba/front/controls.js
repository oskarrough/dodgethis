// One cursor and rising-edge pad back. Tab navigates; it never confirms.
export function createControls({ focus, activate, back, device, count }) {
	let index = 0
	let backHeld = false
	const move = (delta) => {
		index = (index + delta + count) % count
		focus(index)
	}
	return {
		point(next) {
			index = next
			focus(index)
		},
		key(event) {
			if (event.defaultPrevented || event.repeat || event.target?.closest?.('.lil-gui')) return
			if (event.code === 'Backquote') return
			if (
				![
					'Tab',
					'ArrowRight',
					'ArrowDown',
					'ArrowLeft',
					'ArrowUp',
					'Enter',
					'Space',
					'Escape',
				].includes(event.code)
			)
				return
			event.preventDefault()
			device('keyboard')
			if (event.code === 'Tab') move(event.shiftKey ? -1 : 1)
			else if (['ArrowRight', 'ArrowDown'].includes(event.code)) move(1)
			else if (['ArrowLeft', 'ArrowUp'].includes(event.code)) move(-1)
			else if (event.code === 'Enter' || event.code === 'Space') activate(index)
			else if (event.code === 'Escape') back()
		},
		pad({ move: delta, confirm }, pad) {
			const held = !!pad?.buttons[1]
			const pressed = held && !backHeld
			backHeld = held
			if (delta || confirm || pressed) device('gamepad')
			if (pressed) {
				back()
				return
			}
			if (delta) move(delta)
			if (confirm) activate(index)
		},
	}
}
