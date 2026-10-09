import { tune } from './tune.js'

// Local camera gestures never become gameplay intents. Edge speeds join the arrow-key vector.
export function createCameraControls(
	target,
	signal,
	follow,
	enabled = () => true,
	device = () => 'keyboard',
	t = tune.follow,
) {
	const keys = new Set()
	let centred = false
	let pointer = null
	let focused = target.document?.hasFocus?.() ?? true
	const arrows = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']
	const clear = () => {
		keys.clear()
		centred = false
		pointer = null
	}
	const active = () => focused && !target.document?.hidden && enabled() && !signal.aborted
	const onKey = (e) => {
		if (!arrows.includes(e.code) && e.code !== 'Space') return
		if (e.type === 'keyup') {
			keys.delete(e.code)
			if (e.code === 'Space') centred = false
			return
		}
		if (e.defaultPrevented || !active()) return
		if (e.target?.closest?.('input, textarea, select, [contenteditable]')) return
		e.preventDefault()
		if (e.code === 'Space') {
			centred = true
			if (!e.repeat) follow.snap()
		} else keys.add(e.code)
	}
	const onPointer = (e) => {
		pointer = active() && e.pointerType === 'mouse' ? { x: e.clientX, y: e.clientY } : null
	}
	// A windowed mouse can overshoot the edge it's panning toward; pin it there so the pan keeps going.
	const leave = (e) => {
		const width = target.innerWidth,
			height = target.innerHeight
		const band = Math.min(t.edgeBand, width / 2, height / 2)
		const x = e?.clientX,
			y = e?.clientY
		if (!pointer || !Number.isFinite(x) || !Number.isFinite(y)) return void (pointer = null)
		const pin = (v, size) => (v <= band ? 0 : v >= size - band ? size - 1 : null)
		const px = pin(x, width),
			py = pin(y, height)
		pointer =
			px === null && py === null
				? null
				: {
						x: px ?? Math.max(0, Math.min(width - 1, x)),
						y: py ?? Math.max(0, Math.min(height - 1, y)),
					}
	}
	// Capture Space before core input suppresses its page-scroll default.
	target.addEventListener('keydown', onKey, { signal, capture: true })
	target.addEventListener('keyup', onKey, { signal })
	target.addEventListener('pointermove', onPointer, { signal })
	target.addEventListener('pointerdown', onPointer, { signal })
	target.addEventListener(
		'pointerout',
		(e) => {
			if (!e.relatedTarget) leave(e)
		},
		{ signal },
	)
	target.addEventListener(
		'pointerleave',
		(e) => {
			if (
				e.target === target ||
				e.target === target.document ||
				e.target === target.document?.documentElement
			)
				leave(e)
		},
		{ signal, capture: true },
	)
	target.addEventListener('pointercancel', () => leave(), { signal })
	target.addEventListener(
		'blur',
		() => {
			focused = false
			clear()
		},
		{ signal },
	)
	target.addEventListener(
		'focus',
		() => {
			focused = true
			clear()
		},
		{ signal },
	)
	signal.addEventListener('abort', clear, { once: true })
	return {
		clear,
		read() {
			if (!active()) clear()
			const pan = {
				x: Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft')),
				z: Number(keys.has('ArrowDown')) - Number(keys.has('ArrowUp')),
			}
			const width = target.innerWidth,
				height = target.innerHeight
			if (
				t.edgePan &&
				!centred &&
				pointer &&
				!['gamepad', 'touch'].includes(device()) &&
				pointer.x >= 0 &&
				pointer.x < width &&
				pointer.y >= 0 &&
				pointer.y < height
			) {
				const band = Math.min(t.edgeBand, width / 2, height / 2)
				if (Number.isFinite(band) && band > 0 && Number.isFinite(t.edgeSpeed)) {
					const ramp = (distance) => {
						const amount = Math.max(0, Math.min(1, 1 - distance / band))
						return amount * amount * (3 - 2 * amount)
					}
					const speed = Math.max(0, Math.min(1, t.edgeSpeed))
					pan.x += (ramp(width - pointer.x) - ramp(pointer.x)) * speed
					pan.z += (ramp(height - pointer.y) - ramp(pointer.y)) * speed
				}
			}
			return { centred, pan }
		},
	}
}
