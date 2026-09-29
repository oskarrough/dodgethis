// Local camera gestures never become gameplay intents.
export function createCameraControls(target, signal, follow) {
	const keys = new Set()
	let centred = false
	const arrows = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']
	const clear = () => {
		keys.clear()
		centred = false
	}
	const onKey = (e) => {
		if (!arrows.includes(e.code) && e.code !== 'Space') return
		if (e.type === 'keyup') {
			keys.delete(e.code)
			if (e.code === 'Space') centred = false
			return
		}
		if (e.defaultPrevented && e.code !== 'Space') return
		if (e.target?.closest?.('input, textarea, select, [contenteditable]')) return
		e.preventDefault()
		if (e.code === 'Space') {
			centred = true
			if (!e.repeat) follow.snap()
		} else keys.add(e.code)
	}
	target.addEventListener('keydown', onKey, { signal })
	target.addEventListener('keyup', onKey, { signal })
	target.addEventListener('blur', clear, { signal })
	return {
		clear,
		read: () => ({
			centred,
			pan: {
				x: Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft')),
				z: Number(keys.has('ArrowDown')) - Number(keys.has('ArrowUp')),
			},
		}),
	}
}
