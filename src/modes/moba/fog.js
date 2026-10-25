import * as THREE from 'three'
import { FORWARD_LAYER } from '../../core/stylepass.js'
import { paint } from './restyle.js'
import { tune } from './tune.js'

// The haze is three.js's fog_fragment, mix(colour, fogColour, factor), laid over the ground:
// the factor is a sight mask instead of camera distance, its rim wanders and the haze thins in
// slow drifting patches, all in world metres so nothing swims with the camera.
const vertexShader = /* glsl */ `
varying vec2 vUv;
varying vec2 vWorld;
void main() {
	vUv = uv;
	vec4 world = modelMatrix * vec4(position, 1.0);
	vWorld = world.xz;
	gl_Position = projectionMatrix * viewMatrix * world;
}`

const fragmentShader = /* glsl */ `
uniform sampler2D uMask;
uniform vec3 uShade;
uniform vec3 uSky;
uniform vec2 uSize;
uniform float uTime;
uniform float uEdge;
uniform vec4 uLook; // dim, sky share, cloud, drift (m)
uniform vec4 uRim; // court half-size (xy), metres past it where the haze starts and finishes fading
varying vec2 vUv;
varying vec2 vWorld;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
}
void main() {
	vec2 flow = vec2(0.5, 0.2) * uTime;
	float a = noise(vWorld * 0.3 + flow);
	float b = noise(vWorld * 0.3 - flow.yx + 7.0);
	vec2 warp = (vec2(a, b) - 0.5) * 2.0 * uLook.w;
	// Nine taps over the rim width feather the mask's hard circles.
	vec2 uv = vUv + vec2(warp.x, -warp.y) / uSize;
	vec2 e = vec2(uEdge, -uEdge) / uSize;
	float fog = texture2D(uMask, uv).r * 0.2;
	fog += (texture2D(uMask, uv + vec2(e.x, 0.0)).r + texture2D(uMask, uv - vec2(e.x, 0.0)).r) * 0.1;
	fog += (texture2D(uMask, uv + vec2(0.0, e.y)).r + texture2D(uMask, uv - vec2(0.0, e.y)).r) * 0.1;
	e *= 0.5;
	fog += (texture2D(uMask, uv + e).r + texture2D(uMask, uv - e).r) * 0.1;
	fog += (texture2D(uMask, uv + vec2(e.x, -e.y)).r + texture2D(uMask, uv - vec2(e.x, -e.y)).r) * 0.1;
	float cloud = noise(vWorld * 0.07 + flow * 0.15) * 0.7 + b * 0.3;
	vec3 col = mix(uShade, uSky, clamp(uLook.y + (cloud - 0.5) * uLook.z, 0.0, 1.0));
	// Only the court and its rim strip haze over; past the cliff edge the surround stays clear.
	vec2 past = max(abs(vWorld) - uRim.xy, 0.0);
	float keep = 1.0 - smoothstep(uRim.z, uRim.w, length(past));
	gl_FragColor = vec4(col, fog * uLook.x * (1.0 - uLook.z * cloud) * keep);
}`

// Fog of war behind `?fog`: your team's heroes, minions and structures see a circle each.
// Enemy units outside every circle vanish and unseen ground hazes over in the map's shade and
// sky colours. Presentation only: the sim and the bots stay omniscient.
export function createFog(scene, bounds, brush = [], palette = {}) {
	const f = tune.fog
	// The haze runs past the floor's edge, so the visible rim beyond it never shows a lit strip.
	const halfX = bounds.halfX + f.margin,
		halfZ = bounds.halfZ + f.margin
	// The sight mask, red = fog: hard circles, feathered and drifted in the shader.
	const canvas = document.createElement('canvas')
	canvas.width = Math.ceil(halfX * 2 * f.resolution)
	canvas.height = Math.ceil(halfZ * 2 * f.resolution)
	const ctx = canvas.getContext('2d')
	const texture = new THREE.CanvasTexture(canvas)
	const color = (hex) => new THREE.Color(hex ?? 0x4f4b5e)
	const material = new THREE.ShaderMaterial({
		vertexShader,
		fragmentShader,
		uniforms: {
			uMask: { value: texture },
			uShade: { value: palette.light ? paint(palette.light, 'shade') : color() },
			uSky: { value: palette.page === undefined ? color() : paint(palette, 'page') },
			uSize: { value: new THREE.Vector2(halfX * 2, halfZ * 2) },
			uTime: { value: 0 },
			uEdge: { value: 0 },
			uLook: { value: new THREE.Vector4() },
			uRim: { value: new THREE.Vector4(bounds.halfX, bounds.halfZ, f.rimFade[0], f.rimFade[1]) },
		},
		transparent: true,
		depthWrite: false,
	})
	const plane = new THREE.Mesh(
		new THREE.PlaneGeometry(halfX * 2, halfZ * 2).rotateX(-Math.PI / 2),
		material,
	)
	plane.position.y = f.height
	plane.renderOrder = 1
	plane.layers.set(FORWARD_LAYER)
	scene.add(plane)
	const seen = new Set()
	const at = (unit) => unit.body.mesh?.position ?? unit.body.position
	const s = f.resolution
	// Reused per frame: viewer units, their sight radii, and the circles last drawn (x, y, r in px).
	const viewers = []
	const radii = []
	let drawn = new Float64Array(192)
	let circles = new Float64Array(192)
	let count = -1
	// Drawn circles by viewer id ({ x, z, r, frame }): each grows in when a viewer appears and
	// shrinks out where one died, so sight opens and closes gently instead of popping.
	const rings = new Map()
	let frame = 0
	let last = 0
	const hidden = (p) =>
		brush.some((b) => Math.abs(p.x - b.x) <= b.halfX && Math.abs(p.z - b.z) <= b.halfZ)
	const sees = (p) => {
		const reach = hidden(p) ? f.brush * f.brush : Infinity
		for (let i = 0; i < viewers.length; i++) {
			const q = at(viewers[i])
			const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2
			if (d <= radii[i] * radii[i] && d <= reach) return true
		}
		return false
	}
	const look = (unit, team, r) => {
		if (unit.team !== team || unit.dead) return
		viewers.push(unit)
		radii.push(r)
	}
	const show = (unit, team) => {
		const visible = unit.team === team || sees(at(unit))
		if (visible) seen.add(unit.id)
		if (unit.body.mesh) unit.body.mesh.visible = visible
	}

	return {
		seen,
		// The haze reaches past the island, so from the descent's side view it would hang over the cloud sea.
		update(sim, team, shown = true) {
			plane.visible = shown
			const now = performance.now() / 1000
			const dt = last ? Math.min(now - last, 0.1) : Infinity
			last = now
			// Sim time, so pause stills the drift.
			material.uniforms.uTime.value = (sim.tick ?? 0) / 60
			material.uniforms.uLook.value.set(f.dim, f.sky, f.cloud, f.drift)
			material.uniforms.uEdge.value = f.edge
			const lane = sim.lane
			viewers.length = radii.length = 0
			for (const u of sim.heroes) look(u, team, f.sight.hero)
			for (const u of sim.dummies) look(u, team, f.sight.hero)
			for (const u of lane?.minions ?? []) look(u, team, f.sight.minion)
			for (const u of lane?.structures ?? []) look(u, team, f.sight.structure)
			seen.clear()
			// Structures stay drawn, as remembered landmarks; heroes and minions hide.
			for (const unit of lane?.structures ?? []) seen.add(unit.id)
			for (const unit of sim.heroes) show(unit, team)
			for (const unit of sim.dummies) show(unit, team)
			for (const unit of lane?.minions ?? []) if (!unit.dead) show(unit, team)
			for (const unit of sim.summons ?? []) if (!unit.dead) show(unit, team)

			const k = 1 - Math.exp(-dt * f.reveal)
			frame++
			for (let i = 0; i < viewers.length; i++) {
				const q = at(viewers[i])
				let ring = rings.get(viewers[i].id)
				if (!ring) rings.set(viewers[i].id, (ring = { x: 0, z: 0, r: 0, frame }))
				ring.x = q.x
				ring.z = q.z
				ring.frame = frame
				ring.r += (radii[i] - ring.r) * k
				if (Math.abs(radii[i] - ring.r) < 0.05) ring.r = radii[i]
			}
			for (const [id, ring] of rings) {
				if (ring.frame === frame) continue
				ring.r -= ring.r * k
				if (ring.r < 0.2) rings.delete(id)
			}

			// Redraw and reupload the mask only when a circle moved, grew, appeared or vanished.
			const n = rings.size * 3
			if (circles.length < n)
				[circles, drawn, count] = [new Float64Array(n * 2), new Float64Array(n * 2), -1]
			let same = n === count
			let i = 0
			for (const ring of rings.values()) {
				const x = (ring.x + halfX) * s
				const y = (ring.z + halfZ) * s
				const r = ring.r * s
				circles[i] = x
				circles[i + 1] = y
				circles[i + 2] = r
				if (same) same = drawn[i] === x && drawn[i + 1] === y && drawn[i + 2] === r
				i += 3
			}
			if (same) return
			;[drawn, circles, count] = [circles, drawn, n]
			ctx.fillStyle = '#fff'
			ctx.fillRect(0, 0, canvas.width, canvas.height)
			ctx.fillStyle = '#000'
			ctx.beginPath()
			for (let i = 0; i < n; i += 3) {
				const x = drawn[i]
				const y = drawn[i + 1]
				const r = drawn[i + 2]
				ctx.moveTo(x + r, y)
				ctx.arc(x, y, r, 0, Math.PI * 2)
			}
			ctx.fill()
			texture.needsUpdate = true
		},
		dispose() {
			scene.remove(plane)
			plane.geometry.dispose()
			material.dispose()
			texture.dispose()
		},
	}
}
