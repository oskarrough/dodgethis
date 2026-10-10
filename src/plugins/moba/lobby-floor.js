import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { FORWARD_LAYER } from '../../core/stylepass.js'
import { PALETTE } from '../../core/style.js'
import { tune } from './tune.js'

// The lobby's floor is a huge glazed saucer resting in magnetic cradles, floating in the splash
// sky. The glaze, rim and cradles are forward-pass meshes, so the deferred pass keeps no ink on
// them and the props still stand on the glaze; the deferred ground underneath is the same ellipse
// (see `saucerShape`), kept so the lobby keeps its depth, and nothing is drawn beyond it.
// `floorOutline`, `floorShape` and `createFences` are Flagfall's torn shore, built from its extent.

function rng(seed) {
	let a = seed >>> 0 || 1
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

// Counter-clockwise (seen from above, x right, z toward the camera) torn outline. Only ever pulls
// in from the halfX/halfZ rectangle, by 0..jag, so the walkable rectangle can sit jag + 1 m inside.
export function floorOutline(s) {
	const rand = rng(s.seed)
	const corners = [
		[-s.halfX, -s.halfZ],
		[s.halfX, -s.halfZ],
		[s.halfX, s.halfZ],
		[-s.halfX, s.halfZ],
	]
	const raw = []
	for (let c = 0; c < 4; c++) {
		const [x0, z0] = corners[c]
		const [x1, z1] = corners[(c + 1) % 4]
		const length = Math.hypot(x1 - x0, z1 - z0)
		const n = Math.max(2, Math.round(length / s.step))
		for (let i = 0; i < n; i++) {
			const t = i / n
			raw.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, side: c, corner: i === 0 })
		}
	}
	// Smooth the pull-in along the edge so it reads torn rather than sawn, with the odd bite.
	const pull = raw.map(() => rand() * s.jag)
	const out = raw.map((p, i) => {
		const prev = pull[(i + raw.length - 1) % raw.length]
		const next = pull[(i + 1) % raw.length]
		const d = Math.min(
			s.jag,
			pull[i] * 0.6 + (prev + next) * 0.2 + (rand() < 0.12 ? s.jag * 0.5 : 0),
		)
		// Inward normal of the side: 0 top (+z), 1 right (-x), 2 bottom (-z), 3 left (+x).
		const nx = [0, -1, 0, 1][p.side],
			nz = [1, 0, -1, 0][p.side]
		let x = p.x + nx * d,
			z = p.z + nz * d
		if (p.corner) {
			// Corners take both sides' pull so they chip rather than poke out.
			const q = [3, 0, 1, 2][p.side]
			x += [0, -1, 0, 1][q] * d * 0.5
			z += [1, 0, -1, 0][q] * d * 0.5
		}
		return {
			x: Math.max(-s.halfX, Math.min(s.halfX, x)),
			z: Math.max(-s.halfZ, Math.min(s.halfZ, z)),
		}
	})
	return out
}

export function floorShape(s) {
	// Shape x/y map to world x/z once the geometry is laid flat.
	const outline = floorOutline(s)
	const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, -p.z)))
	return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2)
}

// Four broken runs rather than a perimeter cage. The safe rectangle is inside every possible
// torn outline; reserve the widest foot plus the bow before placing anything on it.
export function createFences(floor, s, y, name, depthMaterial = null) {
	const clearance =
		floor.jag + s.edgeMargin + Math.max(s.capRadius, s.bollardRadius) + Math.abs(s.bow)
	const halfX = floor.halfX - clearance,
		halfZ = floor.halfZ - clearance
	const group = new THREE.Group()
	group.name = name
	group.position.y = y
	const batches = { posts: [], caps: [], bollards: [], wire: [] }
	const wire = []
	const up = new THREE.Vector3(0, 1, 0)
	function rod(a, b, radius, batch) {
		const direction = new THREE.Vector3().subVectors(b, a)
		const geometry = new THREE.CylinderGeometry(
			radius,
			radius,
			direction.length(),
			s.radialSegments,
		)
		geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction.normalize()))
		geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
		batches[batch].push(geometry)
	}
	function upright(x, z, height, radius, capHeight, capRadius, batch) {
		rod(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, height, z), radius, batch)
		rod(
			new THREE.Vector3(x, height, z),
			new THREE.Vector3(x, height + capHeight, z),
			capRadius,
			'caps',
		)
	}
	for (const run of s.runs) {
		const from = new THREE.Vector3(run.from[0] * halfX, 0, run.from[1] * halfZ)
		const to = new THREE.Vector3(run.to[0] * halfX, 0, run.to[1] * halfZ)
		const length = from.distanceTo(to)
		const panels = Math.max(1, Math.ceil(length / s.panelWidth))
		const width = length / panels
		const normal = new THREE.Vector3(to.z - from.z, 0, from.x - to.x).normalize()
		for (let i = 0; i <= panels; i++) {
			const p = from.clone().lerp(to, i / panels)
			upright(p.x, p.z, s.height + s.postExtra, s.postRadius, s.capHeight, s.capRadius, 'posts')
		}
		for (let panel = 0; panel < panels; panel++) {
			const point = (x, y) => {
				const t = x / width,
					arch = 4 * t * (1 - t),
					v = y / s.height
				return from
					.clone()
					.lerp(to, (panel + t) / panels)
					.addScaledVector(normal, s.bow * arch * v)
					.setY(s.bottom + (s.height - s.bottom - s.sag * arch) * v)
			}
			for (let step = 0; step < s.curveSteps; step++)
				rod(
					point((width * step) / s.curveSteps, s.height),
					point((width * (step + 1)) / s.curveSteps, s.height),
					s.railRadius,
					'wire',
				)
			for (const slope of [-1, 1]) {
				for (let offset = -width; offset <= s.height + width; offset += s.diamond) {
					const start = Math.max(0, slope === 1 ? -offset : offset - s.height)
					const end = Math.min(width, slope === 1 ? s.height - offset : offset)
					if (end <= start) continue
					for (let step = 0; step < s.curveSteps; step++) {
						const x0 = start + ((end - start) * step) / s.curveSteps
						const x1 = start + ((end - start) * (step + 1)) / s.curveSteps
						const a = point(x0, slope * x0 + offset),
							b = point(x1, slope * x1 + offset)
						wire.push(a.x, a.y, a.z, b.x, b.y, b.z)
					}
				}
			}
		}
	}
	for (const [x, z] of s.bollards)
		upright(
			x * halfX,
			z * halfZ,
			s.bollardHeight,
			s.bollardRadius,
			s.bollardCapHeight,
			s.bollardRadius,
			'bollards',
		)
	const light = new THREE.Vector3(-0.4, 0.8, 0.45).normalize()
	for (const [batch, parts] of Object.entries(batches)) {
		if (!parts.length) continue
		const geometry = mergeGeometries(parts)
		for (const part of parts) part.dispose()
		const color = new THREE.Color(s.colors[batch])
		const normals = geometry.attributes.normal,
			colors = []
		for (let i = 0; i < normals.count; i++) {
			const shade =
				0.78 + 0.32 * Math.max(0, new THREE.Vector3().fromBufferAttribute(normals, i).dot(light))
			colors.push(color.r * shade, color.g * shade, color.b * shade)
		}
		geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
		const mesh = new THREE.Mesh(
			geometry,
			new THREE.MeshBasicMaterial({
				vertexColors: true,
				depthWrite: !depthMaterial,
				polygonOffset: !!depthMaterial,
				polygonOffsetFactor: -1,
				polygonOffsetUnits: -4,
			}),
		)
		mesh.layers.set(FORWARD_LAYER)
		group.add(mesh)
		if (depthMaterial) group.add(new THREE.Mesh(geometry, depthMaterial))
	}
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3))
	const mesh = new THREE.LineSegments(
		geometry,
		new THREE.LineBasicMaterial({ color: s.colors.wire, depthWrite: !depthMaterial }),
	)
	mesh.layers.set(FORWARD_LAYER)
	group.add(mesh)
	return group
}

// x = halfX cos t, z = halfZ sin t; seen from above, t runs clockwise from +x through the near edge.
function ellipsePoint(s, t) {
	return { x: Math.cos(t) * s.halfX, z: Math.sin(t) * s.halfZ }
}

// Outward normal of the ellipse at t.
function ellipseNormal(s, t) {
	const x = Math.cos(t) / s.halfX,
		z = Math.sin(t) / s.halfZ
	const d = Math.hypot(x, z)
	return new THREE.Vector3(x / d, 0, z / d)
}

// The glaze's walkable ellipse, laid flat; the rim's lip starts at its edge.
export function saucerShape(s = tune.lobby.floor) {
	const shape = new THREE.Shape()
	for (let i = 0; i < s.segments; i++) {
		const p = ellipsePoint(s, (i / s.segments) * Math.PI * 2)
		if (i === 0) shape.moveTo(p.x, -p.z)
		else shape.lineTo(p.x, -p.z)
	}
	return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2)
}

function drawGlaze(s) {
	const ppm = s.pixelsPerMeter
	const w = Math.ceil(s.halfX * 2 * ppm),
		h = Math.ceil(s.halfZ * 2 * ppm)
	const canvas = document.createElement('canvas')
	canvas.width = w
	canvas.height = h
	const g = canvas.getContext('2d')
	const c = s.colors
	const rand = rng(s.seed + 101)
	const px = (x) => (x + s.halfX) * ppm,
		pz = (z) => (z + s.halfZ) * ppm
	g.fillStyle = c.glaze
	g.fillRect(0, 0, w, h)
	g.save()
	g.beginPath()
	g.ellipse(w / 2, h / 2, s.halfX * ppm, s.halfZ * ppm, 0, 0, Math.PI * 2)
	g.clip()
	// Glaze pools a shade deeper toward the well, then catches light just inside the lip.
	g.save()
	g.translate(w / 2, h / 2)
	g.scale(s.halfX * ppm, s.halfZ * ppm)
	const well = 1 - s.well / Math.min(s.halfX, s.halfZ)
	const pool = g.createRadialGradient(0, 0, 0, 0, 0, 1)
	pool.addColorStop(0, 'rgba(255, 252, 240, 0.35)')
	pool.addColorStop(0.55, 'rgba(255, 252, 240, 0)')
	pool.addColorStop(well - 0.03, c.pool + '00')
	pool.addColorStop(well, c.pool + 'aa')
	pool.addColorStop(well + 0.012, c.pool + '33')
	pool.addColorStop(1, c.pool + '88')
	g.fillStyle = pool
	g.fillRect(-1, -1, 2, 2)
	g.restore()
	// Worn, duller patches where feet go.
	g.fillStyle = c.wear
	for (let i = 0; i < s.wear.patches; i++) {
		g.globalAlpha = 0.05 + rand() * 0.07
		g.beginPath()
		g.ellipse(
			px((rand() * 2 - 1) * s.halfX * 0.7),
			pz((rand() * 2 - 1) * s.halfZ * 0.7),
			(0.8 + rand() * 2.2) * ppm,
			(0.6 + rand() * 1.4) * ppm,
			rand() * 3,
			0,
			7,
		)
		g.fill()
	}
	// Iron speckle, as in stoneware.
	g.fillStyle = c.speck
	for (let i = 0; i < s.speckles; i++) {
		g.globalAlpha = 0.12 + rand() * 0.3
		const r = 0.5 + rand() * 1.1
		g.fillRect(rand() * w, rand() * h, r, r)
	}
	// Crazing: a jittered net of hairlines, broken here and there, patchy across the glaze.
	const cz = s.crazing,
		cell = cz.cell * ppm
	const cols = Math.ceil(w / cell) + 1,
		rows = Math.ceil(h / cell) + 1
	const net = []
	for (let j = 0; j <= rows; j++)
		for (let i = 0; i <= cols; i++)
			net.push([(i + (rand() - 0.5) * cz.jitter) * cell, (j + (rand() - 0.5) * cz.jitter) * cell])
	g.strokeStyle = c.craze
	g.lineWidth = Math.max(1, cz.width * ppm)
	g.lineCap = g.lineJoin = 'round'
	const patch = (x, y) =>
		0.5 + 0.5 * Math.sin(x * 0.011 + 1.3) * Math.cos(y * 0.014 - 0.4) * Math.sin((x + y) * 0.006)
	const hair = (a, b) => {
		const amount = patch(a[0], a[1])
		if (amount < 0.25 || rand() < cz.gaps) return
		g.globalAlpha = cz.alpha * amount * (0.6 + rand() * 0.6)
		const mx = (a[0] + b[0]) / 2 + (rand() - 0.5) * cell * 0.3,
			my = (a[1] + b[1]) / 2 + (rand() - 0.5) * cell * 0.3
		g.beginPath()
		g.moveTo(a[0], a[1])
		g.lineTo(mx, my)
		g.lineTo(b[0], b[1])
		g.stroke()
	}
	for (let j = 0; j <= rows; j++)
		for (let i = 0; i <= cols; i++) {
			const p = net[j * (cols + 1) + i]
			if (i < cols) hair(p, net[j * (cols + 1) + i + 1])
			if (j < rows) hair(p, net[(j + 1) * (cols + 1) + i])
		}
	// Chips near the lip show the biscuit under the glaze.
	for (let i = 0; i < s.wear.chips; i++) {
		const t = rand() * Math.PI * 2
		const inset = 0.15 + rand() * 0.6
		const e = ellipsePoint(s, t),
			n = ellipseNormal(s, t)
		const cx = px(e.x - n.x * inset),
			cy = pz(e.z - n.z * inset)
		const r = (0.05 + rand() * 0.14) * ppm
		g.beginPath()
		for (let k = 0, sides = 5 + Math.floor(rand() * 3); k < sides; k++) {
			const a = (k / sides) * Math.PI * 2,
				q = r * (0.55 + rand() * 0.6)
			g.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q * 0.8)
		}
		g.closePath()
		g.globalAlpha = 0.9
		g.fillStyle = c.biscuit
		g.fill()
		g.globalAlpha = 0.5
		g.lineWidth = 1
		g.strokeStyle = c.chipEdge
		g.stroke()
	}
	g.restore()
	g.globalAlpha = 1
	return canvas
}

// One sweep for rim, band and cradles: `profile` [u, v] points laid along `path` frames
// ({ o, u, v } vectors). Indexed, so smooth unless flattened.
function sweep(path, profile, { closePath = false, closeProfile = false } = {}) {
	const positions = []
	for (const f of path)
		for (const [u, v] of profile)
			positions.push(
				f.o.x + f.u.x * u + f.v.x * v,
				f.o.y + f.u.y * u + f.v.y * v,
				f.o.z + f.u.z * u + f.v.z * v,
			)
	const n = profile.length,
		index = []
	const runs = closePath ? path.length : path.length - 1
	const bands = closeProfile ? n : n - 1
	for (let i = 0; i < runs; i++) {
		const a = i * n,
			b = ((i + 1) % path.length) * n
		for (let k = 0; k < bands; k++) {
			const k1 = (k + 1) % n
			index.push(a + k, b + k, b + k1, a + k, b + k1, a + k1)
		}
	}
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
	geometry.setIndex(index)
	return geometry
}

const LIGHT = new THREE.Vector3(-0.4, 0.8, 0.45).normalize()
const HALF = LIGHT.clone()
	.add(new THREE.Vector3(0, 0.85, 0.53))
	.normalize()

// Baked light into vertex colours: `color(i)` per vertex, glaze gets a soft highlight.
function bake(geometry, color, { flat = false, gloss = 0 } = {}) {
	const g = flat ? geometry.toNonIndexed() : geometry
	if (flat) geometry.dispose()
	g.computeVertexNormals()
	const normals = g.attributes.normal,
		count = normals.count
	const n = new THREE.Vector3(),
		out = new Float32Array(count * 3),
		tint = new THREE.Color()
	for (let i = 0; i < count; i++) {
		n.fromBufferAttribute(normals, i)
		// Shading is symmetric under DoubleSide, so a flipped winding never goes dark.
		if (n.y < -0.98) n.negate()
		const shade = 0.74 + 0.34 * Math.max(0, n.dot(LIGHT))
		tint.copy(color(i)).multiplyScalar(shade)
		const spec = gloss * Math.max(0, n.dot(HALF)) ** 18
		out[i * 3] = Math.min(1, tint.r + spec)
		out[i * 3 + 1] = Math.min(1, tint.g + spec)
		out[i * 3 + 2] = Math.min(1, tint.b + spec)
	}
	g.setAttribute('color', new THREE.BufferAttribute(out, 3))
	return g
}

function rimFrames(s) {
	const frames = []
	const up = new THREE.Vector3(0, 1, 0)
	for (let i = 0; i < s.segments; i++) {
		const t = (i / s.segments) * Math.PI * 2
		const p = ellipsePoint(s, t)
		frames.push({ o: new THREE.Vector3(p.x, 0, p.z), u: ellipseNormal(s, t), v: up, t })
	}
	return frames
}

// A horseshoe magnet stood on edge round the rim at angle `deg`, its jaws either side of the
// saucer's edge with a hand's width of air: the saucer floats in them.
function cradleGeometry(s, deg) {
	const k = s.cradle
	const t = (deg * Math.PI) / 180
	const e = ellipsePoint(s, t)
	const out = ellipseNormal(s, t)
	const up = new THREE.Vector3(0, 1, 0)
	const axis = new THREE.Vector3().crossVectors(out, up)
	const centre = new THREE.Vector3(e.x, k.y, e.z).addScaledVector(out, s.rim.width + k.reach)
	const arc = (from, to, steps) => {
		const frames = []
		for (let i = 0; i <= steps; i++) {
			const a = from + ((to - from) * i) / steps
			const dir = out.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a))
			frames.push({ o: centre.clone().addScaledVector(dir, k.radius), u: dir, v: axis })
		}
		return frames
	}
	const square = (h, w) => [
		[-h, -w],
		[h, -w],
		[h, w],
		[-h, w],
	]
	const open = (k.open * Math.PI) / 180
	const pole = k.pole / k.radius
	const parts = []
	const add = (frames, profile, color) => {
		const g = sweep(frames, profile, { closeProfile: true })
		// Cap both ends: two triangles across the square.
		const pos = [...g.attributes.position.array]
		const idx = [...g.index.array]
		for (const end of [frames[0], frames.at(-1)]) {
			const start = pos.length / 3
			for (const [u, v] of profile)
				pos.push(
					end.o.x + end.u.x * u + end.v.x * v,
					end.o.y + end.u.y * u + end.v.y * v,
					end.o.z + end.u.z * u + end.v.z * v,
				)
			idx.push(start, start + 1, start + 2, start, start + 2, start + 3)
		}
		const capped = new THREE.BufferGeometry()
		capped.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
		capped.setIndex(idx)
		g.dispose()
		parts.push(bake(capped, () => color, { flat: true }))
	}
	const iron = new THREE.Color(s.colors.iron),
		cap = new THREE.Color(s.colors.pole)
	const reach = Math.PI - open
	add(arc(-reach + pole, reach - pole, k.steps), square(k.tube / 2, k.tube / 2), iron)
	for (const side of [-1, 1]) {
		const a = side * (reach - pole),
			b = side * reach
		add(arc(Math.min(a, b), Math.max(a, b), 2), square(k.tube * 0.54, k.tube * 0.54), cap)
	}
	return parts
}

export function createLobbyFloor(scene, renderer) {
	const s = tune.lobby.floor
	const canvas = drawGlaze(s)
	const texture = new THREE.CanvasTexture(canvas)
	texture.colorSpace = THREE.SRGBColorSpace
	texture.anisotropy = renderer?.capabilities.getMaxAnisotropy() ?? 1
	// One non-repeating texture across the whole glaze: UVs are world position over its extent.
	const top = saucerShape(s)
	const pos = top.attributes.position,
		uv = new Float32Array(pos.count * 2)
	for (let i = 0; i < pos.count; i++) {
		uv[i * 2] = (pos.getX(i) + s.halfX) / (s.halfX * 2)
		uv[i * 2 + 1] = 1 - (pos.getZ(i) + s.halfZ) / (s.halfZ * 2)
	}
	top.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
	const group = new THREE.Group()
	group.name = 'lobby-saucer'
	group.position.y = tune.map.printLayers.lobby
	const owned = [texture]
	const forward = (geometry, material, name, order) => {
		const mesh = new THREE.Mesh(geometry, material)
		mesh.name = name
		mesh.layers.set(FORWARD_LAYER)
		mesh.renderOrder = order
		mesh.frustumCulled = false
		group.add(mesh)
		owned.push(geometry, material)
		return mesh
	}
	forward(
		top,
		new THREE.MeshBasicMaterial({
			map: texture,
			depthWrite: false,
			// The forward pass tests against a copied depth buffer; pull the glaze onto the ground.
			polygonOffset: true,
			polygonOffsetFactor: -2,
			polygonOffsetUnits: -8,
		}),
		'lobby-floor',
		-2, // under stamps and every other forward effect
	)
	const frames = rimFrames(s)
	const r = s.rim
	const rand = rng(s.seed + 303)
	// Worn spots on the lip, where the glaze has gone and the biscuit shows.
	const worn = frames.map(() => rand() < s.wear.lip)
	const glaze = new THREE.Color(s.colors.rim),
		biscuit = new THREE.Color(s.colors.biscuit)
	// Lip profile: up from the glaze's edge to a rounded crest, then over and down to the glaze line.
	const lip = [
		[0, 0],
		[r.width * 0.3, r.height * 0.35],
		[r.width * 0.55, r.height * 0.85],
		[r.width * 0.72, r.height],
		[r.width * 0.88, r.height * 0.8],
		[r.width * 0.97, r.height * 0.35],
		[r.width, -r.glazeLine],
	]
	const crest = new Set([2, 3, 4])
	const lipGeo = bake(
		sweep(frames, lip, { closePath: true }),
		(i) => (worn[Math.floor(i / lip.length)] && crest.has(i % lip.length) ? biscuit : glaze),
		{ gloss: s.gloss },
	)
	const vertexMaterial = () =>
		new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })
	forward(lipGeo, vertexMaterial(), 'lobby-saucer-lip', -3)
	// The unglazed body: a thick band that tucks in to a foot ring, darkening as it goes down.
	const d = s.depth
	const band = [
		[r.width, -r.glazeLine],
		[r.width * 1.03, -d * 0.35],
		[r.width * 0.98, -d * 0.75],
		[r.width * 0.75, -d * 0.92],
		[r.width * 0.3, -d],
		[-r.width * 1.5, -d * 1.04],
	]
	const body = new THREE.Color(s.colors.body),
		dark = new THREE.Color(s.colors.bodyDark),
		mix = new THREE.Color()
	const bandGeo = bake(
		sweep(frames, band, { closePath: true }),
		(i) => mix.copy(body).lerp(dark, (i % band.length) / (band.length - 1)),
		{ flat: true },
	)
	forward(bandGeo, vertexMaterial(), 'lobby-saucer-band', -3)
	// Thin ink on the silhouette: the lip's outer edge and the foot.
	const lineMaterial = new THREE.LineBasicMaterial({ color: PALETTE.ink })
	owned.push(lineMaterial)
	for (const [u, v] of [
		[r.width * 0.99, 0],
		[r.width * 0.3, -d],
	]) {
		const points = frames.map((f) => f.o.clone().addScaledVector(f.u, u).setY(v))
		const geometry = new THREE.BufferGeometry().setFromPoints(points)
		const line = new THREE.LineLoop(geometry, lineMaterial)
		line.layers.set(FORWARD_LAYER)
		line.frustumCulled = false
		group.add(line)
		owned.push(geometry)
	}
	const cradleParts = s.cradle.angles.flatMap((deg) => cradleGeometry(s, deg))
	const cradles = mergeGeometries(cradleParts)
	for (const part of cradleParts) part.dispose()
	forward(cradles, vertexMaterial(), 'lobby-cradles', -3)
	const edges = new THREE.EdgesGeometry(cradles, 30)
	const cradleLines = new THREE.LineSegments(edges, lineMaterial)
	cradleLines.layers.set(FORWARD_LAYER)
	cradleLines.frustumCulled = false
	group.add(cradleLines)
	owned.push(edges)
	scene.add(group)
	return {
		group,
		dispose() {
			group.removeFromParent()
			for (const item of owned) item.dispose()
		},
	}
}
