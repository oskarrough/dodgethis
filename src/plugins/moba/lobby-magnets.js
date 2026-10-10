import * as THREE from 'three'
import { makeStyleMaterial } from '../../core/stylepass.js'
import { tune } from './tune.js'

const MOODS = { easy: 'sleepy', normal: 'calm', hard: 'angry' }
const COLORS = { easy: 'portalChill', normal: 'portalSpicy', hard: 'portalChaos' }
const ease = (u) => 1 - (1 - u) ** 3
const hash = (n) => {
	const s = Math.sin(n * 12.9898) * 43758.5453
	return s - Math.floor(s)
}

// Shared face parts, drawn in the XY plane facing +z: sleepy half-lidded eyes, calm dots, angry dots under brows.
export function createFaceKit() {
	const geometries = {
		dot: new THREE.CircleGeometry(1, 14),
		lid: new THREE.CircleGeometry(1, 14, Math.PI, Math.PI),
		brow: new THREE.PlaneGeometry(2.6, 0.7),
	}
	function face(difficulty, size, material) {
		const group = new THREE.Group()
		const mood = MOODS[difficulty]
		const eye = size * 0.22
		for (const side of [-1, 1]) {
			const e = new THREE.Mesh(mood === 'sleepy' ? geometries.lid : geometries.dot, material)
			e.scale.setScalar(eye)
			e.position.set(side * size * 0.42, mood === 'sleepy' ? size * 0.12 : size * 0.02, 0)
			group.add(e)
			if (mood !== 'angry') continue
			const brow = new THREE.Mesh(geometries.brow, material)
			brow.scale.setScalar(eye)
			brow.position.set(side * size * 0.4, size * 0.36, 0)
			brow.rotation.z = -side * 0.5
			group.add(brow)
		}
		return group
	}
	return {
		face,
		dispose() {
			for (const g of Object.values(geometries)) g.dispose()
		},
	}
}

// The difficulty gallery as three floating horseshoe magnets. The picked one's balls slam on and
// stick, then spin back out into orbit; the others lose their pull and drop their balls to the floor.
// Pure presentation over the gallery's sim state: picks are read from each standee's changedAt.
export function createMagnets(root, gallery, kit, audio) {
	const g = tune.lobby.gallery
	const m = g.magnet
	const owned = []
	const own = (x) => (owned.push(x), x)
	const style = (role, flat = true) =>
		own(makeStyleMaterial(role, { flat, side: THREE.DoubleSide }))
	const ink = style('ink'),
		cream = style('cream'),
		steel = style('ammoTip', false),
		spark = style('ammo'),
		padInk = style('ink')
	const geo = {
		arch: own(new THREE.TorusGeometry(m.arch, m.tube, 8, 18, Math.PI)),
		leg: own(new THREE.CylinderGeometry(m.tube, m.tube, m.leg, 10)),
		tip: own(new THREE.CylinderGeometry(m.tube * 1.05, m.tube * 1.05, m.tip, 10)),
		face: own(new THREE.CircleGeometry(m.face, 18)),
		ball: own(new THREE.SphereGeometry(m.ball, 14, 10)),
		band: own(new THREE.TorusGeometry(m.ball * 1.01, m.ball * 0.16, 5, 18)),
		spark: own(new THREE.PlaneGeometry(m.tube * 1.6, m.tube * 0.22)),
		pad: own(new THREE.RingGeometry(g.radius, g.radius + g.ringWidth, 24)),
		hit: own(new THREE.BoxGeometry(g.width, g.height, 0.4)),
	}
	const add = (geometry, material, parent) => {
		const mesh = new THREE.Mesh(geometry, material)
		parent.add(mesh)
		return mesh
	}
	const tipY = -m.leg - m.tip
	// Where stuck balls hang, in magnet space: under each pole, then a third chained under the left one.
	const slots = [
		[-m.arch, tipY - m.ball],
		[m.arch, tipY - m.ball],
		[-m.arch, tipY - m.ball * 3],
	]
	const point = new THREE.Vector3()
	const axis = new THREE.Vector3()
	const spin = new THREE.Quaternion()
	const props = gallery.standees.map((stand, index) => {
		const mood = m.moods[stand.id]
		const card = new THREE.Group()
		card.position.set(stand.x, 0, stand.z)
		root.add(card)
		const hit = add(geo.hit, ink, card)
		hit.visible = false
		hit.position.y = g.height / 2
		const magnet = new THREE.Group()
		card.add(magnet)
		const body = style(COLORS[stand.id])
		add(geo.arch, body, magnet)
		for (const side of [-1, 1]) {
			add(geo.leg, body, magnet).position.set(side * m.arch, -m.leg / 2, 0)
			add(geo.tip, steel, magnet).position.set(side * m.arch, -m.leg - m.tip / 2, 0)
		}
		const sticker = add(geo.face, cream, magnet)
		sticker.position.set(0, m.arch, m.tube + 0.005)
		const face = kit.face(stand.id, m.face, ink)
		face.position.set(0, m.arch, m.tube + 0.012)
		magnet.add(face)
		const sparks = mood.crackle > 0 ? [0, 1, 2].map(() => add(geo.spark, spark, magnet)) : []
		const pad = add(geo.pad, padInk, root)
		pad.rotation.x = -Math.PI / 2
		pad.position.set(stand.x, g.ringY, stand.z)
		const chosen = stand.id === gallery.difficulty
		const balls = Array.from({ length: mood.balls }, (_, i) => {
			const mesh = add(geo.ball, steel, root)
			add(geo.band, ink, mesh)
			mesh.rotation.set(i, i * 2, 0)
			const a = (i / mood.balls) * Math.PI * 2 + index
			return {
				mesh,
				state: chosen ? 'orbit' : 'floor',
				t0: 0,
				from: new THREE.Vector3(),
				velocity: new THREE.Vector3(),
				prev: new THREE.Vector3(
					stand.x + Math.cos(a) * m.rest,
					m.ball,
					stand.z + Math.sin(a) * m.rest,
				),
			}
		})
		for (const b of balls) b.mesh.position.copy(b.prev)
		return {
			stand,
			mood,
			card,
			magnet,
			sparks,
			pad,
			balls,
			seen: stand.changedAt,
			pull: chosen ? 1 : 0,
			punchAt: -Infinity,
		}
	})
	const heard = { clack: false, thud: false, leap: false }
	function sound(name, scale = 1) {
		if (!audio || heard[name]) return
		heard[name] = true
		const s = m[name + 'Sound']
		audio.blip({ ...s, gain: s.gain * scale })
	}
	function orbit(p, i, time, out) {
		const n = p.balls.length
		const theta = (i / n) * Math.PI * 2 + time * p.mood.spin
		const yaw = (i / n) * Math.PI
		const x0 = Math.cos(theta) * p.mood.orbit,
			z0 = Math.sin(theta) * p.mood.orbit
		const y1 = -z0 * Math.sin(m.lean),
			z1 = z0 * Math.cos(m.lean)
		const buzz = p.mood.buzz
		return out.set(
			p.card.position.x +
				x0 * Math.cos(yaw) +
				z1 * Math.sin(yaw) +
				Math.sin(time * 61 + i * 7) * buzz,
			p.magnet.position.y - m.leg / 2 + y1 + Math.sin(time * 47 + i * 3) * buzz,
			p.card.position.z - x0 * Math.sin(yaw) + z1 * Math.cos(yaw),
		)
	}
	function slot(p, i, out) {
		return p.magnet.localToWorld(out.set(slots[i][0], slots[i][1], 0))
	}
	function arrive(p, b, time) {
		b.state = 'stuck'
		b.t0 = time
		p.punchAt = time
		sound('clack')
	}
	function physics(p, b, dt) {
		const v = b.velocity,
			pos = b.mesh.position
		v.y -= m.gravity * dt
		pos.addScaledVector(v, dt)
		if (pos.y <= m.ball) {
			pos.y = m.ball
			if (v.y < -0.8) {
				sound('thud', Math.min(1, -v.y / 5))
				v.y *= -m.bounce
			} else v.y = 0
			const keep = Math.exp(-m.roll * dt)
			v.x *= keep
			v.z *= keep
		}
		const dx = pos.x - p.card.position.x,
			dz = pos.z - p.card.position.z
		const d = Math.hypot(dx, dz)
		if (d > m.roam) {
			pos.x = p.card.position.x + (dx / d) * m.roam
			pos.z = p.card.position.z + (dz / d) * m.roam
			const out = (v.x * dx + v.z * dz) / d
			if (out > 0) {
				v.x -= (2 * out * dx) / d
				v.z -= (2 * out * dz) / d
			}
		}
		if (pos.y === m.ball && v.y === 0 && Math.hypot(v.x, v.z) < 0.03) b.state = 'floor'
	}
	const loose = (b) => b.state === 'drop' || b.state === 'floor'
	let last = null
	function update(time, step) {
		const dt = last === null ? 0 : Math.max(0, Math.min(0.1, time - last))
		last = time
		heard.clack = heard.thud = heard.leap = false
		for (const p of props) {
			const chosen = p.stand.id === gallery.difficulty
			p.pad.visible = chosen
			p.pull += ((chosen ? 1 : 0) - p.pull) * (1 - Math.exp(-m.pullRate * dt))
			const punch = time - p.punchAt
			const squash =
				punch < m.punchTime
					? Math.sin((punch / m.punchTime) * Math.PI * 2) * (1 - punch / m.punchTime)
					: 0
			const { mood, magnet } = p
			magnet.position.set(
				Math.sin(time * 53) * mood.buzz * p.pull,
				m.hover - m.sag * (1 - p.pull) + Math.sin(time * mood.bobRate + p.stand.x) * mood.bob,
				0,
			)
			magnet.rotation.set(-m.tilt, 0, (1 - p.pull) * 0.25)
			magnet.scale.set(1 + squash * m.punch, 1 - squash * m.punch, 1)
			magnet.updateWorldMatrix(true, false)
			const flick = Math.floor(time * 18)
			for (let j = 0; j < p.sparks.length; j++) {
				const s = p.sparks[j]
				s.visible = hash(flick * 3 + j + p.stand.x) < mood.crackle * (0.3 + 0.7 * p.pull)
				if (!s.visible) continue
				const side = j % 2 ? 1 : -1
				s.position.set(
					side * m.arch * (0.6 + hash(flick + j) * 0.8),
					tipY + hash(flick - j) * m.leg,
					m.tube,
				)
				s.rotation.z = (hash(flick * 7 + j) - 0.5) * 3
			}
			if (p.stand.changedAt !== p.seen) {
				p.seen = p.stand.changedAt
				const at = p.stand.changedAt * step
				for (let i = 0; i < p.balls.length; i++) {
					const b = p.balls[i]
					const grounded = b.state === 'floor' || b.state === 'drop'
					if (chosen) {
						b.state = grounded ? 'leap' : 'slam'
						if (grounded) sound('leap')
						b.from.copy(b.mesh.position)
						b.t0 = Math.max(at, time - dt) + i * m.stagger
					} else if (!grounded) {
						b.state = 'drop'
						b.velocity.multiplyScalar(m.fling)
					}
				}
			}
			for (let i = 0; i < p.balls.length; i++) {
				const b = p.balls[i]
				const pos = b.mesh.position
				b.prev.copy(pos)
				if (b.state === 'orbit') orbit(p, i, time, pos)
				else if (b.state === 'slam' || b.state === 'leap') {
					const span = b.state === 'slam' ? m.slamTime : m.leapTime
					const u = Math.max(0, Math.min(1, (time - b.t0) / span))
					slot(p, i, point)
					if (b.state === 'slam') pos.lerpVectors(b.from, point, u * u)
					else pos.lerpVectors(b.from, point, ease(u)).y += 4 * m.leapHeight * u * (1 - u)
					if (u >= 1) arrive(p, b, time)
				} else if (b.state === 'stuck') {
					slot(p, i, pos)
					if (time - b.t0 >= m.stickFor) {
						b.state = 'release'
						b.t0 = time
					}
				} else if (b.state === 'release') {
					const u = Math.min(1, (time - b.t0) / m.releaseTime)
					slot(p, i, point)
					pos.lerpVectors(point, orbit(p, i, time, axis), ease(u))
					if (u >= 1) b.state = 'orbit'
				} else if (b.state === 'drop') physics(p, b, dt)
				if (b.state !== 'drop' && b.state !== 'floor' && dt > 0)
					b.velocity.subVectors(pos, b.prev).divideScalar(dt)
			}
			for (let i = 0; i < p.balls.length; i++)
				for (let j = i + 1; j < p.balls.length; j++) {
					if (!loose(p.balls[i]) || !loose(p.balls[j])) continue
					const a = p.balls[i].mesh.position,
						c = p.balls[j].mesh.position
					const dx = c.x - a.x,
						dz = c.z - a.z
					const d = Math.hypot(dx, dz) || 1e-3
					const overlap = m.ball * 2 - d
					if (overlap <= 0) continue
					a.x -= (dx / d) * overlap * 0.5
					a.z -= (dz / d) * overlap * 0.5
					c.x += (dx / d) * overlap * 0.5
					c.z += (dz / d) * overlap * 0.5
				}
			// Every ball rolls along its own path, so the ink band shows travel on the floor and in the air.
			for (const b of p.balls) {
				const pos = b.mesh.position
				const dx = pos.x - b.prev.x,
					dz = pos.z - b.prev.z
				const d = Math.hypot(dx, dz)
				if (d < 1e-5) continue
				spin.setFromAxisAngle(axis.set(dz / d, 0, -dx / d), d / m.ball)
				b.mesh.quaternion.premultiply(spin)
			}
		}
	}
	return {
		props,
		update,
		dispose() {
			for (const p of props) {
				p.card.removeFromParent()
				p.pad.removeFromParent()
				for (const b of p.balls) b.mesh.removeFromParent()
			}
			for (const item of owned) item.dispose()
		},
	}
}
