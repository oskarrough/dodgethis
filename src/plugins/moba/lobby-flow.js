import * as THREE from 'three'
import { PALETTE } from '../../core/style.js'
import { FORWARD_LAYER } from '../../core/stylepass.js'
import { tune } from './tune.js'

// What the plates are for, shown rather than said: bots walk onto their plates as you arrive, your
// own plate ripples until you stand in it, and a groove inlaid in the glaze runs from every plate into
// a trunk that carries on to the weather bowl. Each branch fills as its plate glazes; the trunk fills
// by the share of glazed plates, so it reaches the bowl only once everyone is in.
// `?flow=` picks how the glaze fills the grooves: run (along them, toward the bowl), rise (up from the
// groove's floor, all along at once), off (the lobby without any of it). Read at load, before the
// splash rewrites the address, so it holds through the splash and back from a match.
const askedFlow = new URLSearchParams(globalThis.location?.search).get('flow')
export function lobbyFlowStyle() {
	return ['run', 'rise', 'off'].includes(askedFlow) ? askedFlow : tune.lobby.flow.style
}

// A rounded rectangle laid flat, centred on its group.
function plateShape(width, depth, corner) {
	const w = width / 2,
		d = depth / 2,
		c = Math.min(corner, w, d)
	const s = new THREE.Shape()
	s.moveTo(-w + c, -d)
	s.lineTo(w - c, -d)
	s.quadraticCurveTo(w, -d, w, -d + c)
	s.lineTo(w, d - c)
	s.quadraticCurveTo(w, d, w - c, d)
	s.lineTo(-w + c, d)
	s.quadraticCurveTo(-w, d, -w, d - c)
	s.lineTo(-w, -d + c)
	s.quadraticCurveTo(-w, -d, -w + c, -d)
	return new THREE.ShapeGeometry(s, 6).rotateX(-Math.PI / 2)
}

// A groove's centreline through `points` ([x, z]), its corners rounded off `corner` m either side,
// sampled every `step` m: positions, unit normals (to the left of travel) and distance along.
function groovePath(points, corner, step) {
	const v = points.map(([x, z]) => new THREE.Vector2(x, z))
	const path = new THREE.CurvePath()
	let from = v[0]
	for (let i = 1; i < v.length; i++) {
		const to = v[i]
		if (i === v.length - 1) {
			path.add(new THREE.LineCurve(from, to))
			break
		}
		const next = v[i + 1]
		const r = Math.min(corner, to.distanceTo(from) / 2, to.distanceTo(next) / 2)
		const into = to.clone().sub(from).setLength(r),
			out = next.clone().sub(to).setLength(r)
		const a = to.clone().sub(into),
			b = to.clone().add(out)
		path.add(new THREE.LineCurve(from, a))
		path.add(new THREE.QuadraticBezierCurve(a, to, b))
		from = b
	}
	const length = path.getLength()
	const at = path.getSpacedPoints(Math.max(2, Math.ceil(length / step)))
	const normals = at.map((p, i) => {
		const t = at[Math.min(i + 1, at.length - 1)]
			.clone()
			.sub(at[Math.max(i - 1, 0)])
			.normalize()
		return new THREE.Vector2(-t.y, t.x)
	})
	const along = at.map((_, i) => (i / (at.length - 1)) * length)
	return { at, normals, along, length }
}

// The groove's cross-section, edge to edge: the lips, then where the shadow under the lit lip ends.
const ACROSS = [-1, -0.45, 0.45, 1]

// A flat ribbon along a groove path, four vertices across; positions and colours are rewritten live.
function ribbon(path) {
	const n = path.at.length
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 12), 3))
	geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 12), 3))
	const index = []
	for (let i = 0; i < n - 1; i++)
		for (let c = 0; c < 3; c++) {
			const a = i * 4 + c,
				b = a + 4
			index.push(a, b, a + 1, a + 1, b, b + 1)
		}
	geometry.setIndex(index)
	return geometry
}

function shapeRibbon(geometry, path, halfWidth) {
	const p = geometry.attributes.position.array
	for (let i = 0; i < path.at.length; i++) {
		const w = halfWidth(path.along[i], i)
		for (let c = 0; c < 4; c++) {
			const k = (i * 4 + c) * 3
			p[k] = path.at[i].x + path.normals[i].x * ACROSS[c] * w
			p[k + 1] = 0
			p[k + 2] = path.at[i].y + path.normals[i].y * ACROSS[c] * w
		}
	}
	geometry.attributes.position.needsUpdate = true
}

function paintRibbon(geometry, path, colorAt) {
	const p = geometry.attributes.color.array
	const color = new THREE.Color()
	for (let i = 0; i < path.at.length; i++)
		for (let c = 0; c < 4; c++) {
			colorAt(color, path.along[i], i, c)
			color.toArray(p, (i * 4 + c) * 3)
		}
	geometry.attributes.color.needsUpdate = true
}

export function createLobbyFlow(scene, readySeats, local, style = lobbyFlowStyle()) {
	const f = tune.lobby.flow,
		g = f.groove,
		r = tune.lobby.ready,
		b = tune.lobby.bowl
	const on = style !== 'off'
	const root = new THREE.Group()
	root.name = 'lobby-flow'
	scene.add(root)
	const owned = []
	const own = (...items) => (owned.push(...items), items[0])
	const forward = (object) => {
		object.layers.set(FORWARD_LAYER)
		object.frustumCulled = false
		root.add(object)
		return object
	}
	// Grooves are glaze like the plates: forward meshes laid on the saucer in paint order, lips first,
	// then every bed over every lip so the joins read as one channel, then the glaze running in them.
	const glaze = (options, order) => (geometry) => {
		const material = own(
			new THREE.MeshBasicMaterial({
				depthWrite: false,
				side: THREE.DoubleSide,
				polygonOffset: true,
				polygonOffsetFactor: -2,
				polygonOffsetUnits: -8,
				...options,
			}),
		)
		const mesh = forward(new THREE.Mesh(own(geometry), material))
		mesh.position.y = tune.map.printLayers.lobby
		mesh.renderOrder = order
		return mesh
	}
	const lipOf = glaze({ color: PALETTE.ink }, -1.9)
	const bedOf = glaze({ vertexColors: true }, -1.75)
	const fillOf = glaze({ vertexColors: true }, -1.65)
	const tone = (role) => new THREE.Color(PALETTE[role]).lerp(new THREE.Color(PALETTE.cream), r.tint)
	const bed = new THREE.Color(g.bed),
		shadow = bed.clone().lerp(new THREE.Color(PALETTE.ink), g.shadow),
		cream = new THREE.Color(PALETTE.cream)
	// Light falls from the screen's top left, so the lip on that side shades the bed under it.
	const light = new THREE.Vector2(-1, -1).normalize()
	function groove(points, width, color) {
		const path = groovePath(points, g.corner, g.step)
		const half = width / 2
		const lip = lipOf(ribbon(path)),
			floor = bedOf(ribbon(path)),
			fill = fillOf(ribbon(path))
		shapeRibbon(lip.geometry, path, () => half + g.lip)
		shapeRibbon(floor.geometry, path, () => half)
		paintRibbon(floor.geometry, path, (out, s, i, c) => {
			const side = ACROSS[c] < 0 ? -1 : 1
			const lit = c === 0 || c === 3 ? path.normals[i].dot(light) * side : 0
			out.copy(bed).lerp(shadow, Math.max(0, lit))
		})
		fill.visible = false
		return { path, half: half - g.margin, fill, color, level: 0 }
	}
	// Each plate's branch leaves its well's inner side for the trunk halfway between the columns; the
	// trunk runs up the aisle, past the plates' far end, and on under the bowl.
	const xs = readySeats.seats.map((s) => s.x),
		zs = readySeats.seats.map((s) => s.z)
	const aisle = (Math.min(...xs) + Math.max(...xs)) / 2
	const well = r.width / 2 - r.borderWidth - r.band - g.margin
	const branches = readySeats.seats.map((seat) => {
		const side = Math.sign(aisle - seat.x)
		const from = [seat.x + side * well, seat.z]
		return { seat, ...groove([from, [aisle, seat.z]], g.width, tone(`team${seat.team}`)) }
	})
	const trunk = groove(
		[
			[aisle, Math.max(...zs)],
			[aisle, g.z],
			[b.x - b.radius * g.into, g.z],
		],
		g.trunk,
		tone('bowl'),
	)
	const yours = tone('ammo')
	// Your plate ripples out from under its rim until you stand in it.
	const ripple = forward(
		new THREE.Mesh(
			own(plateShape(r.width, r.depth, r.corner)),
			own(
				new THREE.MeshBasicMaterial({
					color: PALETTE.ammo,
					transparent: true,
					depthWrite: false,
					polygonOffset: true,
					polygonOffsetFactor: -1,
					polygonOffsetUnits: -4,
				}),
			),
		),
	)
	ripple.position.y = tune.map.printLayers.lobby
	ripple.renderOrder = -2
	ripple.visible = false
	root.visible = on
	// Bots walk on: each from where it last stood (the saucer's middle when new), one after another.
	const arrivals = new Map() // bot id → { seat, from, at }
	let start = null,
		queued = 0
	function arrive(seat, time) {
		const bot = seat.occupant
		const known = arrivals.get(bot.id)
		if (known?.seat === seat.id) return known
		const was = known && readySeats.seats.find((s) => s.id === known.seat)
		const from = was ? { x: was.x, z: was.z } : { x: seat.x * f.walk.from, z: seat.z }
		const first = time - start < f.walk.delay
		const at = first ? start + f.walk.delay + queued++ * f.walk.stagger : time
		const entry = { seat: seat.id, from, at }
		arrivals.set(bot.id, entry)
		return entry
	}
	function walkOf(seat, time) {
		if (!on || !seat.occupant?.bot) return null
		const a = arrive(seat, time)
		const k = Math.max(0, Math.min(1, (time - a.at) / f.walk.time))
		return { a, k }
	}
	// The glaze in a groove: run fills it from its start toward the bowl, a rounded front leading; rise
	// fills it everywhere at once, a trickle down the middle that widens to the lips.
	function pour(lane, time, color) {
		const { path, fill, level } = lane
		fill.visible = level > 0
		if (!fill.visible) return
		const front = level * path.length
		shapeRibbon(fill.geometry, path, (s) =>
			style === 'rise'
				? lane.half * level
				: lane.half * Math.sqrt(Math.max(0, Math.min(1, (front - s) / g.taper))),
		)
		// Glints drift along it toward the bowl, and the running front is paler, like wet glaze.
		paintRibbon(fill.geometry, path, (out, s) => {
			const glint =
				(0.5 + 0.5 * Math.sin((s / g.glint.spacing - time * g.glint.speed) * 2 * Math.PI)) ** 8
			const wet = style === 'run' && level < 1 ? Math.max(0, 1 - (front - s) / g.front) : 0
			out.copy(color).lerp(cream, Math.max(glint * g.glint.amount, wet * 0.6))
		})
	}
	let now = 0
	return {
		style,
		// Where a bot's hologram stands on its way to its plate, relative to the plate; null once on it.
		offset(seat) {
			const w = walkOf(seat, now)
			if (!w || w.k >= 1) return null
			const e = 1 - (1 - w.k) ** 2
			return {
				x: (w.a.from.x - seat.x) * (1 - e),
				z: (w.a.from.z - seat.z) * (1 - e),
				y: Math.abs(Math.sin(w.k * Math.PI * f.walk.hops)) * f.walk.hop,
				hidden: now < w.a.at,
			}
		},
		// A bot's plate glazes over once it has stepped on, like yours does.
		progress(seat, progress) {
			const w = walkOf(seat, now)
			if (!w) return progress
			return Math.max(0, Math.min(1, (now - w.a.at - f.walk.time) / r.fillTime))
		},
		update(time, progressOf) {
			const dt = Math.max(0, time - now)
			now = time
			start ??= time
			if (!on) return
			const mine = readySeats.seatOf(local)
			ripple.visible = !!mine && progressOf(mine) === 0
			if (ripple.visible) {
				const k = (time / f.ripple.period) % 1
				ripple.position.x = mine.x
				ripple.position.z = mine.z
				ripple.scale.set(1 + k * f.ripple.grow, 1, 1 + (k * f.ripple.grow * r.width) / r.depth)
				ripple.material.opacity = f.ripple.opacity * (1 - k) ** 2
			}
			// A branch fills once its plate's glaze is `lead` of the way in; stepping off drains it.
			const settle = (lane, target) =>
				(lane.level = target >= lane.level ? target : Math.max(target, lane.level - dt / g.drain))
			let total = 0
			for (const lane of branches) {
				const p = progressOf(lane.seat)
				settle(lane, Math.max(0, (p - g.lead) / (1 - g.lead)))
				total += lane.level
				pour(lane, time, lane.seat === mine ? yours : lane.color)
			}
			settle(trunk, total / branches.length)
			pour(trunk, time, trunk.color)
		},
		dispose() {
			root.removeFromParent()
			for (const item of owned) item.dispose()
		},
	}
}
