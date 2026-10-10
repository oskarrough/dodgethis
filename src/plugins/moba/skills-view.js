import * as THREE from 'three'
import { makeStyleMaterial } from '../../core/stylepass.js'
import { STEP } from '../../core/app.js'
import { tune } from './tune.js'
import { look } from './look.js'
import { abilityOf, castAbility } from './ability.js'
import { heroDefinition } from './heroes.js'
import { clampMap, projectMap, OBSTACLES, FLOOR, sweepObstacles, mapExit } from './obstacles.js'

// Presentation reads ability identity and stats, never what happens to occupy Q/W/E.
// Every catch window, Catch's or Dive's, wears Catch's fan.
const fan = abilityOf('catch').look
export function lineReach(point, yaw, stats, obstacles = OBSTACLES, bounds = FLOOR) {
	const end = { x: point.x - Math.sin(yaw) * stats.range, z: point.z - Math.cos(yaw) * stats.range }
	const blocked = sweepObstacles(
		point,
		end,
		stats.radius,
		obstacles.filter((o) => !['tower', 'core'].includes(o.kind)),
	)
	return stats.range * Math.min(blocked ?? 1, mapExit(point, end, stats.radius, bounds) ?? 1)
}

// Ground tells lie just above the map's top print layer (and under the cursor markers);
// any lower and the lane's printed road and lobby paint over them.
const GROUND = tune.map.printLayers.seams + 0.005

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
	const rainView = look.abilityView.rain
	const shaftGeometry = new THREE.BoxGeometry(0.04, rainView.shaft, 0.04).translate(
		0,
		rainView.shaft / 2,
		0,
	)
	const fletchGeometry = new THREE.BoxGeometry(0.14, 0.16, 0.03).translate(
		0,
		rainView.shaft - 0.1,
		0,
	)
	const cream = makeStyleMaterial('cream', { flat: true })
	const gold = makeStyleMaterial('ammo', { flat: true })
	const enemy = makeStyleMaterial('teamB', { flat: true })
	const ink = makeStyleMaterial('ink', { flat: true })
	// Opaque ID writes, with holes that leave the ground visible. Alpha belongs
	// to the forward layer, never the style buffer.
	const catchFill = makeStyleMaterial('cream', { flat: true })
	catchFill.uniforms.uStipplePixels = { value: fan.stipplePixels }
	catchFill.fragmentShader =
		'uniform float uStipplePixels;\n' +
		catchFill.fragmentShader.replace(
			'void main() {',
			'void main() { if (mod(floor(gl_FragCoord.x / uStipplePixels) + floor(gl_FragCoord.y / uStipplePixels), 2.0) < 1.0) discard;',
		)
	const mesh = (geometry, material, parent = group) => {
		const m = new THREE.Mesh(geometry, material)
		parent.add(m)
		return m
	}
	const coneGeometry = new THREE.RingGeometry(fan.arcInset, 1, fan.segments).rotateX(-Math.PI / 2)
	const heldCircle = mesh(ring, cream),
		heldArrow = mesh(arrowGeometry, cream)
	let heldCone = null
	function arc(geometry, angle, fraction = 1, inset = fan.arcInset, outer = 1) {
		const positions = geometry.attributes.position,
			segments = fan.segments
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
		castLeft = 0,
		lastSwap = null

	function rain(point, stats = abilityOf('rain').stats) {
		if (!castCircle) castCircle = mesh(ring, cream)
		castCircle.position.set(point.x, GROUND + 0.004, point.z)
		castCircle.scale.setScalar(stats.radius)
		castCircle.visible = true
		castLeft = look.abilityView.castLife
	}
	// Spread over the zone on a golden-angle spiral, turned by the zone id so no two rains match.
	function rainArrows(zone, radius) {
		const r = look.abilityView.rain
		const turn = [...String(zone.id)].reduce((sum, c) => sum + c.charCodeAt(0), 0)
		return Array.from({ length: r.arrows }, (_, i) => {
			const angle = turn + i * 2.39996,
				reach = radius * 0.85 * Math.sqrt((i + 0.5) / r.arrows)
			const root = new THREE.Group()
			mesh(shaftGeometry, ink, root)
			mesh(fletchGeometry, gold, root)
			root.position.set(
				zone.x + Math.cos(angle) * reach,
				r.height,
				zone.z + Math.sin(angle) * reach,
			)
			root.rotation.set(Math.sin(angle * 3) * 0.18, angle, Math.cos(angle * 5) * 0.18)
			root.visible = false
			group.add(root)
			return { root, start: (r.stagger * ((i * 7) % r.arrows)) / r.arrows }
		})
	}
	function vault(point, direction, stats = abilityOf('vault').stats) {
		const m = mesh(arrowGeometry, gold)
		m.position.set(point.x, GROUND + 0.003, point.z)
		m.rotation.y = Math.atan2(direction.x, direction.z) + Math.PI
		m.scale.set(1, 1, stats.range)
		streaks.push({ mesh: m, left: look.abilityView.streakLife })
	}
	function update(
		dt,
		{
			hero,
			aim,
			held,
			zones = [],
			unit = null,
			lobby = false,
			casters = [],
			units = casters,
			obstacles = OBSTACLES,
			bounds = FLOOR,
			alpha = 0,
			tick = 0,
		},
	) {
		if (unit?.swapFact && unit.swapFact !== lastSwap) {
			lastSwap = unit.swapFact
			// Cancelled local poses leave no kit cue; released zones keep their own tells below.
			castLeft = 0
			for (const streak of streaks) group.remove(streak.mesh)
			streaks.length = 0
		}
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
				heldCone.position.set(hero.x, fan.catchY, hero.z)
				heldCone.rotation.y = Math.atan2(dx, dz) + Math.PI
				heldCone.scale.setScalar(cone.stats.radius)
			}
			if (circle) {
				const stats = circle.stats,
					reach = Math.min(1, stats.range / (distance || 1))
				const at = clampMap({ x: hero.x + dx * reach, z: hero.z + dz * reach }, 0, bounds)
				heldCircle.position.set(at.x, GROUND, at.z)
				heldCircle.scale.setScalar(stats.radius)
			}
			if (dash) {
				heldArrow.position.set(hero.x, GROUND + 0.001, hero.z)
				heldArrow.rotation.y = Math.atan2(dx, dz) + Math.PI
				const end = projectMap(
					hero,
					{
						x: hero.x + (dx / (distance || 1)) * dash.stats.range,
						z: hero.z + (dz / (distance || 1)) * dash.stats.range,
					},
					bounds,
				)
				heldArrow.scale.set(1, 1, Math.hypot(end.x - hero.x, end.z - hero.z))
			}
		}
		const live = new Set(zones.map((z) => z.id))
		const r = look.abilityView.rain
		for (const [id, tell] of tells)
			if (!live.has(id)) {
				if (!tell.done) {
					tell.done = true
					tell.after = 0
					tell.fill.scale.setScalar(tell.radius)
					tell.shock = mesh(ring, ink)
					tell.shock.position.set(tell.edge.position.x, GROUND + 0.005, tell.edge.position.z)
					for (const a of tell.arrows) {
						a.root.visible = true
						a.root.position.y = -r.buried
					}
				}
				tell.after += dt
				const shock = Math.min(1, tell.after / r.shockLife)
				tell.shock.visible = shock < 1
				tell.shock.scale.setScalar(tell.radius * (1 + r.shockGrow * (1 - (1 - shock) ** 3)))
				tell.edge.visible = tell.fill.visible = tell.after < r.flashLife
				const sunk = Math.max(0, (tell.after - r.stickLife) / r.sink)
				for (const a of tell.arrows) a.root.position.y = -r.buried - sunk * r.shaft
				if (sunk >= 1) {
					group.remove(tell.edge, tell.fill, tell.shock, ...tell.arrows.map((a) => a.root))
					tells.delete(id)
				}
			}
		for (const z of zones) {
			const stats = abilityOf(z.ability ?? 'rain')?.stats ?? z.stats
			if (!stats) continue
			if (!tells.has(z.id))
				tells.set(z.id, {
					edge: mesh(ring, gold),
					fill: mesh(disc, gold),
					done: false,
					arrows: rainArrows(z, stats.radius),
				})
			const tell = tells.get(z.id)
			tell.radius = stats.radius
			tell.edge.position.set(z.x, GROUND + 0.002, z.z)
			tell.fill.position.set(z.x, GROUND + 0.003, z.z)
			tell.edge.scale.setScalar(stats.radius)
			const progress = Math.max(0, Math.min(1, 1 - (z.left - alpha) / Math.max(1, z.total)))
			tell.fill.scale.setScalar(stats.radius * Math.max(0.01, progress))
			// Each arrow starts late by its stagger and accelerates, so all of them land on impact.
			for (const a of tell.arrows) {
				const fall = Math.max(0, (progress - a.start) / (1 - a.start))
				a.root.visible = progress >= a.start
				a.root.position.y = r.height * (1 - fall * fall)
			}
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
				fill.position.y = look.abilityView.fillLift
				group.add(root)
				enemyTells.set(caster.id, (tell = { root, edge, fill, kind: ability.tell }))
			}
			const p = ability.tell === 'circle' ? caster.cast.target : caster.body.mesh.position
			tell.edge.material = lobby ? ink : enemy
			tell.fill.material = lobby ? enemy : cream
			tell.root.position.set(p.x, lobby ? tune.lobby.practice.tellY : look.abilityView.tellY, p.z)
			tell.root.rotation.y = caster.cast.yaw
			const total =
				caster.cast.total ??
				Math.max(1, Math.round((stats.castPoint ?? tune.catching.returnTell) / STEP))
			const progress = Math.max(0, Math.min(1, 1 - (caster.cast.left - alpha) / total))
			if (ability.tell === 'line') {
				const length = lineReach(p, caster.cast.yaw, stats, obstacles, bounds)
				tell.edge.scale.set(stats.radius * 2, 1, length)
				tell.fill.scale.set(stats.radius, 1, length * progress)
			} else {
				tell.edge.scale.setScalar(stats.radius)
				tell.fill.scale.setScalar(stats.radius * progress)
			}
		}
		catchFill.uniforms.uStipplePixels.value = Math.max(1, fan.stipplePixels)
		const catching = [...units, ...(unit && !units.includes(unit) ? [unit] : [])].filter(
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
				const edge = mesh(coneGeometry.clone(), catchFill, root)
				const timer = mesh(coneGeometry.clone(), gold, root)
				const border = mesh(coneGeometry.clone(), ink, root)
				const sides = [mesh(lineGeometry, ink, root), mesh(lineGeometry, ink, root)]
				for (const side of sides) side.position.y = fan.catchFillY - fan.catchY
				edge.position.y = fan.arcLift
				timer.position.y = fan.catchFillY - fan.catchY
				catchTells.set(u.id, (tell = { root, edge, timer, border, sides }))
			}
			const window = u.catchWindow,
				angle = (window.angle * Math.PI) / 180
			const left = window.until - tick - alpha
			const radius = Math.max(tune.collision.epsilon, window.radius)
			const edgeWidth = Math.min(radius, fan.edgeWidth) / radius
			arc(tell.edge.geometry, angle, 1, 0, 1 - edgeWidth)
			arc(tell.border.geometry, angle, 1, 1 - edgeWidth, 1)
			const timerInset = 1 + fan.timerGap / radius
			arc(
				tell.timer.geometry,
				angle,
				Math.max(0, Math.min(1, (left * STEP) / window.duration)),
				timerInset,
				timerInset + fan.timerWidth / radius,
			)
			for (let i = 0; i < tell.sides.length; i++) {
				tell.sides[i].visible = window.angle < 360
				tell.sides[i].rotation.y = ((i ? 1 : -1) * angle) / 2
				tell.sides[i].scale.set(edgeWidth, 1, 1)
			}
			tell.root.position.set(
				u.body.mesh.position.x,
				window.ability === 'dive' ? fan.diveY : fan.catchY,
				u.body.mesh.position.z,
			)
			const direction = window.dir
			tell.root.rotation.y = direction ? Math.atan2(direction.x, direction.z) + Math.PI : u.yaw
			tell.root.scale.setScalar(window.radius)
		}
		for (let i = streaks.length - 1; i >= 0; i--) {
			const s = streaks[i]
			s.left -= dt
			if (s.left <= 0) {
				group.remove(s.mesh)
				streaks.splice(i, 1)
			} else s.mesh.scale.x = s.left / look.abilityView.streakLife
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
				shaftGeometry,
				fletchGeometry,
				cream,
				gold,
				enemy,
				ink,
				catchFill,
			])
				owned.dispose()
		},
	}
}
