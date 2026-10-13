import * as THREE from 'three'
import { FORWARD_LAYER } from '../../core/stylepass.js'
import { tune } from './tune.js'

// "This hero goes there", without words: spindrift runs across the glaze from your hero card to
// your plate, like sand blown off a dune crest. It is painted, not particles: long filaments of
// ochre and rust scrolling along a curved ribbon, fraying at its edges and fading in at the card and
// out at the plate, with gust waves running down it and ripples migrating through the sand. A few
// hair-thin grains hop off it. Once you stand on your plate it thins to a whisper.

const NOISE = /* glsl */ `
	float hash(vec2 p) {
		p = fract(p * vec2(123.34, 456.21));
		p += dot(p, p + 45.32);
		return fract(p.x * p.y);
	}
	float noise(vec2 p) {
		vec2 i = floor(p), f = fract(p);
		vec2 u = f * f * (3.0 - 2.0 * f);
		return mix(
			mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
			mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
			u.y
		);
	}
	float fbm(vec2 p) {
		float sum = 0.0, amp = 0.5;
		for (int i = 0; i < 4; i++) {
			sum += amp * noise(p);
			p = p * 2.03 + vec2(17.1, 9.2);
			amp *= 0.5;
		}
		return sum;
	}
`
const driftVertex = /* glsl */ `
	attribute float along;
	varying vec2 vUv;
	varying float vAlong;
	void main() {
		vUv = uv;
		vAlong = along;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`
const driftFragment = /* glsl */ `
	uniform float uTime, uSpeed, uGust, uPulse, uAlpha;
	uniform vec3 uPale, uRust;
	varying vec2 vUv; // metres along the ribbon, -1…1 across it
	varying float vAlong; // 0 at the card, 1 at the plate
	${NOISE}
	void main() {
		float flow = uTime * uSpeed;
		float across = abs(vUv.y);
		// Long filaments, domain-warped so they braid; finer, faster threads on top.
		vec2 p = vec2((vUv.x - flow) * 0.7, vUv.y * 5.0);
		float warp = fbm(p * 0.6 + vec2(uTime * 0.05, 0.0));
		float strands = smoothstep(0.34, 0.72, fbm(p + vec2(0.0, warp * 1.6)));
		float threads = smoothstep(0.62, 0.92, noise(vec2((vUv.x - flow * 1.6) * 2.4, vUv.y * 24.0)));
		// Ripples migrating slowly downwind, bent by the sand.
		float ripples = 0.5 + 0.5 * sin((vUv.x - uTime * 0.25) * 7.0 + fbm(vUv * vec2(0.8, 2.0)) * 5.0);
		// Gust waves run down the ribbon, thickening the drift as they pass.
		float gust = 0.55 + 0.45 * smoothstep(0.35, 1.0, 0.5 + 0.5 * sin(6.2832 * (vUv.x / uGust - uTime / uPulse)));
		// Frayed edges and soft ends.
		float rim = 0.55 + 0.45 * noise(vec2((vUv.x - flow * 0.6) * 1.3, vUv.y * 1.7));
		float edge = 1.0 - smoothstep(rim - 0.5, rim + 0.1, across);
		float ends = smoothstep(0.0, 0.14, vAlong) * (1.0 - smoothstep(0.8, 1.0, vAlong));
		float body = edge * ends * gust;
		float density = clamp(strands * body + threads * 0.55 * body * (1.0 - across), 0.0, 1.0);
		vec3 color = mix(uPale, uRust, smoothstep(0.1, 0.9, density));
		color *= 1.0 - 0.14 * ripples * density;
		gl_FragColor = vec4(color, density * uAlpha * (0.75 + 0.25 * ripples));
		#include <colorspace_fragment>
	}
`
const grainVertex = /* glsl */ `
	attribute vec3 iPos;
	attribute vec3 iVel;
	attribute vec2 iSize; // length, width
	attribute float iAlpha;
	varying vec2 vUv;
	varying float vAlpha;
	varying float vRatio;
	void main() {
		vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
		vec2 v = (modelViewMatrix * vec4(iVel, 0.0)).xy;
		vec2 axis = length(v) > 1e-5 ? normalize(v) : vec2(1.0, 0.0);
		mv.xy += axis * position.x * iSize.x + vec2(-axis.y, axis.x) * position.y * iSize.y;
		vUv = position.xy * 2.0;
		vAlpha = iAlpha;
		vRatio = iSize.y / iSize.x;
		gl_Position = projectionMatrix * mv;
	}
`
const grainFragment = /* glsl */ `
	uniform vec3 uColor;
	varying vec2 vUv;
	varying float vAlpha;
	varying float vRatio;
	void main() {
		// A hairline capsule whose tail (-x) fades.
		vec2 q = vec2(vUv.x, vUv.y * vRatio);
		float d = length(q - vec2(clamp(q.x, vRatio - 1.0, 1.0 - vRatio), 0.0)) / vRatio;
		float a = (1.0 - smoothstep(0.5, 1.0, d)) * smoothstep(-1.0, 0.6, vUv.x);
		gl_FragColor = vec4(uColor, vAlpha * a);
		#include <colorspace_fragment>
	}
`

export function createLobbyDust(scene, el, readySeats, local) {
	const d = tune.lobby.dust
	const rand = (a, b) => a + Math.random() * (b - a)
	const group = new THREE.Group()
	scene.add(group)
	const dynamic = (attribute) => attribute.setUsage(THREE.DynamicDrawUsage)

	// The ribbon: a strip of `segments` quads rebuilt each frame along the wind's curve.
	const n = d.segments + 1
	const strip = new THREE.BufferGeometry()
	const positions = dynamic(new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3))
	const uvs = dynamic(new THREE.BufferAttribute(new Float32Array(n * 2 * 2), 2))
	const along = new THREE.BufferAttribute(new Float32Array(n * 2), 1)
	for (let i = 0; i < n; i++) along.array.set([i / d.segments, i / d.segments], i * 2)
	strip.setAttribute('position', positions)
	strip.setAttribute('uv', uvs)
	strip.setAttribute('along', along)
	strip.setIndex(
		Array.from({ length: d.segments }, (_, i) => [
			i * 2,
			i * 2 + 2,
			i * 2 + 1,
			i * 2 + 1,
			i * 2 + 2,
			i * 2 + 3,
		]).flat(),
	)
	const drift = new THREE.ShaderMaterial({
		vertexShader: driftVertex,
		fragmentShader: driftFragment,
		uniforms: {
			uTime: { value: 0 },
			uSpeed: { value: d.speed },
			uGust: { value: d.gust },
			uPulse: { value: d.pulse },
			uAlpha: { value: d.alpha },
			uPale: { value: new THREE.Color(d.pale) },
			uRust: { value: new THREE.Color(d.rust) },
		},
		transparent: true,
		depthWrite: false,
		polygonOffset: true,
		polygonOffsetFactor: -2,
		polygonOffsetUnits: -8,
	})
	const ribbon = new THREE.Mesh(strip, drift)
	ribbon.renderOrder = -1.5

	// Grains: hairline streaks, one instanced quad each.
	const g = d.grains
	const quad = new THREE.PlaneGeometry(1, 1)
	const sand = new THREE.InstancedBufferGeometry()
	sand.index = quad.index
	sand.setAttribute('position', quad.getAttribute('position'))
	const instanced = (name, size) => {
		const a = dynamic(new THREE.InstancedBufferAttribute(new Float32Array(g.count * size), size))
		sand.setAttribute(name, a)
		return a
	}
	const iPos = instanced('iPos', 3),
		iVel = instanced('iVel', 3),
		iSize = instanced('iSize', 2),
		iAlpha = instanced('iAlpha', 1)
	sand.instanceCount = g.count
	const grainMaterial = new THREE.ShaderMaterial({
		vertexShader: grainVertex,
		fragmentShader: grainFragment,
		uniforms: { uColor: { value: new THREE.Color(g.color) } },
		transparent: true,
		depthWrite: false,
	})
	const hopping = new THREE.Mesh(sand, grainMaterial)
	for (const mesh of [ribbon, hopping]) {
		mesh.frustumCulled = false
		mesh.visible = false
		mesh.layers.set(FORWARD_LAYER)
		group.add(mesh)
	}
	const grains = Array.from({ length: g.count }, () => ({ age: rand(0, 1), life: 1 }))

	// Your card's spot on the floor, re-measured now and then: the strip moves with the window.
	const ray = new THREE.Vector3()
	let origin = null,
		measuredAt = -Infinity
	function measure(camera, time) {
		measuredAt = time
		const cards = el.querySelector('.lobby-hero-strip')
		const card =
			cards?.querySelector('.skin-card[aria-pressed="true"]') ?? cards?.querySelector('.skin-card')
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

	// The wind's curve: a cubic from card to plate, its handles bowed away from the camera, the
	// whole line swaying slowly; sampled with arc length, tangent and half-width per point.
	const path = Array.from({ length: n }, () => ({ x: 0, z: 0, tx: 1, tz: 0, u: 0, half: 0 }))
	const bez = (c, t, v = 1 - t) =>
		v * v * v * c[0] + 3 * v * v * t * c[1] + 3 * v * t * t * c[2] + t * t * t * c[3]
	const tan = (c, t, v = 1 - t) =>
		3 * v * v * (c[1] - c[0]) + 6 * v * t * (c[2] - c[1]) + 3 * t * t * (c[3] - c[2])
	function shape(to, time) {
		const dx = to.x - origin.x,
			dz = to.z - origin.z,
			length = Math.hypot(dx, dz) || 1
		const away = dx < 0 ? -1 : 1,
			nx = (dz / length) * away,
			nz = (-dx / length) * away
		const bow = d.bow * (1 + 0.1 * Math.sin(time * 0.27))
		const cx = [
			origin.x,
			origin.x + dx * 0.3 + nx * bow,
			origin.x + dx * 0.72 + nx * bow * 0.7,
			to.x,
		]
		const cz = [
			origin.z,
			origin.z + dz * 0.3 + nz * bow,
			origin.z + dz * 0.72 + nz * bow * 0.7,
			to.z,
		]
		const y = tune.map.printLayers.lobby
		for (const [i, p] of path.entries()) {
			const t = i / d.segments,
				middle = Math.sin(Math.PI * t)
			const tx = tan(cx, t),
				tz = tan(cz, t),
				tl = Math.hypot(tx, tz) || 1
			p.tx = tx / tl
			p.tz = tz / tl
			const sway = d.swing * middle * Math.sin(t * 4 - time * 0.45)
			const x = bez(cx, t) - p.tz * sway,
				z = bez(cz, t) + p.tx * sway
			p.u = i ? path[i - 1].u + Math.hypot(x - path[i - 1].x, z - path[i - 1].z) : 0
			p.x = x
			p.z = z
			p.half = d.width * (0.3 + 0.7 * middle ** 0.6)
			const ox = -p.tz * p.half,
				oz = p.tx * p.half
			positions.array.set([x + ox, y, z + oz, x - ox, y, z - oz], i * 6)
			uvs.array.set([p.u, 1, p.u, -1], i * 4)
		}
		positions.needsUpdate = true
		uvs.needsUpdate = true
		return path[d.segments].u || 1
	}
	// A point on the ribbon at arc length u, `lane` (−1…1) across it.
	function at(u, lane, out, length) {
		const f = Math.max(0, Math.min(1, u / length)) * d.segments
		const i = Math.min(d.segments - 1, Math.floor(f)),
			w = f - i
		const a = path[i],
			b = path[i + 1]
		const half = a.half + (b.half - a.half) * w
		out.x = a.x + (b.x - a.x) * w - a.tz * lane * half
		out.z = a.z + (b.z - a.z) * w + a.tx * lane * half
		out.tx = a.tx
		out.tz = a.tz
		return out
	}

	const spot = {}
	let last = 0,
		strength = 1
	return {
		update(time, camera) {
			const dt = Math.min(0.1, Math.max(0, time - last))
			last = time
			if (time - measuredAt > d.remeasure) measure(camera, time)
			const seat = readySeats.seatOf(local) ?? readySeats.seats[0]
			ribbon.visible = hopping.visible = !!(origin && seat)
			if (!ribbon.visible) return
			const length = shape(seat, time)
			strength += ((seat.enteredAt != null ? d.settled : 1) - strength) * Math.min(1, dt * 1.5)
			drift.uniforms.uTime.value = time
			drift.uniforms.uAlpha.value = d.alpha * strength
			// Grains hop off the drift, carried downwind at its speed.
			const y = tune.map.printLayers.lobby
			for (const [i, grain] of grains.entries()) {
				grain.age += dt / grain.life
				// The first hops start staggered, the rest where their last one landed in time.
				if (grain.age >= 1 || grain.lane === undefined) {
					grain.age %= 1
					grain.life = rand(...g.life)
					grain.u = rand(0.1, 0.75) * length
					grain.lane = rand(-0.6, 0.6)
					grain.hop = g.hop * rand(0.4, 1)
				}
				const u = grain.u + d.speed * grain.age * grain.life
				at(u, grain.lane, spot, length)
				const s = u / length,
					lift = Math.sin(Math.PI * grain.age)
				const climb = (Math.PI * grain.hop * Math.cos(Math.PI * grain.age)) / grain.life
				iPos.array.set([spot.x, y + grain.hop * lift, spot.z], i * 3)
				iVel.array.set([spot.tx * d.speed, climb, spot.tz * d.speed], i * 3)
				iSize.array.set([g.length + d.speed * g.streak, g.width], i * 2)
				iAlpha.array[i] =
					g.alpha * strength * lift * Math.max(0, Math.min(1, s / 0.15, (1 - s) / 0.2))
			}
			for (const a of [iPos, iVel, iSize, iAlpha]) a.needsUpdate = true
		},
		dispose() {
			group.removeFromParent()
			for (const item of [strip, drift, quad, sand, grainMaterial]) item.dispose()
		},
	}
}
