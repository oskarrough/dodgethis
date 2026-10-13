import * as THREE from 'three'
import { FORWARD_LAYER } from '../../core/stylepass.js'
import { tune } from './tune.js'

// "These heroes go there", without words: fine spice motes lift off the hero cards and ride a slow
// wind across the saucer to the plates, settling as they land. Most leave your card for your
// plate; once you stand on it the wind drops to a trickle. Flat warm discs, no twinkle.
const disc = (() => {
	const canvas = document.createElement('canvas')
	canvas.width = canvas.height = 32
	const g = canvas.getContext('2d')
	const fill = g.createRadialGradient(16, 16, 0, 16, 16, 16)
	fill.addColorStop(0, '#fff')
	fill.addColorStop(0.55, '#fff')
	fill.addColorStop(1, 'rgba(255,255,255,0)')
	g.fillStyle = fill
	g.fillRect(0, 0, 32, 32)
	return canvas
})()

export function createLobbyDust(scene, el, readySeats, local) {
	const d = tune.lobby.dust
	const map = new THREE.CanvasTexture(disc)
	const colors = d.colors.map((c) => new THREE.Color(c))
	const owned = [map]
	// Two layers of the same flight: fine motes, and a few big faint puffs for haze.
	const layers = [
		{ count: d.count, size: d.size, alpha: d.alpha },
		{ count: d.haze.count, size: d.haze.size, alpha: d.haze.alpha },
	].map((layer) => {
		const geometry = new THREE.BufferGeometry()
		const position = new THREE.BufferAttribute(new Float32Array(layer.count * 3), 3)
		const color = new THREE.BufferAttribute(new Float32Array(layer.count * 4), 4)
		position.setUsage(THREE.DynamicDrawUsage)
		color.setUsage(THREE.DynamicDrawUsage)
		geometry.setAttribute('position', position)
		geometry.setAttribute('color', color)
		const material = new THREE.PointsMaterial({
			size: layer.size,
			map,
			vertexColors: true,
			transparent: true,
			depthWrite: false,
		})
		const points = new THREE.Points(geometry, material)
		points.frustumCulled = false
		points.layers.set(FORWARD_LAYER)
		scene.add(points)
		owned.push(geometry, material)
		const motes = Array.from({ length: layer.count }, () => ({ age: 1, life: 1 }))
		return { ...layer, points, position, color, motes }
	})
	// Card origins on the floor, re-measured now and then: the strip moves with the window.
	const ray = new THREE.Vector3()
	let origins = [],
		measuredAt = -Infinity
	function measure(camera, time) {
		measuredAt = time
		const strip = el.querySelector('.lobby-hero-strip')
		origins = [...(strip?.querySelectorAll('.skin-card') ?? [])].flatMap((card) => {
			const box = card.getBoundingClientRect()
			if (!box.width) return []
			ray
				.set(
					((box.right - box.width * d.fromCard) / innerWidth) * 2 - 1,
					1 - ((box.top + box.height / 2) / innerHeight) * 2,
					0.5,
				)
				.unproject(camera)
				.sub(camera.position)
			if (ray.y >= 0) return []
			const s = -camera.position.y / ray.y,
				x = camera.position.x + ray.x * s,
				z = camera.position.z + ray.z * s
			// Before the camera settles the cards can land far off the saucer.
			const f = tune.lobby.floor
			if ((x / f.halfX) ** 2 + (z / f.halfZ) ** 2 > 1.2) return []
			return [
				{
					x,
					z,
					mine: card.getAttribute('aria-pressed') === 'true',
				},
			]
		})
	}
	const pick = (list, favourite, weight) =>
		favourite && Math.random() < weight ? favourite : list[Math.floor(Math.random() * list.length)]
	function launch(m) {
		const from = pick(
			origins,
			origins.find((o) => o.mine),
			d.mine,
		)
		const to = pick(readySeats.seats, readySeats.seatOf(local), d.mine)
		m.age = 0
		m.life = d.life[0] + Math.random() * (d.life[1] - d.life[0])
		m.x0 = from.x + (Math.random() - 0.5) * d.spread
		m.z0 = from.z + (Math.random() - 0.5) * d.spread
		m.y0 = d.lift * (0.3 + Math.random())
		m.x1 = to.x + (Math.random() - 0.5) * tune.lobby.ready.width * 0.8
		m.z1 = to.z + (Math.random() - 0.5) * tune.lobby.ready.depth * 0.8
		// The wind bows each flight the same way, by a little more or less.
		m.bow = d.bow * (0.6 + Math.random() * 0.8)
		m.arc = d.arc * (0.5 + Math.random())
		m.phase = Math.random() * Math.PI * 2
		m.tint = colors[Math.floor(Math.random() * colors.length)]
	}
	let last = 0
	return {
		update(time, camera) {
			const dt = Math.min(0.1, Math.max(0, time - last))
			last = time
			if (time - measuredAt > d.remeasure) measure(camera, time)
			const settled = readySeats.seatOf(local)?.enteredAt != null
			for (const layer of layers) {
				const p = layer.position.array,
					c = layer.color.array
				// Enough launches to keep the layer full, fewer once you're on your plate.
				layer.owed = Math.min(
					layer.count,
					(layer.owed ?? 0) +
						(dt * (settled ? d.settled : 1) * layer.count * 2) / (d.life[0] + d.life[1]),
				)
				for (const [i, m] of layer.motes.entries()) {
					m.age += dt / m.life
					if (m.age >= 1 && layer.owed >= 1 && origins.length) {
						launch(m)
						layer.owed--
					}
					if (m.age >= 1) {
						c[i * 4 + 3] = 0
						continue
					}
					// Out along a bowed arc, slowing as it settles; the gust sways it across the wind.
					const t = 1 - (1 - m.age) ** 1.6
					const dx = m.x1 - m.x0,
						dz = m.z1 - m.z0
					const length = Math.hypot(dx, dz) || 1
					const bow = Math.sin(Math.PI * t) * m.bow,
						sway =
							Math.sin(Math.PI * t) *
							d.sway *
							Math.sin(time * d.gust + m.phase + m.x0 * 0.3 + t * 4)
					p[i * 3] = m.x0 + dx * t - (dz / length) * (bow + sway)
					p[i * 3 + 1] = m.y0 * (1 - t) + Math.sin(Math.PI * t) * m.arc + d.land
					p[i * 3 + 2] = m.z0 + dz * t + (dx / length) * (bow + sway)
					const fade = Math.min(m.age / d.fadeIn, (1 - m.age) / d.fadeOut, 1)
					m.tint.toArray(c, i * 4)
					c[i * 4 + 3] = layer.alpha * fade
				}
				layer.position.needsUpdate = true
				layer.color.needsUpdate = true
			}
		},
		dispose() {
			for (const layer of layers) layer.points.removeFromParent()
			for (const item of owned) item.dispose()
		},
	}
}
