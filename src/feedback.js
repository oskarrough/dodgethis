import * as THREE from 'three'
import { startDeath } from './death.js'
import { instanceStyle, makeStyleMaterial } from './stylepass.js'
import { ARENA, onCourt } from './arena.js'
import { tune } from './tune.js'

const PARTICLES = 64
const MARKS = 48

// Gameplay sends copied facts; main supplies the retired target's visual handle. Persistent GPU pools serve all contacts and are cleared between rounds.
export function createFeedback(scene, { sfx, confirm, addShake = () => {} }) {
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
		return { x: 0, z: 0, heading: 0, width: 0, length: 0, life: 0 }
	})
	scene.add(marks)
	let nextMark = 0
	let marksDirty = false

	function courtMarks(event) {
		const dash = event.type === 'dash'
		if (dash) {
			const footY = event.point.y - tune.player.radius - tune.player.halfHeight
			if (Math.abs(footY - ARENA.top) > 0.15) return
		} else if (event.outcome !== 'landed' || event.surface !== 'court') return
		const { x, z } = event.direction
		const heading = Math.atan2(x, z)
		const count = dash ? 2 : 3
		for (let i = 0; i < count; i++) {
			const angle = heading + (dash ? 0 : (i - 1) * 0.8)
			const length = dash ? 0.55 - i * 0.12 : 0.22 + (i % 2) * 0.08
			const side = dash ? (i - 0.5) * 0.25 : 0
			const reach = dash ? -0.22 : 0.19
			const px = event.point.x + Math.sin(angle) * reach + Math.cos(angle) * side
			const pz = event.point.z + Math.cos(angle) * reach - Math.sin(angle) * side
			// Keep the entire stroke inside the paint; the conservative radius also covers rotated strokes.
			if (!onCourt(px, pz, ARENA.inset.rim + length * 0.6)) continue
			const mark = markSlots[nextMark]
			nextMark = (nextMark + 1) % MARKS
			Object.assign(mark, {
				x: px,
				z: pz,
				heading: angle,
				width: dash ? 0.055 : 0.07,
				length,
				life: dash ? 0.7 : 1.1,
			})
			marksDirty = true
		}
	}
	const deaths = []
	let next = 0
	let confirmationTime = 0
	let humanOut = false

	function present(event, mesh) {
		if (event.type === 'shot') {
			if (event.kind === 'bowl') sfx.roll(event.point)
			else sfx.loose(event.source.isHuman ? 1 : 0.45, event.point)
			if (event.perfect) sfx.perfect(event.point)
			if (event.source.isHuman) addShake(event.kind === 'bowl' ? 0.35 : event.perfect ? 0.4 : 0.22)
			if (!event.source.isHuman) sfx.taunt(event.point)
			return
		}
		if (event.type === 'pickup') {
			sfx.grab(event.point, event.source.isHuman ? 1 : 0.35)
			return
		}
		if (event.type === 'dash') sfx.dash(event.point)
		if (event.outcome === 'recovered') return // ammo rescue is not a wall impact
		if (event.outcome === 'eliminated') {
			if (mesh) {
				scene.attach(mesh) // preserve world pose, free the logical root from death motion
				deaths.push(
					startDeath(mesh, {
						fell: event.type === 'fall',
						radius: mesh.geometry.parameters.radius,
					}),
				)
			}
			if (event.type === 'fall') sfx.fall(event.point)
			else sfx.hit(event.point)
			addShake(event.type === 'fall' ? (event.target.isHuman ? 0.6 : 0.3) : 0.7)
			// A mutual hit must not overwrite YOU'RE OUT with a kill cheer.
			if (event.target.isHuman) humanOut = true
			if (event.target.isHuman || (event.source?.isHuman && !humanOut)) {
				confirm(humanOut ? "YOU'RE OUT" : 'OUT!')
				confirmationTime = 0.65
			}
		} else if (event.outcome === 'deflected') sfx.deflect(event.point)
		else if (event.outcome === 'landed') sfx.land(event.point)

		const dash = event.type === 'dash'
		if (!dash && event.type !== 'impact') return
		courtMarks(event)
		const lethal = event.outcome === 'eliminated'
		const count = lethal ? 12 : dash || event.outcome === 'deflected' ? 6 : 3
		const speed = lethal ? 3 : 1
		const direction = event.direction
		const horizontal = Math.hypot(direction.x, direction.z) || 1
		for (let i = 0; i < count; i++) {
			const p = slots[next]
			next = (next + 1) % PARTICLES // replace the oldest decorative chip
			const spread = Math.sin(i * 2.4) * speed * 0.6
			p.x = event.point.x
			p.y = event.point.y + 0.04
			p.z = event.point.z
			p.vx = direction.x * speed - (direction.z / horizontal) * spread
			p.vz = direction.z * speed + (direction.x / horizontal) * spread
			p.vy = direction.y * speed * 0.3 + 0.8 + (i % 3) * 0.35
			p.duration = p.life = lethal ? 0.4 + (i % 4) * 0.06 : 0.25
			p.size = lethal ? 0.1 + (i % 3) * 0.025 : 0.06
			p.stretch = dash ? 4 : 1
			p.heading = Math.atan2(direction.x, direction.z)
			if (dash) {
				p.x -= direction.x * i * 0.18
				p.z -= direction.z * i * 0.18
				p.y = event.point.y - 0.6
				p.vx = -direction.x * 0.5
				p.vz = -direction.z * 0.5
				p.vy = 0.2
				p.duration = p.life = 0.18
			}
		}
	}

	function update(dt) {
		dt = Math.min(Math.max(dt, 0), 0.1)
		for (let i = deaths.length - 1; i >= 0; i--) {
			deaths[i].update(dt)
			if (deaths[i].done) deaths.splice(i, 1)
		}
		if (confirmationTime > 0) {
			confirmationTime -= dt
			if (confirmationTime <= 0) confirm('')
		}
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
			const mark = markSlots[i]
			mark.life = Math.max(0, mark.life - dt)
			if (mark.life > 0) {
				const shrink = Math.min(1, mark.life / 0.2)
				pose.position.set(mark.x, ARENA.top + 0.026, mark.z)
				pose.rotation.y = mark.heading
				pose.scale.set(mark.width * shrink, 1, mark.length * shrink)
				marksActive = true
			} else pose.scale.setScalar(0)
			pose.updateMatrix()
			marks.setMatrixAt(i, pose.matrix)
		}
		marks.visible = marksActive
		marks.instanceMatrix.needsUpdate = true
		marksDirty = false
	}

	function reset() {
		deaths.length = 0 // round disposal owns the meshes, not this service
		for (const p of slots) p.life = 0
		chips.visible = false
		for (const mark of markSlots) mark.life = 0
		marks.visible = false
		marksDirty = false
		nextMark = 0
		next = 0
		humanOut = false
		confirmationTime = 0
		confirm('')
	}

	function dispose() {
		reset()
		scene.remove(chips)
		chips.dispose()
		chips.geometry.dispose()
		chips.material.dispose()
		scene.remove(marks)
		marks.dispose()
		marks.geometry.dispose()
		marks.material.dispose()
	}

	return { present, update, reset, dispose }
}
