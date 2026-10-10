import { el as make } from '../../../core/dom.js'
import { tune } from './tune.js'

// The same slice projection anchors the DOM sign and the backdrop's zoom.
function projectFrame(width, height) {
	const scale = Math.max((width * 1.1) / 1440, (height * 1.1) / 900)
	return {
		scale,
		point: (x, y) => ({ x: width / 2 + (x - 720) * scale, y: height * 1.05 + (y - 900) * scale }),
		signX: width / 2 + (800 - 720) * scale,
		ground: -height * 0.05 + (900 - 750) * scale,
	}
}

function easePointer(current, target, dt, response) {
	const blend = 1 - Math.exp(-Math.max(0, dt) / response)
	return current + (target - current) * blend
}

// The focus point in the 1440 × 900 frame: shots zoom on it, so the lobby's tabletop
// lands where the splash's eye rests.
const focus = { x: 606, y: 740 }
const shots = ['splash', 'lobby', 'apex']

// One in-out curve for every front move: backdrop shots, the lobby's camera intro and the crane.
export function easeShot(t) {
	const k = Math.max(1, tune.shot.ease)
	const x = Math.max(0, Math.min(1, t))
	return x < 0.5 ? 2 ** (k - 1) * x ** k : 1 - (-2 * x + 2) ** k / 2
}

export function createBackdrop() {
	const el = make('div', 'front-backdrop')
	el.setAttribute('aria-hidden', 'true')
	// The plate is one painted frame; the sky and cloud run on past its edges so shots never
	// show its border, and two mist bands drift across the cloud sea.
	const { src, widths } = tune.plate
	el.innerHTML = `<div class="front-plate-layer"><div class="front-plate"><img alt="" decoding="async" fetchpriority="high" srcset="${widths.map((w) => `${src}-${w}.webp ${w}w`).join(', ')}" sizes="max(110vw, 196vh)" src="${src}-${widths.at(-1)}.webp"><div class="front-mist"></div><div class="front-mist front-mist-near"></div></div></div><div class="front-dusk"></div>`
	const layers = [...el.querySelectorAll('.front-plate-layer')]
	const wash = el.querySelector('.front-dusk')
	const reduced = matchMedia('(prefers-reduced-motion: reduce)')
	const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 }
	// `pose` is where the shot is now, `move` the ease under way from `from` to `name`.
	const pose = { lift: 0, zoom: 1 }
	let current = 'splash'
	let move = null
	let dusk = 0
	let blend = null
	let frame = null
	let last = 0
	let lifted = 1
	let disposed = false
	const layerPose = (depth) => ({
		lift: pose.lift * depth,
		zoom: 1 + (pose.zoom - 1) * depth,
	})
	const depthOf = (index) => Math.max(0, tune.shot.depth[index] ?? 1)
	function place() {
		layers.forEach((layer, index) => {
			const { lift, zoom } = layerPose(depthOf(index))
			const parallax = ((index + 1) / layers.length) * tune.parallax.depth
			const x = pointer.x * innerWidth * parallax
			const y = pointer.y * innerHeight * parallax - lift * lifted
			layer.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${zoom})`
		})
		el.dataset.shot = move ? `${current}-moving` : current
	}
	function settle() {
		for (const layer of layers) layer.style.willChange = 'auto'
	}
	function resize() {
		const shot = projectFrame(innerWidth, innerHeight)
		// Lift is in the 1440 × 900 frame's units, so a shot frames every aspect alike.
		lifted = (innerHeight * 1.1) / 900
		// Every layer zooms about the focus point; layers sit 5% outside the viewport.
		const o = shot.point(focus.x, focus.y)
		for (const layer of layers)
			layer.style.transformOrigin = `${o.x + innerWidth * 0.05}px ${o.y + innerHeight * 0.05}px`
		place()
		if (!move) settle()
	}
	// Dusk is a flat violet wash over the plate: opacity only, never a filter.
	function paint() {
		wash.style.opacity = (dusk * tune.dusk.amount).toFixed(3)
	}
	function style() {
		const [x, y] = tune.plate.focus
		el.style.setProperty('--plate-x', x + '%')
		el.style.setProperty('--plate-y', y + '%')
		el.style.setProperty('--dusk', tune.dusk.color)
		el.style.setProperty('--mist-opacity', tune.mist.opacity)
		el.style.setProperty('--mist-far', tune.mist.period[0] + 's')
		el.style.setProperty('--mist-near', tune.mist.period[1] + 's')
	}
	style()
	paint()
	function wake() {
		if (disposed || frame !== null) return
		last = performance.now()
		frame = requestAnimationFrame(step)
	}
	function step(now) {
		frame = null
		const dt = (now - last) / 1000
		last = now
		if (reduced.matches) pointer.targetX = pointer.targetY = 0
		pointer.x = easePointer(pointer.x, pointer.targetX, dt, tune.parallax.response)
		pointer.y = easePointer(pointer.y, pointer.targetY, dt, tune.parallax.response)
		const still =
			reduced.matches ||
			Math.max(
				Math.abs(pointer.x - pointer.targetX) * innerWidth,
				Math.abs(pointer.y - pointer.targetY) * innerHeight,
			) *
				tune.parallax.depth <
				tune.parallax.settle
		if (still) {
			pointer.x = pointer.targetX
			pointer.y = pointer.targetY
		}
		let arrived = null
		if (move) {
			move.elapsed += dt
			const t = move.time > 0 ? Math.min(1, move.elapsed / move.time) : 1
			const e = easeShot(t)
			const to = tune.shot[current]
			pose.lift = move.from.lift + (to.lift - move.from.lift) * e
			pose.zoom = move.from.zoom + (to.zoom - move.from.zoom) * e
			if (t >= 1) {
				arrived = move
				move = null
			}
		}
		if (blend) {
			blend.elapsed += dt
			const t = blend.time > 0 ? Math.min(1, blend.elapsed / blend.time) : 1
			dusk = blend.from + (blend.to - blend.from) * easeShot(t)
			if (t >= 1) blend = null
			paint()
		}
		place()
		if (arrived) {
			settle()
			arrived.resolve(true)
		}
		if (move || blend || !still) frame = requestAnimationFrame(step)
	}
	function parallax(event) {
		pointer.targetX = Math.max(-1, Math.min(1, (event.clientX / innerWidth) * 2 - 1))
		pointer.targetY = Math.max(-1, Math.min(1, (event.clientY / innerHeight) * 2 - 1))
		wake()
	}
	function motionPreference() {
		if (reduced.matches && move) jump()
		wake()
	}
	function jump() {
		const to = tune.shot[current]
		pose.lift = to.lift
		pose.zoom = to.zoom
		const arrived = move
		move = null
		place()
		settle()
		arrived?.resolve(true)
	}
	resize()
	window.addEventListener('resize', resize)
	window.addEventListener('pointermove', parallax)
	reduced.addEventListener('change', motionPreference)
	const api = {
		el,
		get shotName() {
			return current
		},
		get remaining() {
			return move ? Math.max(0, move.time - move.elapsed) : 0
		},
		// Ease every layer to a named shot from wherever it is now, so a reversal mid-move
		// turns round in place. Resolves true on arrival, false if a later shot replaced it.
		shot(name, { instant = false } = {}) {
			if (!shots.includes(name)) throw new Error(`Unknown backdrop shot: ${name}`)
			if (disposed) return Promise.resolve(false)
			el.style.opacity = ''
			move?.resolve(false)
			current = name
			const { promise, resolve } = Promise.withResolvers()
			move = { from: { ...pose }, elapsed: 0, time: tune.shot[name].time, resolve }
			if (instant || reduced.matches) jump()
			else {
				for (const layer of layers) layer.style.willChange = 'transform'
				wake()
			}
			return promise
		},
		// Blend the colours to the lobby's dusk (1) or the splash's day (0) over `time` seconds.
		tint(to, time = 0) {
			if (disposed) return
			to = Math.max(0, Math.min(1, to))
			if (time > 0 && !reduced.matches) {
				blend = { from: dusk, to, elapsed: 0, time }
				wake()
			} else {
				blend = null
				dusk = to
				paint()
			}
		},
		fade(progress) {
			const p = Math.max(0, Math.min(1, Number(progress) || 0))
			el.style.opacity = String(1 - p)
		},
		retune() {
			style()
			paint()
			if (!move) {
				const to = tune.shot[current]
				pose.lift = to.lift
				pose.zoom = to.zoom
				place()
				settle()
			}
			wake()
		},
		// Debug hook: wash to dusk and back over `skyFade` s.
		crossfade(dusk = true) {
			api.tint(dusk ? 1 : 0, tune.skyFade)
			return new Promise((resolve) => setTimeout(resolve, tune.skyFade * 1000))
		},
		dispose() {
			disposed = true
			move?.resolve(false)
			move = null
			if (frame !== null) cancelAnimationFrame(frame)
			window.removeEventListener('resize', resize)
			window.removeEventListener('pointermove', parallax)
			reduced.removeEventListener('change', motionPreference)
			if (globalThis.frontBackdrop === api) delete globalThis.frontBackdrop
			el.remove()
		},
	}
	// Dev hook for stepping shots by hand: frontBackdrop.shot('apex').
	if (import.meta.env?.DEV) globalThis.frontBackdrop = api
	return api
}
