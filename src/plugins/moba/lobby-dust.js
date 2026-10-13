import * as THREE from 'three'
import { FORWARD_LAYER } from '../../core/stylepass.js'
import { tune } from './tune.js'

// "This hero goes there", without words: spice lifts off your hero card and rides a curved wind
// ribbon across the saucer to your plate, settling as it lands. The grains fly as one loose flock:
// gust pulses run down the ribbon so they bunch and stream, and a shared wave swings the whole
// body. Each grain is a short streak along its flight with a fading tail; a few carry a halo, and
// a thin haze rides the ribbon's middle. Once you stand on your plate it dwindles to a trickle.

const vertexShader = /* glsl */ `
	attribute vec3 iPos;
	attribute vec3 iVel;
	attribute vec3 iSize; // length, width, softness
	attribute vec4 iColor;
	varying vec2 vUv;
	varying vec4 vColor;
	varying vec3 vSize;
	void main() {
		vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
		vec2 v = (modelViewMatrix * vec4(iVel, 0.0)).xy;
		vec2 axis = length(v) > 1e-5 ? normalize(v) : vec2(1.0, 0.0);
		vec2 across = vec2(-axis.y, axis.x);
		mv.xy += axis * position.x * iSize.x + across * position.y * iSize.y;
		vUv = position.xy * 2.0;
		vColor = iColor;
		vSize = iSize;
		gl_Position = projectionMatrix * mv;
	}
`
const fragmentShader = /* glsl */ `
	varying vec2 vUv;
	varying vec4 vColor;
	varying vec3 vSize;
	void main() {
		// A capsule along the flight, soft at its rim, its tail (-x) fading out.
		float r = vSize.y / vSize.x;
		vec2 q = vec2(vUv.x, vUv.y * r);
		float d = length(q - vec2(clamp(q.x, r - 1.0, 1.0 - r), 0.0)) / r;
		float a = 1.0 - smoothstep(1.0 - max(0.2, vSize.z), 1.0, d);
		a *= mix(0.15, 1.0, smoothstep(-1.0, 0.5, vUv.x));
		gl_FragColor = vec4(vColor.rgb, vColor.a * a);
		#include <colorspace_fragment>
	}
`

export function createLobbyDust(scene, el, readySeats, local) {
	const d = tune.lobby.dust
	const rand = (a, b) => a + Math.random() * (b - a)
	const grains = Array.from({ length: d.grains }, () => ({
		s: rand(-0.2, 1),
		lane: Math.max(-1, Math.min(1, (Math.random() + Math.random() + Math.random() - 1.5) / 0.9)),
		rise: rand(-1, 1),
		pace: rand(0.85, 1.15),
		width: rand(...d.grain.width),
		phase: rand(0, Math.PI * 2),
		color: new THREE.Color(d.colors[Math.floor(Math.random() * d.colors.length)]),
		glow: Math.random() < d.glow.share,
		at: new THREE.Vector3(),
		velocity: new THREE.Vector3(),
	}))
	const haze = Array.from({ length: d.haze.count }, () => ({
		s: rand(-1, 1),
		lane: rand(-0.4, 0.4),
		phase: rand(0, Math.PI * 2),
		at: new THREE.Vector3(),
		velocity: new THREE.Vector3(),
	}))
	const glowing = grains.filter((g) => g.glow)
	const count = haze.length + grains.length + glowing.length
	const geometry = new THREE.InstancedBufferGeometry()
	const quad = new THREE.PlaneGeometry(1, 1)
	geometry.index = quad.index
	geometry.setAttribute('position', quad.getAttribute('position'))
	const attribute = (size) => {
		const a = new THREE.InstancedBufferAttribute(new Float32Array(count * size), size)
		a.setUsage(THREE.DynamicDrawUsage)
		return a
	}
	const iPos = attribute(3),
		iVel = attribute(3),
		iSize = attribute(3),
		iColor = attribute(4)
	Object.entries({ iPos, iVel, iSize, iColor }).forEach(([k, a]) => geometry.setAttribute(k, a))
	geometry.instanceCount = count
	const material = new THREE.ShaderMaterial({
		vertexShader,
		fragmentShader,
		transparent: true,
		depthWrite: false,
	})
	const mesh = new THREE.Mesh(geometry, material)
	mesh.frustumCulled = false
	mesh.layers.set(FORWARD_LAYER)
	scene.add(mesh)
	const hazeColor = new THREE.Color(d.haze.color),
		glowColor = new THREE.Color(d.glow.color)

	// Your card's spot on the floor, re-measured now and then: the strip moves with the window.
	const ray = new THREE.Vector3()
	let origin = null,
		measuredAt = -Infinity
	function measure(camera, time) {
		measuredAt = time
		const strip = el.querySelector('.lobby-hero-strip')
		const card =
			strip?.querySelector('.skin-card[aria-pressed="true"]') ?? strip?.querySelector('.skin-card')
		const box = card?.getBoundingClientRect()
		if (!box?.width) return
		ray
			.set(
				((box.right - box.width * d.fromCard) / innerWidth) * 2 - 1,
				1 - ((box.top + box.height / 2) / innerHeight) * 2,
				0.5,
			)
			.unproject(camera)
			.sub(camera.position)
		if (ray.y >= 0) return
		const k = -camera.position.y / ray.y,
			x = camera.position.x + ray.x * k,
			z = camera.position.z + ray.z * k
		// Before the camera settles the card can land far off the saucer.
		const f = tune.lobby.floor
		if ((x / f.halfX) ** 2 + (z / f.halfZ) ** 2 <= 1.2) origin = { x, z }
	}

	// The ribbon: a cubic from card to plate, both handles bowed away from the camera.
	const ribbon = { x: [0, 0, 0, 0], z: [0, 0, 0, 0], length: 1 }
	function shape(to, time) {
		const dx = to.x - origin.x,
			dz = to.z - origin.z,
			length = Math.hypot(dx, dz) || 1
		const away = dx < 0 ? -1 : 1,
			nx = (dz / length) * away,
			nz = (-dx / length) * away
		const bow = d.bow * (1 + 0.12 * Math.sin(time * 0.31))
		ribbon.x = [
			origin.x,
			origin.x + dx * 0.3 + nx * bow,
			origin.x + dx * 0.75 + nx * bow * 0.7,
			to.x,
		]
		ribbon.z = [
			origin.z,
			origin.z + dz * 0.3 + nz * bow,
			origin.z + dz * 0.75 + nz * bow * 0.7,
			to.z,
		]
		ribbon.length = length + bow
	}
	const bez = (p, t, u = 1 - t) =>
		u * u * u * p[0] + 3 * u * u * t * p[1] + 3 * u * t * t * p[2] + t * t * t * p[3]
	const tangent = (p, t, u = 1 - t) =>
		3 * u * u * (p[1] - p[0]) + 6 * u * t * (p[2] - p[1]) + 3 * t * t * (p[3] - p[2])
	// A point `lane` (−1…1) across the ribbon at s, `rise` (−1…1) up through it.
	function place(out, s, lane, rise, time) {
		const tx = tangent(ribbon.x, s),
			tz = tangent(ribbon.z, s),
			tl = Math.hypot(tx, tz) || 1
		const middle = Math.sin(Math.PI * s)
		// Narrow at card and plate, breathing midway; the whole flock swings together.
		const width = d.width * (0.25 + 0.75 * middle ** 0.7) * (1 + 0.3 * Math.sin(s * 7 - time * 1.3))
		const across = lane * width + d.swing * middle * Math.sin(s * 5 - time * 0.9)
		out.set(
			bez(ribbon.x, s) - (tz / tl) * across,
			d.lift * (1 - s) +
				d.land +
				d.arc * middle +
				middle * (rise * 0.25 + 0.18 * Math.sin(s * 6 - time * 1.1)),
			bez(ribbon.z, s) + (tx / tl) * across,
		)
		return out
	}
	// Gust pulses run down the ribbon: grains crawl between them and stream inside them.
	const gust = (s, time) =>
		0.45 +
		d.gust.strength *
			Math.max(0, Math.sin(Math.PI * 2 * (s * d.gust.count - time * d.gust.rate))) ** 3

	const previous = new THREE.Vector3()
	function fly(p, ds, lane, rise, time, dt) {
		previous.copy(p.at)
		p.s += ds
		if (p.s < 0 || p.s >= 1) return (p.flying = false)
		place(p.at, p.s, lane, rise, time)
		if (!p.flying) p.velocity.set(0, 0, 0)
		else if (dt > 0) p.velocity.lerp(previous.sub(p.at).negate().divideScalar(dt), 0.3)
		return (p.flying = true)
	}
	function write(i, p, length, width, soft, color, alpha) {
		iPos.array.set([p.at.x, p.at.y, p.at.z], i * 3)
		iVel.array.set([p.velocity.x, p.velocity.y, p.velocity.z], i * 3)
		iSize.array.set([Math.max(length, width), width, soft], i * 3)
		iColor.array.set([color.r, color.g, color.b, alpha], i * 4)
	}
	const hide = (i) => (iColor.array[i * 4 + 3] = 0)

	let last = 0
	return {
		update(time, camera) {
			const dt = Math.min(0.1, Math.max(0, time - last))
			last = time
			if (time - measuredAt > d.remeasure) measure(camera, time)
			const seat = readySeats.seatOf(local) ?? readySeats.seats[0]
			if (!origin || !seat) return
			shape(seat, time)
			const settled = seat.enteredAt != null
			const base = dt / d.travel
			let i = 0
			for (const h of haze) {
				if (!fly(h, base * d.haze.speed, h.lane, 0, time, dt)) {
					if (h.s >= 1) h.s -= 1
					hide(i++)
					continue
				}
				const alpha = d.haze.alpha * Math.sin(Math.PI * h.s) ** 1.5 * (settled ? d.settled : 1)
				write(i++, h, d.haze.length, d.haze.width, 1, hazeColor, alpha)
			}
			// Halos draw under the grains: grains first in time, after the halos in the buffer.
			const halos = []
			const halosAt = i
			i += glowing.length
			for (const g of grains) {
				const ds = base * g.pace * gust(Math.max(0, g.s), time)
				if (!fly(g, ds, g.lane, g.rise, time, dt)) {
					// Back to the card, at once while you're choosing, now and then once you've settled.
					if (g.s >= 1) g.s = settled && Math.random() > d.settled ? -rand(2, 6) : -rand(0, 0.05)
					hide(i++)
					continue
				}
				const fade = Math.min(g.s / d.fadeIn, (1 - g.s) / d.fadeOut, 1)
				// Thinner at the ribbon's edges, so it has no hard rim.
				const alpha = d.alpha * fade * (1 - 0.6 * g.lane * g.lane)
				const length = g.width + g.velocity.length() * d.streak + d.grain.length
				write(i++, g, length, g.width, 0.2, g.color, alpha)
				if (g.glow) halos.push([g, length, fade])
			}
			i = halosAt
			for (const g of glowing) {
				const halo = halos.find(([h]) => h === g)
				if (!halo) {
					hide(i++)
					continue
				}
				const [, length, fade] = halo
				const size = g.width * d.glow.size
				write(i++, g, length + size, size, 1, glowColor, d.glow.alpha * fade)
			}
			for (const a of [iPos, iVel, iSize, iColor]) a.needsUpdate = true
		},
		dispose() {
			mesh.removeFromParent()
			geometry.dispose()
			quad.dispose()
			material.dispose()
		},
	}
}
