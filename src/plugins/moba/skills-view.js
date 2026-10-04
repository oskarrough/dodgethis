import * as THREE from 'three'
import { makeStyleMaterial } from '../../core/stylepass.js'
import { STEP } from '../../core/app.js'
import { tune } from './tune.js'
import { abilityOf, castAbility } from './ability.js'
import { heroDefinition } from './heroes.js'
import { clampMap, projectMap, OBSTACLES, sweepObstacles, mapExit } from './obstacles.js'

// Presentation reads ability identity and stats, never what happens to occupy Q/W/E.
export function lineReach(point, yaw, stats, obstacles = OBSTACLES) {
	const end = { x: point.x - Math.sin(yaw) * stats.range, z: point.z - Math.cos(yaw) * stats.range }
	const blocked = sweepObstacles(
		point,
		end,
		stats.radius,
		obstacles.filter((o) => !['tower', 'fort', 'core'].includes(o.kind)),
	)
	return stats.range * Math.min(blocked ?? 1, mapExit(point, end, stats.radius) ?? 1)
}

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
	const lineGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5)
	const cream = makeStyleMaterial('cream', { flat: true })
	const gold = makeStyleMaterial('ammo', { flat: true })
	const enemy = makeStyleMaterial('teamB', { flat: true })
	const ink = makeStyleMaterial('ink', { flat: true })
	const mesh = (geometry, material, parent = group) => {
		const m = new THREE.Mesh(geometry, material)
		parent.add(m)
		return m
	}
	const coneGeometry = new THREE.RingGeometry(
		tune.mittsView.arcInset,
		1,
		tune.mittsView.segments,
	).rotateX(-Math.PI / 2)
	const heldCircle = mesh(ring, cream),
		heldArrow = mesh(arrowGeometry, cream)
	let heldCone = null
	function arc(geometry, angle, fraction = 1, inset = tune.mittsView.arcInset, outer = 1) {
		const positions = geometry.attributes.position,
			segments = tune.mittsView.segments
		for (let i = 0; i <= segments; i++) {
			const theta = -angle / 2 + (i / segments) * angle * fraction
			for (let row = 0; row < 2; row++) {
				const radius = row ? outer : inset
				positions.setXYZ(
					row * (segments + 1) + i,
					-Math.sin(theta) * radius,
					0,
					-Math.cos(theta) * radius,
				)
			}
		}
		positions.needsUpdate = true
	}
	const tells = new Map(),
		enemyTells = new Map(),
		catchTells = new Map(),
		streaks = []
	let castCircle = null,
		castLeft = 0

	function rain(point, stats = tune.rain) {
		if (!castCircle) castCircle = mesh(ring, cream)
		castCircle.position.set(point.x, 0.026, point.z)
		castCircle.scale.setScalar(stats.radius)
		castCircle.visible = true
		castLeft = tune.abilityView.castLife
	}
	function vault(point, direction, stats = tune.vault) {
		const m = mesh(arrowGeometry, gold)
		m.position.set(point.x, 0.025, point.z)
		m.rotation.y = Math.atan2(direction.x, direction.z) + Math.PI
		m.scale.set(1, 1, stats.range)
		streaks.push({ mesh: m, left: tune.abilityView.streakLife })
	}
	function update(
		dt,
		{ hero, aim, held, zones = [], unit = null, casters = [], obstacles = OBSTACLES, alpha = 0 },
	) {
		if (castCircle) {
			castLeft = Math.max(0, castLeft - dt)
			castCircle.visible = castLeft > 0
		}
		const definition = unit?.definition ?? heroDefinition()
		const holding = Object.entries(definition.abilities).filter(([slot, a]) => held[slot] && a)
		const circle = holding.find(([, a]) => a.held === 'circle')?.[1]
		const dash = holding.find(([, a]) => a.held === 'arrow')?.[1]
		const cone = holding.find(([, a]) => a.held === 'cone')?.[1]
		if (cone && !heldCone) heldCone = mesh(coneGeometry, ink)
		if (heldCone) heldCone.visible = !!(cone && aim)
		heldCircle.visible = !!(circle && aim)
		heldArrow.visible = !!(dash && aim)
		if (aim) {
			const dx = aim.x - hero.x,
				dz = aim.z - hero.z,
				distance = Math.hypot(dx, dz)
			if (cone) {
				arc(coneGeometry, (cone.stats.angle * Math.PI) / 180)
				heldCone.position.set(hero.x, tune.mittsView.catchY, hero.z)
				heldCone.rotation.y = Math.atan2(dx, dz) + Math.PI
				heldCone.scale.setScalar(cone.stats.radius)
			}
			if (circle) {
				const stats = circle.stats,
					reach = Math.min(1, stats.range / (distance || 1))
				const at = clampMap({ x: hero.x + dx * reach, z: hero.z + dz * reach })
				heldCircle.position.set(at.x, 0.022, at.z)
				heldCircle.scale.setScalar(stats.radius)
			}
			if (dash) {
				heldArrow.position.set(hero.x, 0.023, hero.z)
				heldArrow.rotation.y = Math.atan2(dx, dz) + Math.PI
				const end = projectMap(hero, {
					x: hero.x + (dx / (distance || 1)) * dash.stats.range,
					z: hero.z + (dz / (distance || 1)) * dash.stats.range,
				})
				heldArrow.scale.set(1, 1, Math.hypot(end.x - hero.x, end.z - hero.z))
			}
		}
		const live = new Set(zones.map((z) => z.id))
		for (const [id, tell] of tells)
			if (!live.has(id)) {
				if (!tell.done) {
					tell.fill.scale.setScalar(tell.radius)
					tell.done = true
				} else {
					group.remove(tell.edge, tell.fill)
					tells.delete(id)
				}
			}
		for (const z of zones) {
			const stats = abilityOf(z.ability ?? 'rain')?.stats ?? z.stats
			if (!stats) continue
			if (!tells.has(z.id))
				tells.set(z.id, { edge: mesh(ring, gold), fill: mesh(disc, gold), done: false })
			const tell = tells.get(z.id)
			tell.radius = stats.radius
			tell.edge.position.set(z.x, 0.024, z.z)
			tell.fill.position.set(z.x, 0.025, z.z)
			tell.edge.scale.setScalar(stats.radius)
			tell.fill.scale.setScalar(
				stats.radius * Math.max(0.01, Math.min(1, 1 - (z.left - alpha) / Math.max(1, z.total))),
			)
		}
		const casting = casters
			.map((u) =>
				u.attack?.phase === 'windup' && u.definition?.basic?.tell
					? {
							...u,
							cast: {
								ability: u.definition.basic.id,
								slot: 'primary',
								left: u.attack.left,
								total: u.attack.total,
								yaw: u.yaw,
							},
						}
					: u,
			)
			.filter(
				(u) =>
					!u.dead && u.cast && (castAbility(u) ?? heroDefinition().abilities[u.cast.slot])?.tell,
			)
		const castingIds = new Set(casting.map((u) => u.id))
		for (const [id, tell] of enemyTells)
			if (!castingIds.has(id)) {
				group.remove(tell.root)
				enemyTells.delete(id)
			}
		for (const caster of casting) {
			const ability = castAbility(caster) ?? heroDefinition().abilities[caster.cast.slot]
			const stats = ability.stats
			let tell = enemyTells.get(caster.id)
			if (tell && tell.kind !== ability.tell) {
				group.remove(tell.root)
				enemyTells.delete(caster.id)
				tell = null
			}
			if (!tell) {
				const root = new THREE.Group()
				root.name = 'moba-enemy-tell'
				const edge = mesh(ability.tell === 'line' ? lineGeometry : ring, enemy, root)
				const fill = mesh(ability.tell === 'line' ? lineGeometry : disc, cream, root)
				fill.position.y = tune.abilityView.fillLift
				group.add(root)
				enemyTells.set(caster.id, (tell = { root, edge, fill, kind: ability.tell }))
			}
			const p = ability.tell === 'circle' ? caster.cast.target : caster.body.mesh.position
			tell.root.position.set(p.x, tune.abilityView.tellY, p.z)
			tell.root.rotation.y = caster.cast.yaw
			const total =
				caster.cast.total ??
				Math.max(1, Math.round((stats.castPoint ?? tune.catching.returnTell) / STEP))
			const progress = Math.max(0, Math.min(1, 1 - (caster.cast.left - alpha) / total))
			if (ability.tell === 'line') {
				const length = lineReach(p, caster.cast.yaw, stats, obstacles)
				tell.edge.scale.set(stats.radius * 2, 1, length)
				tell.fill.scale.set(stats.radius, 1, length * progress)
			} else {
				tell.edge.scale.setScalar(stats.radius)
				tell.fill.scale.setScalar(stats.radius * progress)
			}
		}
		const catching = [...casters, ...(unit && !casters.includes(unit) ? [unit] : [])].filter(
			(u) => !u.dead && u.catchWindow,
		)
		const catchingIds = new Set(catching.map((u) => u.id))
		for (const [id, tell] of catchTells)
			if (!catchingIds.has(id)) {
				group.remove(tell.root)
				tell.edge.geometry.dispose()
				tell.timer.geometry.dispose()
				tell.border.geometry.dispose()
				catchTells.delete(id)
			}
		for (const u of catching) {
			let tell = catchTells.get(u.id)
			if (!tell) {
				const root = new THREE.Group()
				root.name = 'moba-catch-window'
				group.add(root)
				const edge = mesh(coneGeometry.clone(), cream, root)
				const timer = mesh(coneGeometry.clone(), gold, root)
				const border = mesh(coneGeometry.clone(), ink, root)
				edge.position.y = tune.mittsView.arcLift
				timer.position.y = tune.mittsView.catchFillY - tune.mittsView.catchY
				catchTells.set(u.id, (tell = { root, edge, timer, border }))
			}
			const window = u.catchWindow,
				angle = (window.angle * Math.PI) / 180
			const left = window.until - (u.body.mobaTick ?? 0) - alpha
			arc(tell.edge.geometry, angle)
			arc(
				tell.border.geometry,
				angle,
				1,
				tune.mittsView.arcInset - tune.mittsView.arcBorder,
				1 + tune.mittsView.arcBorder,
			)
			arc(tell.timer.geometry, angle, Math.max(0, Math.min(1, (left * STEP) / window.duration)))
			tell.timer.scale.setScalar(tune.mittsView.arcInset)
			tell.root.position.set(
				u.body.mesh.position.x,
				window.ability === 'dive' ? tune.mittsView.diveY : tune.mittsView.catchY,
				u.body.mesh.position.z,
			)
			tell.root.rotation.y = u.body.mesh.rotation.y
			tell.root.scale.setScalar(window.radius)
		}
		for (let i = streaks.length - 1; i >= 0; i--) {
			const s = streaks[i]
			s.left -= dt
			if (s.left <= 0) {
				group.remove(s.mesh)
				streaks.splice(i, 1)
			} else s.mesh.scale.x = s.left / tune.abilityView.streakLife
		}
	}
	return {
		update,
		vault,
		rain,
		dispose() {
			scene.remove(group)
			for (const tell of catchTells.values()) {
				tell.edge.geometry.dispose()
				tell.timer.geometry.dispose()
				tell.border.geometry.dispose()
			}
			for (const owned of [
				ring,
				disc,
				arrowGeometry,
				coneGeometry,
				lineGeometry,
				cream,
				gold,
				enemy,
				ink,
			])
				owned.dispose()
		},
	}
}
