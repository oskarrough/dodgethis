import * as THREE from 'three'
import { FORWARD_LAYER } from '../../core/stylepass.js'
import { tune } from './tune.js'

// The plaza's Slab: a finite piece of pale tarmac over a torn rock rim, floating above the desert
// backdrop. The sheet and rock are forward-pass meshes, so the deferred pass keeps no ink on the
// rim and the props still stand on it; the deferred ground underneath is the same outline
// (see `slabShape`), kept so the plaza keeps its depth, and nothing is drawn beyond it.

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
export function slabOutline(s = tune.lobby.slab) {
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

// The ground the deferred pass draws and the sheet lies over.
export function slabShape(s = tune.lobby.slab) {
	// Shape x/y map to world x/z once the geometry is laid flat.
	const outline = slabOutline(s)
	const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, -p.z)))
	return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2)
}

function drawTexture(s) {
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
	g.fillStyle = c.tarmac
	g.fillRect(0, 0, w, h)
	// Big quiet blotches: patched tarmac, not a pattern.
	g.fillStyle = c.blotch
	for (let i = 0; i < 46; i++) {
		g.globalAlpha = 0.04 + rand() * 0.06
		g.beginPath()
		g.ellipse(
			rand() * w,
			rand() * h,
			(1.2 + rand() * 3) * ppm,
			(0.8 + rand() * 2) * ppm,
			rand() * 3,
			0,
			7,
		)
		g.fill()
	}
	g.globalAlpha = 1
	// Speckle.
	g.fillStyle = c.speck
	for (let i = 0; i < s.speckles; i++) {
		g.globalAlpha = 0.1 + rand() * 0.22
		const r = 0.6 + rand() * 1.4
		g.fillRect(rand() * w, rand() * h, r, r)
	}
	// Hairline cracks: short wandering walks.
	g.strokeStyle = c.crack
	g.lineCap = g.lineJoin = 'round'
	for (let i = 0; i < s.cracks; i++) {
		g.globalAlpha = 0.07 + rand() * 0.06
		g.lineWidth = 0.8 + rand() * 0.9
		let x = rand() * w,
			y = rand() * h,
			a = rand() * 6.28
		g.beginPath()
		g.moveTo(x, y)
		for (let k = 0, n = 6 + rand() * 12; k < n; k++) {
			a += (rand() - 0.5) * 1.2
			x += Math.cos(a) * (0.15 + rand() * 0.3) * ppm
			y += Math.sin(a) * (0.15 + rand() * 0.3) * ppm
			g.lineTo(x, y)
		}
		g.stroke()
	}
	g.globalAlpha = 1
	// Chalk: a little dusty, broken by wear.
	g.strokeStyle = c.chalk
	g.lineCap = 'round'
	g.lineJoin = 'round'
	g.lineWidth = s.chalkWidth * ppm
	g.globalAlpha = 0.9
	const r = tune.lobby.ready
	const seats = [-1, 1].flatMap((side) =>
		[-1, 0, 1].map((row) => ({ x: side * r.x, z: r.z + row * r.spacing })),
	)
	for (const seat of seats) {
		const hw = r.width / 2 + s.seatPad,
			hd = r.depth / 2 + s.seatPad
		g.strokeRect(px(seat.x - hw), pz(seat.z - hd), hw * 2 * ppm, hd * 2 * ppm)
	}
	const ga = tune.lobby.gallery
	const arcZ = ga.z - 0.9,
		R = s.arcRadius,
		reach = Math.min(s.halfX - s.jag - 1, (ga.spacing * 5) / 2 + 1)
	g.beginPath()
	g.arc(
		px(ga.x),
		pz(arcZ - R),
		R * ppm,
		Math.PI / 2 - Math.asin(reach / R),
		Math.PI / 2 + Math.asin(reach / R),
	)
	g.stroke()
	const ci = s.circle
	g.beginPath()
	g.arc(px(ci.x), pz(ci.z), ci.radius * ppm, 0, Math.PI * 2)
	g.stroke()
	g.beginPath()
	g.moveTo(px(ci.x - ci.radius), pz(ci.z))
	g.lineTo(px(ci.x + ci.radius), pz(ci.z))
	g.stroke()
	// Hopscotch: 1, 2-3, 4-5 up the slab (toward -z).
	const hs = s.hopscotch,
		k = hs.cell
	const cells = [
		[0, 0, 1],
		[-0.5, -1, 2],
		[0.5, -1, 3],
		[-0.5, -2, 4],
		[0.5, -2, 5],
	]
	g.font = `${Math.round(k * 0.5 * ppm)}px sans-serif`
	g.textAlign = 'center'
	g.textBaseline = 'middle'
	g.fillStyle = c.chalk
	for (const [cx, cz, n] of cells) {
		const x = hs.x + cx * k,
			z = hs.z + cz * k
		g.strokeRect(px(x - k / 2), pz(z - k / 2), k * ppm, k * ppm)
		g.fillText(String(n), px(x), pz(z))
	}
	// Weather the chalk: knock tarmac-coloured specks back over it.
	g.globalCompositeOperation = 'source-over'
	g.fillStyle = c.tarmac
	for (let i = 0; i < s.speckles * 0.5; i++) {
		g.globalAlpha = 0.35 + rand() * 0.4
		const q = 0.8 + rand() * 1.6
		g.fillRect(rand() * w, rand() * h, q, q)
	}
	g.globalAlpha = 1
	return canvas
}

// Flat-shaded rock: courses of ledges jutting out as they go down (steps inward would hide behind the rim), every face its own colour.
function rockGeometry(outline, s) {
	const rand = rng(s.seed + 303)
	const light = new THREE.Vector3(-0.4, 0.8, 0.45).normalize()
	const base = new THREE.Color(s.colors.rock),
		dark = new THREE.Color(s.colors.rockDark),
		ledge = new THREE.Color(s.colors.ledge)
	const positions = [],
		colors = []
	const a = new THREE.Vector3(),
		b = new THREE.Vector3(),
		n = new THREE.Vector3(),
		tint = new THREE.Color()
	const tri = (p, q, r, color) => {
		a.subVectors(q, p)
		b.subVectors(r, p)
		n.crossVectors(a, b).normalize()
		const shade = 0.78 + 0.32 * Math.max(0, n.dot(light))
		tint.copy(color).multiplyScalar(shade + (rand() - 0.5) * 0.08)
		for (const v of [p, q, r]) {
			positions.push(v.x, v.y, v.z)
			colors.push(tint.r, tint.g, tint.b)
		}
	}
	const quad = (p, q, r, t, color) => {
		tri(p, q, r, color)
		tri(p, r, t, color)
	}
	const count = outline.length
	const centre = { x: 0, z: 0 }
	const stepIn = (p, inset) => {
		const dx = centre.x - p.x,
			dz = centre.z - p.z
		const d = Math.hypot(dx, dz) || 1
		return { x: p.x - (dx / d) * inset, z: p.z - (dz / d) * inset }
	}
	const courseHeight = s.rockDepth / s.courses
	let ring = outline.map((p) => ({ ...p }))
	for (let c = 0; c < s.courses; c++) {
		const top = -c * courseHeight,
			bottom = -(c + 1) * courseHeight
		const next = outline.map((p) => {
			const inset = (c + 1) * s.courseInset * (0.5 + rand())
			const q = stepIn(p, inset)
			return { x: q.x + (rand() - 0.5) * s.courseJitter, z: q.z + (rand() - 0.5) * s.courseJitter }
		})
		// Per-vertex drop so each course's lower edge is ragged.
		const drop = ring.map(() => (rand() - 0.3) * courseHeight * 0.45)
		const wallColor = base.clone().lerp(dark, (c + 1) / s.courses)
		for (let i = 0; i < count; i++) {
			const j = (i + 1) % count
			const p0 = new THREE.Vector3(ring[i].x, top, ring[i].z)
			const p1 = new THREE.Vector3(ring[j].x, top, ring[j].z)
			const p2 = new THREE.Vector3(ring[j].x, bottom + drop[j], ring[j].z)
			const p3 = new THREE.Vector3(ring[i].x, bottom + drop[i], ring[i].z)
			// Wind so the face looks outward from the slab.
			quad(p0, p1, p2, p3, wallColor)
			// The ledge below: a step from this course's foot to the next course's top.
			if (c < s.courses - 1) {
				const q0 = new THREE.Vector3(next[i].x, bottom + drop[i], next[i].z)
				const q1 = new THREE.Vector3(next[j].x, bottom + drop[j], next[j].z)
				quad(p3, q0, q1, p2, ledge.clone().lerp(base, c * 0.35))
			}
		}
		ring = next
	}
	// Underside cap: shows only if the camera ever dips below the rim.
	const bottom = -s.rockDepth
	for (let i = 1; i < count - 1; i++)
		tri(
			new THREE.Vector3(ring[0].x, bottom, ring[0].z),
			new THREE.Vector3(ring[i + 1].x, bottom, ring[i + 1].z),
			new THREE.Vector3(ring[i].x, bottom, ring[i].z),
			dark,
		)
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
	geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
	return geometry
}

export function createLobbyFloor(scene, renderer) {
	const s = tune.lobby.slab
	const canvas = drawTexture(s)
	const texture = new THREE.CanvasTexture(canvas)
	texture.colorSpace = THREE.SRGBColorSpace
	texture.anisotropy = renderer?.capabilities.getMaxAnisotropy() ?? 1
	const outline = slabOutline(s)
	// One non-repeating texture across the whole slab: UVs are world position over its extent.
	const top = slabShape(s)
	const pos = top.attributes.position,
		uv = new Float32Array(pos.count * 2)
	for (let i = 0; i < pos.count; i++) {
		uv[i * 2] = (pos.getX(i) + s.halfX) / (s.halfX * 2)
		uv[i * 2 + 1] = 1 - (pos.getZ(i) + s.halfZ) / (s.halfZ * 2)
	}
	top.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
	const topMaterial = new THREE.MeshBasicMaterial({
		map: texture,
		depthWrite: false,
		// The forward pass tests against a copied depth buffer; pull the sheet onto the ground.
		polygonOffset: true,
		polygonOffsetFactor: -2,
		polygonOffsetUnits: -8,
	})
	const sheet = new THREE.Mesh(top, topMaterial)
	sheet.name = 'lobby-floor'
	sheet.position.y = tune.map.printLayers.plaza
	sheet.layers.set(FORWARD_LAYER)
	sheet.renderOrder = -2 // under stamps and every other forward effect

	const rockGeo = rockGeometry(outline, s)
	const rockMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })
	const rock = new THREE.Mesh(rockGeo, rockMaterial)
	rock.name = 'lobby-rock'
	rock.position.y = tune.map.printLayers.plaza - 0.01
	rock.layers.set(FORWARD_LAYER)
	rock.renderOrder = -3
	rock.frustumCulled = false
	scene.add(sheet, rock)
	return {
		dispose() {
			sheet.removeFromParent()
			rock.removeFromParent()
			top.dispose()
			rockGeo.dispose()
			topMaterial.dispose()
			rockMaterial.dispose()
			texture.dispose()
		},
	}
}
