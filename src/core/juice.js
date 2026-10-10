import * as THREE from 'three'
import { startDeath } from './death.js'
import { instanceStyle, makeStyleMaterial, styleId } from './stylepass.js'

const PARTICLES = 64
const MARKS = 48

// The juice kit (docs/plugin-architecture.md, "Settled"): verbs a mode's fact switch calls. Nothing here knows a fact.
// `burst` throws ink chips, `mark` prints a stroke on the floor, `flash` prints a mesh cream for a moment, `retire` plays a corpse out.
// Chips and marks are fixed GPU pools; the oldest entry is replaced when one runs out. `deathPace()` and `hitFlash()` are read per retire.
export function createJuice(scene, { deathPace = () => 1, hitFlash = () => 0.07 } = {}) {
	const chips = new THREE.InstancedMesh(
		new THREE.OctahedronGeometry(1, 0),
		makeStyleMaterial('ink', { flat: true }),
		PARTICLES,
	)
	chips.name = 'impact-ink'
	chips.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
	chips.frustumCulled = false
	chips.visible = false
	// Not literal colours: the renderer reads a style role out of instanceColor.
	const ink = instanceStyle('ink')
	const cream = instanceStyle('cream')
	const pose = new THREE.Object3D()
	pose.scale.setScalar(0)
	pose.updateMatrix()
	const slots = Array.from({ length: PARTICLES }, (_, i) => {
		chips.setMatrixAt(i, pose.matrix)
		chips.setColorAt(i, i % 3 ? ink : cream)
		return {
			x: 0,
			y: 0,
			z: 0,
			vx: 0,
			vy: 0,
			vz: 0,
			life: 0,
			duration: 0,
			size: 0,
			stretch: 1,
			heading: 0,
		}
	})
	scene.add(chips)
	// Tiny tapered strokes read as shoe scratches / landing ticks, same printed ink as the characters; one opaque batch, no decals or blend pass.
	const stroke = new THREE.BufferGeometry()
	stroke.setAttribute(
		'position',
		new THREE.Float32BufferAttribute([-0.5, 0, -0.5, 0, 0, 0.5, 0.5, 0, -0.5], 3),
	)
	stroke.computeVertexNormals()
	const marks = new THREE.InstancedMesh(stroke, makeStyleMaterial('ink', { flat: true }), MARKS)
	marks.name = 'court-ink'
	marks.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
	marks.frustumCulled = false
	marks.visible = false
	const markSlots = Array.from({ length: MARKS }, (_, i) => {
		marks.setMatrixAt(i, pose.matrix)
		marks.setColorAt(i, ink)
		return { x: 0, y: 0, z: 0, heading: 0, width: 0, length: 0, life: 0 }
	})
	scene.add(marks)
	let nextMark = 0
	let marksDirty = false
	let next = 0
	const deaths = []
	const flashes = new Map() // material → { id, flat, left }
	const CREAM = styleId('cream')

	// Chips from `point` along `direction`. Life and size step with the chip's index so a burst is not uniform.
	// `streak` lays them in a line behind the point instead, stretched, for a dash's scuff.
	function burst(
		point,
		direction,
		{
			count = 3,
			speed = 1,
			life = 0.25,
			lifeStep = 0,
			size = 0.06,
			sizeStep = 0,
			streak = false,
		} = {},
	) {
		const horizontal = Math.hypot(direction.x, direction.z) || 1
		for (let i = 0; i < count; i++) {
			const p = slots[next]
			next = (next + 1) % PARTICLES
			const spread = Math.sin(i * 2.4) * speed * 0.6
			p.x = point.x
			p.y = point.y + 0.04
			p.z = point.z
			p.vx = direction.x * speed - (direction.z / horizontal) * spread
			p.vz = direction.z * speed + (direction.x / horizontal) * spread
			p.vy = direction.y * speed * 0.3 + 0.8 + (i % 3) * 0.35
			p.duration = p.life = life + (i % 4) * lifeStep
			p.size = size + (i % 3) * sizeStep
			p.stretch = streak ? 4 : 1
			p.heading = Math.atan2(direction.x, direction.z)
			if (streak) {
				p.x -= direction.x * i * 0.18
				p.z -= direction.z * i * 0.18
				p.y = point.y - 0.6
				p.vx = -direction.x * 0.5
				p.vz = -direction.z * 0.5
				p.vy = 0.2
				p.duration = p.life = 0.18
			}
		}
	}

	// One floor stroke at (x, y, z) pointing along `heading`; `cream` prints it bright instead of ink.
	function mark(x, y, z, heading, { width, length, life, cream: bright = false }) {
		const m = markSlots[nextMark]
		marks.setColorAt(nextMark, bright ? cream : ink)
		nextMark = (nextMark + 1) % MARKS
		Object.assign(m, { x, y, z, heading, width, length, life })
		marksDirty = true
		marks.instanceColor.needsUpdate = true
	}

	// Print every style material under `object` cream and flat for `seconds`, then restore it. A second flash extends the first.
	function flash(object, seconds = 0.07) {
		object.traverse((o) => {
			const u = o.material?.uniforms
			if (!o.isMesh || !u?.uStyleId || !u.uFlat) return
			const f = flashes.get(o.material)
			if (f) f.left = Math.max(f.left, seconds)
			else {
				flashes.set(o.material, { id: u.uStyleId.value, flat: u.uFlat.value, left: seconds })
				u.uStyleId.value = CREAM
				u.uFlat.value = 1
			}
		})
	}
	function unflash(material, f) {
		material.uniforms.uStyleId.value = f.id
		material.uniforms.uFlat.value = f.flat
		flashes.delete(material)
	}

	// Play `mesh` out as a corpse: it leaves its parent for the scene and owns fresh materials from here on.
	// `style: 'card'` with `card` timings and a hit `direction` tips the corpse over like a cardboard standee.
	// `style: 'overboard'` with `overboard` (reach, hop, time, sink, water) throws it along `direction` into water.
	function retire(
		mesh,
		{
			fell = false,
			radius = 0.4,
			style = null,
			direction = null,
			card = null,
			overboard = null,
		} = {},
	) {
		for (const [material, f] of flashes) unflashUnder(mesh, material, f)
		scene.attach(mesh) // preserve world pose, free the logical root from death motion
		deaths.push(
			startDeath(mesh, {
				fell,
				radius,
				flash: hitFlash(),
				pace: deathPace,
				style,
				direction,
				card,
				overboard,
			}),
		)
	}
	function unflashUnder(mesh, material, f) {
		let owned = false
		mesh.traverse((o) => (owned ||= o.material === material))
		if (owned) unflash(material, f)
	}

	function update(dt) {
		dt = Math.min(Math.max(dt, 0), 0.1)
		for (let i = deaths.length - 1; i >= 0; i--) {
			deaths[i].update(dt)
			if (deaths[i].done) deaths.splice(i, 1)
		}
		for (const [material, f] of flashes) if ((f.left -= dt) <= 0) unflash(material, f)
		let active = false
		for (let i = 0; i < PARTICLES; i++) {
			const p = slots[i]
			p.life = Math.max(0, p.life - dt)
			if (p.life > 0) {
				p.vy -= 5 * dt
				p.x += p.vx * dt
				p.y += p.vy * dt
				p.z += p.vz * dt
				pose.position.set(p.x, p.y, p.z)
				const size = p.size * (p.life / p.duration)
				pose.scale.set(size, size, size * p.stretch)
				pose.rotation.y = p.heading
				active = true
			} else pose.scale.setScalar(0)
			pose.updateMatrix()
			chips.setMatrixAt(i, pose.matrix)
		}
		chips.visible = active
		chips.instanceMatrix.needsUpdate = true
		if (!marks.visible && !marksDirty) return
		let marksActive = false
		for (let i = 0; i < MARKS; i++) {
			const m = markSlots[i]
			m.life = Math.max(0, m.life - dt)
			if (m.life > 0) {
				const shrink = Math.min(1, m.life / 0.2)
				pose.position.set(m.x, m.y, m.z)
				pose.rotation.y = m.heading
				pose.scale.set(m.width * shrink, 1, m.length * shrink)
				marksActive = true
			} else pose.scale.setScalar(0)
			pose.updateMatrix()
			marks.setMatrixAt(i, pose.matrix)
		}
		marks.visible = marksActive
		marks.instanceMatrix.needsUpdate = true
		marksDirty = false
	}

	// Forget everything in flight. Corpses belong to whoever built them, so they are dropped, not disposed.
	function reset() {
		deaths.length = 0
		for (const [material, f] of flashes) unflash(material, f)
		for (const p of slots) p.life = 0
		chips.visible = false
		for (const m of markSlots) m.life = 0
		marks.visible = false
		marks.instanceColor.needsUpdate = true
		marksDirty = false
		nextMark = 0
		next = 0
	}

	function dispose() {
		reset()
		for (const pool of [chips, marks]) {
			scene.remove(pool)
			pool.dispose()
			pool.geometry.dispose()
			pool.material.dispose()
		}
	}

	return { burst, mark, flash, retire, update, reset, dispose }
}
