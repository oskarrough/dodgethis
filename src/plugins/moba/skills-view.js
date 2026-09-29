import * as THREE from 'three'
import { makeStyleMaterial } from '../../core/stylepass.js'
import { tune } from './tune.js'

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

	function update(dt, { hero, aim, held, zones, alpha = 0 }) {
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
			heldCircle.position.set(hero.x + dx * reach, 0.022, hero.z + dz * reach)
			heldCircle.scale.setScalar(tune.rain.radius)
			heldArrow.position.set(hero.x, 0.023, hero.z)
			heldArrow.rotation.y = Math.atan2(dx, dz) + Math.PI
			heldArrow.scale.set(1, 1, tune.vault.range)
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
			for (const x of [ring, disc, arrowGeometry, cream, gold]) x.dispose()
		},
	}
}
