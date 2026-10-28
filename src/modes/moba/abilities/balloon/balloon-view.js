import * as THREE from 'three'
import { STEP } from '../../../../core/app.js'
import { PALETTE } from '../../../../core/style.js'
import { FORWARD_LAYER, makeStyleMaterial } from '../../../../core/stylepass.js'
import { tune } from '../../tune.js'
import { ticks } from '../../sim-kit.js'

export function extras(scene) {
	const group = new THREE.Group()
	scene.add(group)
	const owned = []
	const own = (o) => {
		owned.push(o)
		return o
	}
	const v = tune.balloon.view
	const materials = {
		A: own(makeStyleMaterial('teamA', { flat: true })),
		B: own(makeStyleMaterial('teamB', { flat: true })),
		cream: own(makeStyleMaterial('cream', { flat: true })),
	}
	const ring = own(new THREE.RingGeometry(1 - v.ringWidth, 1, 48).rotateX(-Math.PI / 2))
	const arc = own(
		new THREE.RingGeometry(1 - v.rippleWidth, 1, 24, 1, 0, Math.PI).rotateX(-Math.PI / 2),
	)
	const disc = own(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2))
	const ball = own(new THREE.SphereGeometry(1, 12, 8))
	const neck = own(new THREE.ConeGeometry(1, 1, 5))
	const drop = own(new THREE.SphereGeometry(1, 6, 4))
	const pose = new THREE.Object3D()
	const live = new Map()
	let last = -Infinity

	function remove(id, rig) {
		group.remove(rig.root)
		for (const material of rig.waterMaterials) material.dispose()
		rig.drops?.dispose()
		live.delete(id)
	}

	return {
		update({ summons = [], groundFields = [], tick, alpha = 0 }) {
			const now = tick + alpha
			if (now < last) for (const [id, rig] of live) remove(id, rig)
			last = now
			const units = [
				...summons.filter((u) => u.key === 'balloon' && !u.dead && u.data.phase === 'flight'),
				...groundFields
					.filter((field) => field.ability === 'balloon' && field.from <= now && field.until > now)
					.map((field) => ({
						...field,
						id: `field-${field.id}`,
						data: { phase: 'puddle' },
						body: { position: { x: field.x, z: field.z } },
					})),
			]
			const ids = new Set(units.map((u) => u.id))
			for (const [id, rig] of live) if (!ids.has(id)) remove(id, rig)
			for (const unit of units) {
				const flight = unit.data.phase === 'flight'
				let rig = live.get(unit.id)
				if (!rig) {
					const root = new THREE.Group()
					const edge = new THREE.Mesh(ring, materials[unit.team])
					root.add(edge)
					rig = { root, edge, waterMaterials: [] }
					if (flight) {
						const balloon = new THREE.Group()
						const orb = new THREE.Mesh(ball, materials.cream)
						const knot = new THREE.Mesh(neck, materials[unit.team])
						knot.position.y = 1 + v.neckLength / 2
						knot.scale.set(v.neckWidth, v.neckLength, v.neckWidth)
						knot.rotation.z = Math.PI
						balloon.add(orb, knot)
						root.add(balloon)
						rig.balloon = balloon
					} else {
						const water = (geometry, color) => {
							const material = new THREE.MeshBasicMaterial({
								color,
								transparent: true,
								depthWrite: false,
							})
							rig.waterMaterials.push(material)
							const mesh = new THREE.Mesh(geometry, material)
							mesh.layers.set(FORWARD_LAYER)
							root.add(mesh)
							return mesh
						}
						rig.pool = water(disc, PALETTE[unit.team === 'A' ? 'teamA' : 'teamB'])
						rig.ripples = [water(arc, PALETTE.cream), water(arc, PALETTE.cream)]
						// One bounded crown replaces the generic impact cloud; no particle history to replay.
						rig.drops = new THREE.InstancedMesh(drop, materials.cream, v.droplets)
						rig.drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
						rig.drops.frustumCulled = false
						root.add(rig.drops)
					}
					group.add(root)
					live.set(unit.id, rig)
				}
				const stats = tune.balloon
				const radius = flight ? stats.radius : unit.radius
				const { start, target, popAt } = unit.data
				const popFraction =
					popAt == null
						? 1
						: Math.max(0, Math.min(1, (popAt - unit.from) / Math.max(1, ticks(stats.flight))))
				const at = flight
					? {
							x: start.x + (target.x - start.x) * popFraction,
							z: start.z + (target.z - start.z) * popFraction,
						}
					: unit.body.position
				// The boundary never shrinks: the quieter water inside it is what dries.
				rig.edge.position.set(at.x, v.ground, at.z)
				rig.edge.scale.setScalar(radius)
				if (flight) {
					const fraction = Math.max(
						0,
						Math.min(1, (now - unit.from) / Math.max(1, ticks(stats.flight))),
					)
					const sag = Math.sin(Math.PI * fraction)
					const squash = v.wobble * Math.sin(fraction * Math.PI * 2) * sag
					const width = 1 + squash
					rig.balloon.position.set(
						start.x + (target.x - start.x) * fraction,
						v.ground + v.ballRadius + v.height * 4 * fraction * (1 - fraction),
						start.z + (target.z - start.z) * fraction,
					)
					rig.balloon.rotation.set(0, Math.atan2(target.x - start.x, target.z - start.z), 0)
					rig.balloon.rotateX(v.lean * (1 - 2 * fraction))
					rig.balloon.scale.set(
						v.ballRadius * width,
						v.ballRadius / (width * width),
						v.ballRadius * width,
					)
				} else {
					const age = Math.max(0, (now - unit.from) * STEP)
					const life = Math.max(STEP, (unit.until - unit.from) * STEP)
					const dry = Math.min(1, (life - age) / v.dryTime)
					const settle = Math.max(0, 1 - age / life) ** 2
					rig.pool.position.set(at.x, v.ground - v.layerGap, at.z)
					rig.pool.scale.setScalar(radius * v.poolSize * Math.sqrt(dry))
					rig.pool.material.opacity = v.poolOpacity * dry
					for (const [i, ripple] of rig.ripples.entries()) {
						const wave = (age / v.ripplePeriod + i / rig.ripples.length) % 1
						ripple.position.set(at.x, v.ground + (i + 1) * v.layerGap, at.z)
						ripple.rotation.y = i * Math.PI + age * v.rippleTurn * settle
						ripple.scale.setScalar(
							radius * (v.rippleFrom + (v.rippleTo - v.rippleFrom) * wave) * Math.sqrt(dry),
						)
						ripple.material.opacity = v.rippleOpacity * Math.sin(Math.PI * wave) * settle * dry
					}
					const burst = Math.min(1, age / v.crownLife)
					rig.drops.visible = burst < 1
					if (rig.drops.visible) {
						for (let i = 0; i < rig.drops.count; i++) {
							const angle = (i / rig.drops.count) * Math.PI * 2
							const reach = radius * (v.crownFrom + (v.crownTo - v.crownFrom) * burst)
							const rise = v.crownHeight * (i % 2 ? v.crownLow : 1) * 4 * burst * (1 - burst)
							pose.position.set(
								at.x + Math.cos(angle) * reach,
								v.ground + rise,
								at.z + Math.sin(angle) * reach,
							)
							pose.rotation.set(Math.sin(angle) * v.crownLean, 0, -Math.cos(angle) * v.crownLean)
							const size = v.dropSize * (1 - burst)
							pose.scale.set(size, size * (1 + v.dropStretch * (1 - burst)), size)
							pose.updateMatrix()
							rig.drops.setMatrixAt(i, pose.matrix)
						}
						rig.drops.instanceMatrix.needsUpdate = true
					}
				}
			}
		},
		dispose() {
			for (const [id, rig] of live) remove(id, rig)
			scene.remove(group)
			for (const o of owned) o.dispose()
		},
	}
}
