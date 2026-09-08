import * as THREE from 'three'
import { startDeath } from './death.js'
import { PALETTE } from './style.js'

const PARTICLES = 64

// Gameplay sends copied facts; main supplies the retired target's visual handle.
// One persistent GPU pool serves all contacts and is cleared between rounds.
export function createFeedback(scene, { sfx, confirm, addShake = () => {} }) {
	const chips = new THREE.InstancedMesh(
		new THREE.OctahedronGeometry(1, 0),
		new THREE.MeshBasicMaterial(),
		PARTICLES,
	)
	chips.name = 'impact-ink'
	chips.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
	chips.frustumCulled = false
	chips.visible = false
	const ink = new THREE.Color(PALETTE.ink)
	const cream = new THREE.Color(PALETTE.cream)
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
	}

	function reset() {
		deaths.length = 0 // round disposal owns the meshes, not this service
		for (const p of slots) p.life = 0
		chips.visible = false
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
	}

	return { present, update, reset, dispose }
}
