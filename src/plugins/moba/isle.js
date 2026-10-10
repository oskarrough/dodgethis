import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
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
		uTime: { value: 0 },
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
attribute vec2 stone; // x: 0 stone, 1 moss, 2 cliff (moss lip by depth), 3 mossy tops; y: tone drift
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
	bool mossy = (vStone.x > 0.5 && vStone.x < 1.5) || (vStone.x > 1.5 && vStone.x < 2.5 && drop < lip) || (vStone.x > 2.5 && n.y > 0.7);
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

	// --- Far stone: spires and broken arches out of the cloud, lower and hazier with distance. ---
	const far = { positions: [], normals: [], stones: [] }
	const solid = (geometry, kind) => {
		const g = geometry.toNonIndexed()
		geometry.dispose()
		g.computeVertexNormals()
		const p = g.attributes.position,
			n = g.attributes.normal
		for (let v = 0; v < p.count; v += 3) {
			const tone = (rand() - 0.5) * 0.1
			for (let k = v; k < v + 3; k++) {
				far.positions.push(p.getX(k), p.getY(k), p.getZ(k))
				far.normals.push(n.getX(k), n.getY(k), n.getZ(k))
				far.stones.push(kind, tone)
			}
		}
		g.dispose()
	}
	const sp = s.spires
	const base = s.clouds.y - 6
	const spire = (x, z, radius, top) => {
		const height = top - base
		const lean = (rand() - 0.5) * 0.12
		solid(
			new THREE.CylinderGeometry(radius * 0.8, radius * 1.25, height, sp.sides)
				.rotateY(rand() * Math.PI)
				.translate(0, height / 2, 0)
				.rotateZ(lean)
				.rotateX(lean * 0.6)
				.translate(x, base, z),
			3,
		)
		// A broken shoulder partway down: stone has strata, not one clean shaft.
		const shoulder = top - height * (0.25 + rand() * 0.2)
		solid(
			new THREE.CylinderGeometry(radius * 1.05, radius * 1.15, 0.9, sp.sides)
				.rotateY(rand() * Math.PI)
				.translate(x + (rand() - 0.5) * radius * 0.4, shoulder, z),
			3,
		)
	}
	const around = (distance, ends = 0) => {
		// A point `distance` metres past the rim; `ends` biases it toward the isle's short
		// ends, where the match camera looks straight past the rim.
		const angle =
			rand() < ends ? (rand() < 0.5 ? 0 : Math.PI) + (rand() - 0.5) * 1.4 : rand() * Math.PI * 2
		const dx = Math.cos(angle),
			dz = Math.sin(angle)
		const reach = Math.min(
			(extent.halfX + distance) / Math.max(1e-3, Math.abs(dx)),
			(extent.halfZ + distance) / Math.max(1e-3, Math.abs(dz)),
		)
		return { x: dx * reach, z: dz * reach }
	}
	const height = (distance) => Math.min(-4, -6 - distance * 0.28 + (rand() - 0.5) * 6)
	for (let i = 0; i < sp.count; i++) {
		const distance = sp.near + Math.pow(rand(), 0.8) * (sp.far - sp.near)
		const at = around(distance, 0.5)
		spire(at.x, at.z, sp.radius[0] + rand() * (sp.radius[1] - sp.radius[0]), height(distance))
	}
	for (let i = 0; i < sp.arches; i++) {
		const distance = sp.near + 8 + rand() * (sp.far - sp.near) * 0.6
		const at = around(distance, 0.6)
		const top = height(distance) - 2
		const span = 7 + rand() * 5
		const along = Math.atan2(at.z, at.x) + Math.PI / 2
		const ux = Math.cos(along),
			uz = Math.sin(along)
		const radius = 1.4 + rand() * 0.6
		spire(at.x - (ux * span) / 2, at.z - (uz * span) / 2, radius, top)
		spire(at.x + (ux * span) / 2, at.z + (uz * span) / 2, radius, top - 1.5 - rand() * 2)
		// The lintel, one end slumped where it broke.
		solid(
			new THREE.BoxGeometry(span + radius * 1.6, 1.8, radius * 1.8)
				.rotateZ(0.08 + rand() * 0.06)
				.rotateY(-along)
				.translate(at.x, top - 1, at.z),
			3,
		)
	}
	const farGeometry = own(new THREE.BufferGeometry())
	farGeometry.setAttribute('position', new THREE.Float32BufferAttribute(far.positions, 3))
	farGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(far.normals, 3))
	farGeometry.setAttribute('stone', new THREE.Float32BufferAttribute(far.stones, 2))
	forward(new THREE.Mesh(farGeometry, stone), 'overthrow-far-stone')

	// --- The sea of cloud: printed bands in a drifting field, glowing toward the sun. ---
	const cl = s.clouds
	const sunXZ = new THREE.Vector2(sun[0], sun[2]).normalize()
	const sea = own(
		new THREE.ShaderMaterial({
			uniforms: {
				...shared,
				uCloudLit: { value: color(c.cloudLit) },
				uCloud: { value: color(c.cloud) },
				uCloudShade: { value: color(c.cloudShade) },
				uCloudDeep: { value: color(c.cloudDeep) },
				uCloudScale: { value: cl.scale },
				uDrift: { value: new THREE.Vector2(...cl.drift) },
				uSunXZ: { value: sunXZ },
			},
			vertexShader: /* glsl */ `
varying vec3 vWorld;
void main() {
	vec4 world = modelMatrix * vec4(position, 1.0);
	vWorld = world.xyz;
	gl_Position = projectionMatrix * viewMatrix * world;
}`,
			fragmentShader: /* glsl */ `
${HAZE}
${NOISE}
uniform vec3 uCloudLit, uCloud, uCloudShade, uCloudDeep;
uniform float uCloudScale, uTime;
uniform vec2 uDrift, uSunXZ;
void main() {
	vec2 p = (vWorld.xz - uDrift * uTime) / uCloudScale;
	float a = isleFbm(p);
	// Sample toward the sun: a puff's sunward side is brighter than its far side.
	float b = isleFbm(p + uSunXZ * 0.12);
	float body = smoothstep(0.4, 0.46, a);
	float lit = (a - b) * 9.0 + 0.5;
	vec3 col = lit > 0.62 ? uCloudLit : (lit > 0.4 ? uCloud : uCloudShade);
	col = mix(uCloudDeep, col, body);
	// A soft bloom in the haze on the sun's side.
	float glow = smoothstep(-40.0, 160.0, dot(vWorld.xz, uSunXZ));
	col = mix(col, uCloudLit, glow * 0.35);
	gl_FragColor = vec4(mix(col, uHaze, 0.25), 1.0);
}`,
		}),
	)
	const seaMesh = forward(
		new THREE.Mesh(own(new THREE.PlaneGeometry(cl.size, cl.size).rotateX(-Math.PI / 2)), sea),
		'overthrow-cloud-sea',
	)
	seaMesh.position.y = cl.y

	// --- Cloud banks hugging the isle below the rim: soft toon puffs that bob. ---
	const puff = own(
		new THREE.ShaderMaterial({
			uniforms: {
				...shared,
				uCloudLit: { value: color(c.cloudLit) },
				uCloud: { value: color(c.cloud) },
				uCloudShade: { value: color(c.cloudShade) },
				uBob: { value: cl.bob },
			},
			vertexShader: /* glsl */ `
uniform float uTime, uBob;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
	vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
	float phase = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.07;
	world.y += sin(uTime * 0.35 + phase) * uBob;
	vWorld = world.xyz;
	vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
	gl_Position = projectionMatrix * viewMatrix * world;
}`,
			fragmentShader: /* glsl */ `
${HAZE}
uniform vec3 uSun, uCloudLit, uCloud, uCloudShade;
varying vec3 vNormal;
void main() {
	float light = dot(normalize(vNormal), uSun) * 0.5 + 0.5;
	vec3 col = light > 0.66 ? uCloudLit : (light > 0.42 ? uCloud : uCloudShade);
	gl_FragColor = vec4(isleHaze(col), 1.0);
}`,
		}),
	)
	const puffs = new THREE.InstancedMesh(own(new THREE.IcosahedronGeometry(1, 3)), puff, cl.puffs)
	const matrix = new THREE.Matrix4(),
		q = new THREE.Quaternion(),
		size = new THREE.Vector3(),
		at = new THREE.Vector3()
	for (let i = 0; i < cl.puffs; i++) {
		const r = cl.puffMin + rand() * (cl.puffMax - cl.puffMin)
		const spot = around(r * 0.3 + rand() * 10)
		at.set(spot.x, -(cl.puffDepth[0] + rand() * (cl.puffDepth[1] - cl.puffDepth[0])), spot.z)
		size.set(r * (1 + rand() * 0.6), r * 0.55, r)
		q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI)
		puffs.setMatrixAt(i, matrix.compose(at, q, size))
	}
	forward(puffs, 'overthrow-cloud-banks')

	// --- Waterfalls: white ribbons draped down the cliff, streaks running down. ---
	const fall = own(
		new THREE.ShaderMaterial({
			uniforms: {
				...shared,
				uWater: { value: color(c.water) },
				uWaterShade: { value: color(c.waterShade) },
				uFallSpeed: { value: s.fallSpeed },
			},
			vertexShader: /* glsl */ `
varying vec3 vWorld;
varying vec2 vFall;
void main() {
	vec4 world = modelMatrix * vec4(position, 1.0);
	vWorld = world.xyz;
	vFall = uv;
	gl_Position = projectionMatrix * viewMatrix * world;
}`,
			fragmentShader: /* glsl */ `
${HAZE}
${NOISE}
uniform vec3 uWater, uWaterShade;
uniform float uTime, uFallSpeed;
varying vec2 vFall; // x across 0..1, y metres fallen
void main() {
	float streak = isleNoise(vec2(vFall.x * 7.0, (vFall.y - uTime * uFallSpeed) * 0.18));
	float edge = smoothstep(0.0, 0.18, vFall.x) * smoothstep(1.0, 0.82, vFall.x);
	vec3 col = streak * edge > 0.42 ? uWater : uWaterShade;
	gl_FragColor = vec4(isleHaze(col), 1.0);
}`,
		}),
	)
	for (const spot of s.falls) {
		// The rim segment nearest the spot; the ribbon follows that facet's columns down.
		let best = 0
		for (let i = 0; i < count; i++)
			if (
				Math.hypot(outline[i].x - spot.x, outline[i].z - spot.z) <
				Math.hypot(outline[best].x - spot.x, outline[best].z - spot.z)
			)
				best = i
		const j = (best + 1) % count
		const segment = Math.hypot(outline[j].x - outline[best].x, outline[j].z - outline[best].z)
		const half = Math.min(0.45, spot.width / 2 / Math.max(0.1, segment))
		const ribbon = [],
			uvs = [],
			index = []
		const lift = 0.12
		for (let k = 0; k < rings.length; k++) {
			const a = points[k][best],
				b = points[k][j]
			const ox = (outward[best].x + outward[j].x) * 0.5 * lift,
				oz = (outward[best].z + outward[j].z) * 0.5 * lift
			for (const u of [0.5 - half, 0.5 + half]) {
				ribbon.push(a.x + (b.x - a.x) * u + ox, a.y + 0.02, a.z + (b.z - a.z) * u + oz)
				uvs.push(u < 0.5 ? 0 : 1, rings[k].drop)
			}
			if (k) index.push(2 * k - 2, 2 * k - 1, 2 * k + 1, 2 * k - 2, 2 * k + 1, 2 * k)
		}
		const geometry = own(new THREE.BufferGeometry())
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(ribbon, 3))
		geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
		geometry.setIndex(index)
		fall.side = THREE.DoubleSide
		forward(new THREE.Mesh(geometry, fall), 'overthrow-waterfall')
	}

	// --- Flagfall by night: a big moon low in the void, a garden at the rim, specks in the dark. ---
	const glow = (hex, size, opacity, at, soft = 0.5) => {
		const sprite = new THREE.Sprite(
			own(
				new THREE.SpriteMaterial({
					map: own(glowTexture(soft)),
					color: hex,
					transparent: true,
					opacity,
					blending: THREE.AdditiveBlending,
					depthWrite: false,
				}),
			),
		)
		sprite.scale.setScalar(size)
		sprite.position.copy(at)
		return sprite
	}
	if (s.moon) {
		const mo = s.moon
		const at = new THREE.Vector3(...mo.at)
		const disc = new THREE.Sprite(
			own(new THREE.SpriteMaterial({ map: own(moonTexture(mo)), depthWrite: false, fog: false })),
		)
		disc.scale.setScalar(mo.size)
		disc.position.copy(at)
		forward(disc, 'flagfall-moon').renderOrder = -6
		forward(glow(mo.halo, mo.size * mo.haloScale, mo.haloOpacity, at, 0), 'flagfall-moon-halo')
	}
	if (s.garden) {
		const g = s.garden
		const leaves = { positions: [], normals: [], stones: [] }
		const bells = []
		const add = (geometry) => {
			const flat = geometry.toNonIndexed()
			geometry.dispose()
			flat.computeVertexNormals()
			const p = flat.attributes.position,
				n = flat.attributes.normal
			for (let v = 0; v < p.count; v++) {
				leaves.positions.push(p.getX(v), p.getY(v), p.getZ(v))
				leaves.normals.push(n.getX(v), n.getY(v), n.getZ(v))
				leaves.stones.push(1, 0)
			}
			flat.dispose()
		}
		// A pointed leaf, base at the origin, growing along +y.
		const leafShape = new THREE.Shape()
		leafShape.moveTo(0, 0)
		leafShape.quadraticCurveTo(0.5, 0.45, 0, 1)
		leafShape.quadraticCurveTo(-0.5, 0.45, 0, 0)
		const specks = []
		for (let i = 0; i < count; i += g.every) {
			if (rand() > g.chance) continue
			const o = outward[i]
			const north = o.z < -0.5
			const reach = 0.25 + rand() * 0.5
			const root = new THREE.Vector3(
				outline[i].x + o.x * reach,
				s.groundY - g.sink,
				outline[i].z + o.z * reach,
			)
			const facing = Math.atan2(o.x, o.z)
			const tall = north ? g.tall : g.low
			for (let k = 0; k < g.leaves; k++) {
				const length = g.leaf[0] + rand() * (g.leaf[1] - g.leaf[0])
				const yaw = facing + (rand() - 0.5) * 2.1
				// Lean out over the drop; only the far rim's plants stand up past the court.
				const lean = Math.PI / 2 - Math.asin(Math.min(1, tall / length)) * (0.5 + rand() * 0.5)
				add(
					new THREE.ShapeGeometry(leafShape, 3)
						.scale(length * g.width, length, 1)
						.rotateX(lean)
						.rotateY(yaw)
						.translate(root.x, root.y, root.z),
				)
			}
			for (let k = 0; k < g.bells; k++) {
				// A bell hangs from an arching stem, mouth down, with a cream glow in its throat.
				const yaw = facing + (rand() - 0.5) * 1.6
				const out = 0.5 + rand() * 0.9
				const tip = new THREE.Vector3(
					root.x + Math.sin(yaw) * out,
					root.y + (north ? g.tall * 0.6 : 0.1) + rand() * 0.3,
					root.z + Math.cos(yaw) * out,
				)
				const size = g.bell * (0.75 + rand() * 0.5)
				bells.push(
					new THREE.CylinderGeometry(size * 0.25, size, size * 1.3, 7, 1, true).translate(
						tip.x,
						tip.y - size * 0.75,
						tip.z,
					),
					new THREE.CylinderGeometry(0.02, 0.03, tip.distanceTo(root), 4)
						.translate(0, tip.distanceTo(root) / 2, 0)
						.applyQuaternion(
							new THREE.Quaternion().setFromUnitVectors(
								new THREE.Vector3(0, 1, 0),
								tip.clone().sub(root).normalize(),
							),
						)
						.translate(root.x, root.y, root.z),
				)
				specks.push(new THREE.Vector3(tip.x, tip.y - size * 1.3, tip.z))
			}
		}
		const leafGeometry = own(new THREE.BufferGeometry())
		leafGeometry.setAttribute('position', new THREE.Float32BufferAttribute(leaves.positions, 3))
		leafGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(leaves.normals, 3))
		leafGeometry.setAttribute('stone', new THREE.Float32BufferAttribute(leaves.stones, 2))
		const leafMaterial = own(stone.clone())
		leafMaterial.uniforms = { ...stone.uniforms, ...shared }
		leafMaterial.side = THREE.DoubleSide
		forward(new THREE.Mesh(leafGeometry, leafMaterial), 'flagfall-garden-leaves')
		if (bells.length) {
			const merged = own(mergeGeometries(bells))
			for (const b of bells) b.dispose()
			const petal = own(new THREE.MeshBasicMaterial({ color: g.flower, side: THREE.DoubleSide }))
			forward(new THREE.Mesh(merged, petal), 'flagfall-garden-bells')
		}
		for (const at of specks) {
			forward(glow(g.glow, g.glowSize, 0.9, at, 0.15), 'flagfall-stamen')
			forward(glow(g.glow, g.glowSize * g.glowHalo, g.glowHaloOpacity, at), 'flagfall-stamen-halo')
		}
	}
	if (s.specks) {
		const k = s.specks
		const points = []
		for (let i = 0; i < k.count; i++) {
			const spot = around(k.near + rand() * (k.far - k.near))
			points.push(spot.x, k.y[0] + rand() * (k.y[1] - k.y[0]), spot.z)
		}
		const geometry = own(new THREE.BufferGeometry())
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
		const material = own(
			new THREE.PointsMaterial({
				color: k.color,
				size: k.size,
				map: own(glowTexture(0.2)),
				transparent: true,
				blending: THREE.AdditiveBlending,
				depthWrite: false,
			}),
		)
		forward(new THREE.Points(geometry, material), 'flagfall-specks')
	}

	function forward(mesh, name) {
		mesh.name = name
		mesh.layers.set(FORWARD_LAYER)
		mesh.frustumCulled = false
		meshes.push(mesh)
		return mesh
	}
	parent.add(...meshes)
	return {
		update(dt) {
			shared.uTime.value += dt
		},
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

const NOISE = /* glsl */ `
float isleHash2(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float isleNoise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(isleHash2(i), isleHash2(i + vec2(1, 0)), f.x), mix(isleHash2(i + vec2(0, 1)), isleHash2(i + vec2(1, 1)), f.x), f.y);
}
float isleFbm(vec2 p) {
	float sum = 0.0, amp = 0.5;
	for (int i = 0; i < 4; i++) { sum += amp * isleNoise(p); p = p * 2.03 + 17.1; amp *= 0.5; }
	return sum;
}`

// A soft round glow: `soft` 0 fades from the centre, 1 is a hard disc.
export function glowTexture(soft) {
	const size = 64
	const canvas = document.createElement('canvas')
	canvas.width = canvas.height = size
	const ctx = canvas.getContext('2d')
	const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
	g.addColorStop(0, '#fff')
	g.addColorStop(Math.min(0.95, soft), 'rgba(255,255,255,0.85)')
	g.addColorStop(1, 'rgba(255,255,255,0)')
	ctx.fillStyle = g
	ctx.fillRect(0, 0, size, size)
	const texture = new THREE.CanvasTexture(canvas)
	texture.colorSpace = THREE.SRGBColorSpace
	return texture
}

// The moon: a flat lilac disc with a few soft seas and a thin ink rim.
function moonTexture(m) {
	const size = 256
	const canvas = document.createElement('canvas')
	canvas.width = canvas.height = size
	const ctx = canvas.getContext('2d')
	const r = size / 2 - 3
	ctx.beginPath()
	ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2)
	ctx.fillStyle = m.color
	ctx.fill()
	ctx.save()
	ctx.clip()
	ctx.fillStyle = m.seas
	for (const [x, y, rr] of [
		[0.38, 0.36, 0.16],
		[0.6, 0.55, 0.12],
		[0.45, 0.7, 0.09],
		[0.7, 0.3, 0.06],
	]) {
		ctx.beginPath()
		ctx.arc(x * size, y * size, rr * size, 0, Math.PI * 2)
		ctx.fill()
	}
	ctx.restore()
	ctx.lineWidth = 2.5
	ctx.strokeStyle = m.ink
	ctx.beginPath()
	ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2)
	ctx.stroke()
	const texture = new THREE.CanvasTexture(canvas)
	texture.colorSpace = THREE.SRGBColorSpace
	return texture
}

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
