import * as THREE from 'three'
import { FORWARD_LAYER } from '../../core/stylepass.js'
import { floorOutline } from './lobby-floor.js'

// Overthrow by day: the stone isle under the court. A presentation skin in the forward layer,
// never a source of walking bounds or colliders; everything sits outside the torn rim.
// Colour is printed in three flat light bands from the map's sun, then dissolves into warm
// haze with depth and distance, so the court stays the crispest thing in frame.
export function createIsle(parent, s, extent, sun) {
	const owned = []
	const own = (resource) => {
		owned.push(resource)
		return resource
	}
	const meshes = []
	const c = s.colors
	const color = (hex) => new THREE.Color(hex)
	const shared = {
		uSun: { value: new THREE.Vector3(...sun).normalize() },
		uTop: { value: s.groundY },
		uIsle: { value: new THREE.Vector2(extent.halfX, extent.halfZ) },
		uInk: { value: color(c.ink) },
		uHaze: { value: color(c.haze) },
		uHazeShape: {
			value: new THREE.Vector4(s.haze.top, s.haze.bottom, s.haze.power, s.haze.max),
		},
		uHazeReach: { value: new THREE.Vector2(s.haze.near, s.haze.far) },
	}

	const stone = own(
		new THREE.ShaderMaterial({
			uniforms: {
				...shared,
				uStoneLit: { value: color(c.stoneLit) },
				uStone: { value: color(c.stone) },
				uStoneShade: { value: color(c.stoneShade) },
				uMoss: { value: color(c.moss) },
				uMossShade: { value: color(c.mossShade) },
				uMossLine: { value: new THREE.Vector2(s.cliff.mossMin, s.cliff.mossMax) },
				uStrata: { value: new THREE.Vector2(s.cliff.strata, s.cliff.strataInk) },
			},
			vertexShader: /* glsl */ `
attribute vec2 stone; // x: 0 stone, 1 moss, 2 cliff (moss lip by depth); y: tone drift
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vStone;
void main() {
	vec4 world = modelMatrix * vec4(position, 1.0);
	vWorld = world.xyz;
	vNormal = normalize(mat3(modelMatrix) * normal);
	vStone = stone;
	gl_Position = projectionMatrix * viewMatrix * world;
}`,
			fragmentShader: /* glsl */ `
${HAZE}
uniform vec3 uSun, uStoneLit, uStone, uStoneShade, uMoss, uMossShade, uInk;
uniform vec2 uMossLine, uStrata;
varying vec3 vNormal;
varying vec2 vStone;
float isleHash(float n) { return fract(sin(n) * 43758.5453); }
float isleNoise(float x) {
	float i = floor(x), f = fract(x);
	f = f * f * (3.0 - 2.0 * f);
	return mix(isleHash(i), isleHash(i + 1.0), f);
}
void main() {
	vec3 n = normalize(vNormal);
	float light = dot(n, uSun) * 0.5 + 0.5;
	// Three printed bands, never a gradient.
	vec3 col = light > 0.62 ? uStoneLit : (light > 0.44 ? uStone : uStoneShade);
	vec3 moss = light > 0.44 ? uMoss : uMossShade;
	col *= 1.0 + vStone.y;
	float drop = uTop - vWorld.y;
	float along = vWorld.x + vWorld.z * 1.37;
	float lip = mix(uMossLine.x, uMossLine.y, 0.6 * isleNoise(along * 1.3) + 0.4 * isleNoise(along * 3.7 + 11.0));
	bool mossy = (vStone.x > 0.5 && vStone.x < 1.5) || (vStone.x > 1.5 && drop < lip);
	if (mossy) col = moss;
	else {
		// A few broken ink strata on vertical faces only.
		float steep = 1.0 - smoothstep(0.35, 0.6, abs(n.y));
		float y = (vWorld.y + 0.35 * sin(along * 0.45)) / uStrata.x;
		float d = min(fract(y), 1.0 - fract(y));
		float strata = 1.0 - smoothstep(0.025, 0.025 + fwidth(y), d);
		strata *= step(0.45, isleNoise(along * 0.6 + floor(y + 0.5) * 7.31));
		col = mix(col, uInk, strata * steep * uStrata.y);
	}
	gl_FragColor = vec4(isleHaze(col), 1.0);
}`,
		}),
	)

	// --- The cliff: stacked rings under the torn rim, leaning out as they fall. ---
	const outline = floorOutline(extent)
	const count = outline.length
	const rand = seeded(extent.seed * 7 + 3)
	const outward = outline.map((p, i) => {
		const a = outline[(i + count - 1) % count],
			b = outline[(i + 1) % count]
		// Edge direction a→b; the outward side is whichever normal points away from the centre.
		let nx = b.z - a.z,
			nz = -(b.x - a.x)
		const length = Math.hypot(nx, nz) || 1
		nx /= length
		nz /= length
		if (nx * p.x + nz * p.z < 0) {
			nx = -nx
			nz = -nz
		}
		return { x: nx, z: nz }
	})
	const cliff = s.cliff
	const columns = outline.map(() => (rand() - 0.5) * cliff.column)
	// Ring 0 is the rim itself, ring 1 a short lip under the moss, then ledges down into cloud.
	const rings = [
		{ drop: 0, push: () => 0 },
		{ drop: 0.35, push: () => 0.06 },
	]
	let ledge = 0
	for (let k = 1; k <= cliff.levels; k++) {
		const drop = Math.max(0.8, cliff.depth * Math.pow(k / cliff.levels, 1.6))
		if (rand() < 0.4) ledge += cliff.ledge * (0.4 + rand())
		const step = ledge
		const wobble = outline.map(() => (rand() - 0.5) * cliff.column * 0.5)
		rings.push({ drop, push: (i) => cliff.flare * drop + step + columns[i] + wobble[i] })
	}
	const points = rings.map((ring) =>
		outline.map((p, i) => {
			const push = ring.push(i)
			return new THREE.Vector3(
				p.x + outward[i].x * push,
				s.groundY - ring.drop,
				p.z + outward[i].z * push,
			)
		}),
	)
	const positions = [],
		normals = [],
		stones = []
	const ab = new THREE.Vector3(),
		ad = new THREE.Vector3(),
		normal = new THREE.Vector3()
	const face = (a, b, cc, d, kind, out) => {
		ab.subVectors(b, a)
		ad.subVectors(d, a)
		normal.crossVectors(ab, ad).normalize()
		if (normal.x * out.x + normal.z * out.z < 0) normal.negate()
		const tone = (rand() - 0.5) * 0.08
		for (const p of [a, b, cc, a, cc, d]) {
			positions.push(p.x, p.y, p.z)
			normals.push(normal.x, normal.y, normal.z)
			stones.push(kind, tone)
		}
	}
	for (let k = 0; k < rings.length - 1; k++)
		for (let i = 0; i < count; i++) {
			const j = (i + 1) % count
			const out = { x: outward[i].x + outward[j].x, z: outward[i].z + outward[j].z }
			face(points[k][i], points[k][j], points[k + 1][j], points[k + 1][i], 2, out)
		}
	const rock = own(new THREE.BufferGeometry())
	rock.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
	rock.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
	rock.setAttribute('stone', new THREE.Float32BufferAttribute(stones, 2))
	forward(new THREE.Mesh(rock, stone), 'overthrow-cliff')

	// The thin ink line along the cliff top, flat on the rim so it hugs the court's edge.
	const ink = own(new THREE.MeshBasicMaterial({ color: c.ink, depthWrite: false }))
	const line = []
	for (let i = 0; i < count; i++) {
		const j = (i + 1) % count
		const a = outline[i],
			b = outline[j]
		const w = cliff.rimInk
		const ao = { x: a.x + outward[i].x * w, z: a.z + outward[i].z * w }
		const bo = { x: b.x + outward[j].x * w, z: b.z + outward[j].z * w }
		const y = s.groundY + 0.001
		line.push(a.x, y, a.z, bo.x, y, bo.z, b.x, y, b.z, a.x, y, a.z, ao.x, y, ao.z, bo.x, y, bo.z)
	}
	const rim = own(new THREE.BufferGeometry())
	rim.setAttribute('position', new THREE.Float32BufferAttribute(line, 3))
	ink.side = THREE.DoubleSide
	const rimMesh = forward(new THREE.Mesh(rim, ink), 'overthrow-rim-ink')
	rimMesh.renderOrder = -3

	function forward(mesh, name) {
		mesh.name = name
		mesh.layers.set(FORWARD_LAYER)
		mesh.frustumCulled = false
		meshes.push(mesh)
		return mesh
	}
	parent.add(...meshes)
	return {
		update() {},
		dispose() {
			for (const mesh of meshes) mesh.removeFromParent()
			for (const resource of owned) resource.dispose()
		},
	}
}

// Depth and distance haze toward the cloud colour; shared by every isle shader.
const HAZE = /* glsl */ `
uniform vec3 uHaze;
uniform vec4 uHazeShape; // top, bottom (metres under the rim), power, max
uniform vec2 uHazeReach; // horizontal metres past the rim: near, far
uniform vec2 uIsle;
uniform float uTop;
varying vec3 vWorld;
vec3 isleHaze(vec3 col) {
	float drop = pow(smoothstep(uHazeShape.x, uHazeShape.y, uTop - vWorld.y), uHazeShape.z);
	vec2 past = max(abs(vWorld.xz) - uIsle, 0.0);
	float far = smoothstep(uHazeReach.x, uHazeReach.y, length(past));
	return mix(col, uHaze, min(uHazeShape.w, 1.0 - (1.0 - drop) * (1.0 - far)));
}`

function seeded(seed) {
	let a = seed >>> 0 || 1
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}
