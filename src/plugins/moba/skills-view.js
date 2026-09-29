import * as THREE from 'three'
import { makeStyleMaterial } from '../../core/stylepass.js'
import { STEP } from '../../core/app.js'
import { tune } from './tune.js'
import { clampMap, projectMap } from './obstacles.js'

// E's held circle and filling impact tell; W's held arrow and brief departure streak.
export function createSkillsView(scene) {
	const group = new THREE.Group()
	scene.add(group)
	const ring = new THREE.RingGeometry(0.94, 1, 48).rotateX(-Math.PI / 2)
	const disc = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2)
	const arrow = new THREE.Shape()
	arrow.moveTo(-0.18, 0)
	arrow.lineTo(-0.18, 0.75)
	arrow.lineTo(-0.5, 0.75)
	arrow.lineTo(0, 1)
	arrow.lineTo(0.5, 0.75)
	arrow.lineTo(0.18, 0.75)
	arrow.lineTo(0.18, 0)
	const arrowGeometry = new THREE.ShapeGeometry(arrow).rotateX(-Math.PI / 2)
	const cream = makeStyleMaterial('cream', { flat: true })
	const gold = makeStyleMaterial('ammo', { flat: true })
	const mesh = (geometry, material) => {
		const m = new THREE.Mesh(geometry, material)
		group.add(m)
		return m
	}
	const heldCircle = mesh(ring, cream)
	const heldArrow = mesh(arrowGeometry, cream)
	const tells = new Map()
	const streaks = []
	const enemyTells = new Map()
	const lineGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5)
	const enemy = makeStyleMaterial('teamB', { flat: true })
	let castCircle = null
	let castLeft = 0

	function rain(point) {
		if (!castCircle) castCircle = mesh(ring, cream)
		castCircle.position.set(point.x, 0.026, point.z)
		castCircle.scale.setScalar(tune.rain.radius)
		castCircle.visible = true
		castLeft = 0.15
	}

	function vault(point, direction) {
		const m = mesh(arrowGeometry, gold)
		m.position.set(point.x, 0.025, point.z)
		m.rotation.y = Math.atan2(direction.x, direction.z) + Math.PI
		m.scale.set(1, 1, tune.vault.range)
		streaks.push({ mesh: m, left: 0.25 })
	}

	function update(dt, { hero, aim, held, zones, casters = [], alpha = 0 }) {
		if (castCircle) {
			castLeft = Math.max(0, castLeft - dt)
			castCircle.visible = castLeft > 0
		}
		heldCircle.visible = !!(held.slot3 && aim)
		heldArrow.visible = !!(held.slot2 && aim)
		if (aim) {
			const dx = aim.x - hero.x
			const dz = aim.z - hero.z
			const distance = Math.hypot(dx, dz)
			const reach = Math.min(1, tune.rain.range / (distance || 1))
			const at = clampMap({ x: hero.x + dx * reach, z: hero.z + dz * reach })
			heldCircle.position.set(at.x, 0.022, at.z)
			heldCircle.scale.setScalar(tune.rain.radius)
			heldArrow.position.set(hero.x, 0.023, hero.z)
			heldArrow.rotation.y = Math.atan2(dx, dz) + Math.PI
			const end = projectMap(hero, {
				x: hero.x + (dx / (distance || 1)) * tune.vault.range,
				z: hero.z + (dz / (distance || 1)) * tune.vault.range,
			})
			heldArrow.scale.set(1, 1, Math.hypot(end.x - hero.x, end.z - hero.z))
		}
		const live = new Set(zones.map((z) => z.id))
		for (const [id, tell] of tells) {
			if (live.has(id)) continue
			if (!tell.done) {
				// Keep the completed disc for the impact frame before removing it.
				tell.fill.scale.setScalar(tune.rain.radius)
				tell.done = true
			} else {
				group.remove(tell.edge, tell.fill)
				tells.delete(id)
			}
		}
		for (const z of zones) {
			if (!tells.has(z.id))
				tells.set(z.id, { edge: mesh(ring, gold), fill: mesh(disc, gold), done: false })
			const { edge, fill } = tells.get(z.id)
			edge.position.set(z.x, 0.024, z.z)
			fill.position.set(z.x, 0.025, z.z)
			edge.scale.setScalar(tune.rain.radius)
			fill.scale.setScalar(
				tune.rain.radius * Math.max(0.01, Math.min(1, 1 - (z.left - alpha) / z.total)),
			)
		}
		const casting = casters.filter((unit) => !unit.dead && unit.cast?.slot === 'slot1')
		const castingIds = new Set(casting.map((unit) => unit.id))
		for (const [id, tell] of enemyTells)
			if (!castingIds.has(id)) {
				group.remove(tell.root)
				enemyTells.delete(id)
			}
		for (const unit of casting) {
			let tell = enemyTells.get(unit.id)
			if (!tell) {
				const root = new THREE.Group()
				root.name = 'moba-enemy-tell'
				const edge = new THREE.Mesh(lineGeometry, enemy)
				edge.scale.set(tune.loose.radius * 2, 1, tune.loose.range)
				const fill = new THREE.Mesh(lineGeometry, cream)
				fill.position.y = 0.001
				root.add(edge, fill)
				group.add(root)
				enemyTells.set(unit.id, (tell = { root, fill }))
			}
			const p = unit.body.mesh.position
			tell.root.position.set(p.x, 0.029, p.z)
			tell.root.rotation.y = unit.cast.yaw
			const total = unit.cast.total ?? Math.max(1, Math.round(tune.loose.castPoint / STEP))
			const progress = Math.max(0, Math.min(1, 1 - (unit.cast.left - alpha) / total))
			tell.fill.scale.set(tune.loose.radius, 1, tune.loose.range * progress)
		}
		for (let i = streaks.length - 1; i >= 0; i--) {
			const s = streaks[i]
			s.left -= dt
			if (s.left <= 0) {
				group.remove(s.mesh)
				streaks.splice(i, 1)
			} else s.mesh.scale.x = s.left / 0.25
		}
	}

	return {
		update,
		vault,
		rain,
		dispose() {
			scene.remove(group)
			for (const x of [ring, disc, arrowGeometry, lineGeometry, cream, gold, enemy]) x.dispose()
		},
	}
}
