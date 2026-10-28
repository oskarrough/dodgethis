import * as THREE from 'three'
import { STEP } from '../../../../core/app.js'
import { PALETTE } from '../../../../core/style.js'
import { makeStyleMaterial } from '../../../../core/stylepass.js'
import { tune } from '../../tune.js'
import { createEffects } from '../../effects.js'
import { dirOf } from '../../sim-kit.js'
import { HEROES } from '../../heroes.js'

const RELEASED = 0.6
const clamp01 = (x) => Math.max(0, Math.min(1, x))
const GROUND = tune.map.printLayers.seams + 0.006
const TEAM = { A: PALETTE.teamA, B: PALETTE.teamB }
const throwsBall = (u) => HEROES[u.heroId]?.basic?.id === 'tennisBall' // Mandador and Salvia
const headingOf = (dir) => Math.atan2(dir.x, dir.z)
const active = (unit, key, now) =>
	unit.statuses?.some((s) => s.key === key && (s.until == null || s.until > now))

// The marks Mandador's actions leave that the body and the shared hit feel don't: the ball struck, the pass thrown, the
// call going out, the tether and the swap, and the three statuses she hands out (Tag out's guard, Pass and Rally ring's
// slow, Rally ring's haste). All drawn from the units and statuses the view is given, so guests see the same.
export function createMandadorMarks(scene) {
	const group = new THREE.Group()
	group.name = 'mandador-marks'
	scene.add(group)
	const effects = createEffects(group)
	const v = tune.heroes.mandador.view
	const owned = []
	const own = (o) => {
		owned.push(o)
		return o
	}
	const materials = {
		A: own(makeStyleMaterial('teamA', { flat: true })),
		B: own(makeStyleMaterial('teamB', { flat: true })),
		cream: own(makeStyleMaterial('cream', { flat: true })),
		ink: own(makeStyleMaterial('ink', { flat: true })),
	}
	const g = v.guard
	const span = ((Math.PI * 2) / g.dashes) * 0.62
	const dashGeometry = own(
		new THREE.RingGeometry(g.radius - g.width, g.radius, 6, 1, 0, span).rotateX(-Math.PI / 2),
	)
	const dashInkGeometry = own(
		new THREE.RingGeometry(
			g.radius - g.width - 0.05,
			g.radius + 0.05,
			6,
			1,
			-0.05,
			span + 0.1,
		).rotateX(-Math.PI / 2),
	)
	const line = own(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5))
	const mark = own(new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2))

	const seen = new Map() // unit id → what the last frame saw: { phase, cast, calls, wadeAt, runAt, at }
	const guards = new Map() // unit id → { root, dashes }
	const tethers = new Map() // caster id → { root, dashes, target }
	const positions = new Map() // unit id → the unit, for contact() to find a team
	let last = -Infinity

	const pointOf = (u) => u.body.mesh?.position ?? u.body.position
	function guardOf(id) {
		let guard = guards.get(id)
		if (guard) return guard
		const root = new THREE.Group()
		const dashes = Array.from({ length: g.dashes }, (_, k) => {
			const pair = new THREE.Group()
			const back = new THREE.Mesh(dashInkGeometry, materials.ink)
			const dash = new THREE.Mesh(dashGeometry, materials.cream)
			dash.position.y = 0.003
			pair.rotation.y = (k / g.dashes) * Math.PI * 2
			pair.add(back, dash)
			root.add(pair)
			return pair
		})
		group.add(root)
		guard = { root, dashes }
		guards.set(id, guard)
		return guard
	}
	function clearGuard(id) {
		const guard = guards.get(id)
		if (!guard) return
		group.remove(guard.root)
		guards.delete(id)
	}
	function tetherOf(id) {
		let tether = tethers.get(id)
		if (tether) return tether
		const root = new THREE.Group()
		const target = new THREE.Group()
		const ring = new THREE.Mesh(mark, materials.cream)
		const back = new THREE.Mesh(mark, materials.ink)
		back.scale.setScalar(1.12)
		ring.position.y = 0.003
		target.add(back, ring)
		root.add(target)
		group.add(root)
		tether = { root, dashes: [], target }
		tethers.set(id, tether)
		return tether
	}
	function clearTether(id) {
		const tether = tethers.get(id)
		if (!tether) return
		group.remove(tether.root)
		tethers.delete(id)
	}
	function dash(tether, k, team) {
		if (!tether.dashes[k]) {
			const back = new THREE.Mesh(line, materials.ink)
			const body = new THREE.Mesh(line, materials[team] ?? materials.cream)
			tether.root.add(back, body)
			tether.dashes[k] = { back, body }
		}
		const d = tether.dashes[k]
		d.body.material = materials[team] ?? materials.cream
		return d
	}
	function strip(mesh, from, to, width, y) {
		mesh.visible = true
		mesh.position.set(from.x, y, from.z)
		mesh.rotation.y = Math.atan2(to.x - from.x, to.z - from.z) + Math.PI
		mesh.scale.set(width, 1, Math.hypot(to.x - from.x, to.z - from.z))
	}
	function clear() {
		for (const id of guards.keys()) clearGuard(id)
		for (const id of tethers.keys()) clearTether(id)
		seen.clear()
		effects.reset()
	}

	function struck(u) {
		const s = v.strike
		const p = pointOf(u)
		const dir = dirOf(u.yaw)
		effects.smear({ x: p.x + dir.x * s.ahead, z: p.z + dir.z * s.ahead }, headingOf(dir), {
			color: PALETTE.cream,
			ink: PALETTE.ink,
			radius: s.radius,
			width: s.width,
			sweep: s.sweep,
			life: s.life,
			y: s.y,
		})
	}
	function passed(u, cast) {
		const l = v.passLine
		const p = pointOf(u)
		effects.streak(
			{ x: p.x + cast.dir.x * l.start, z: p.z + cast.dir.z * l.start },
			{ x: p.x + cast.dir.x * l.length, z: p.z + cast.dir.z * l.length },
			{ color: PALETTE.cream, ink: PALETTE.ink, width: l.width, life: l.life, y: l.y },
		)
	}
	// The call: crescents leave the megaphone one after another toward the ring, each wider than the last.
	function called(u, cast, n) {
		const c = v.call
		const p = pointOf(u)
		effects.smear({ x: p.x + cast.dir.x * 0.5, z: p.z + cast.dir.z * 0.5 }, headingOf(cast.dir), {
			color: PALETTE.cream,
			ink: PALETTE.ink,
			radius: c.radius + n * c.step,
			width: c.width,
			sweep: c.sweep + n * 0.15,
			life: c.life,
			y: c.y,
			opacity: 0.85,
		})
	}

	function tetherFor(u, units, alpha) {
		if (u.dead || u.cast?.ability !== 'tagOut') return clearTether(u.id)
		const ally = units.find((a) => a.id === u.cast.targetId)
		if (!ally || ally.dead) return clearTether(u.id)
		const tether = tetherOf(u.id)
		const from = pointOf(u)
		const to = pointOf(ally)
		const length = Math.hypot(to.x - from.x, to.z - from.z)
		const progress = 1 - (u.cast.left - alpha) / Math.max(1, u.cast.total)
		const spacing = tune.tagOut.view.dashSpacing
		// The dashes run from the caster toward the ally as the cast point goes, so the reach reads as a direction.
		const shift = (clamp01(progress) * 3 * spacing) % spacing
		let used = 0
		for (let along = -spacing + shift; along < length; along += spacing) {
			const start = Math.max(0, along)
			const end = Math.min(length, along + spacing * tune.tagOut.view.dashFill)
			if (end <= start) continue
			const d = dash(tether, used++, u.team)
			const at = (x) => ({
				x: from.x + ((to.x - from.x) * x) / length,
				z: from.z + ((to.z - from.z) * x) / length,
			})
			strip(d.body, at(start), at(end), tune.tagOut.radius * 2, tune.map.markerLayers.aim + 0.002)
			strip(d.back, at(start), at(end), tune.tagOut.radius * 2 + 0.1, tune.map.markerLayers.aim)
		}
		for (let k = used; k < tether.dashes.length; k++)
			tether.dashes[k].body.visible = tether.dashes[k].back.visible = false
		tether.target.position.set(to.x, tune.map.markerLayers.aim, to.z)
		tether.target.scale.setScalar(1.2 + 0.12 * Math.sin(progress * Math.PI * 4))
	}

	return {
		update({ units = [], tick, alpha = 0 }) {
			const now = tick + alpha
			if (now < last) clear()
			effects.update(Number.isFinite(last) && now >= last ? (now - last) * STEP : 0)
			last = now
			const live = new Set()
			positions.clear()
			for (const u of units) {
				positions.set(u.id, u)
				live.add(u.id)
				if (u.dead) {
					seen.delete(u.id)
					clearGuard(u.id)
					clearTether(u.id)
					continue
				}
				const rec = seen.get(u.id) ?? { calls: 0, wadeAt: 0, runAt: 0 }
				const p = pointOf(u)
				const phase = u.attack?.phase ?? null
				if (throwsBall(u) && phase === 'backswing' && rec.phase === 'windup') struck(u)
				const cast = u.cast
				if (u.heroId === 'mandador') {
					if (cast?.ability === 'rallyRing') {
						const progress = 1 - cast.left / Math.max(1, cast.total)
						if (rec.callOf !== cast.startedTick) {
							rec.callOf = cast.startedTick
							rec.calls = 0
						}
						while (rec.calls < v.call.count && progress >= v.call.first + rec.calls * v.call.gap)
							called(u, cast, rec.calls++)
					}
					if (!cast && rec.cast?.ability === 'pass' && rec.cast.progress >= RELEASED)
						passed(u, rec.cast)
					rec.cast = cast && {
						ability: cast.ability,
						dir: cast.dir,
						progress: 1 - (cast.left - alpha) / Math.max(1, cast.total),
					}
					tetherFor(u, units, alpha)
				}
				rec.phase = phase
				// Tag out's guard: a ring of dashes that burns down with the time left.
				if (active(u, 'tagOut.guard', now)) {
					const status = u.statuses.find((s) => s.key === 'tagOut.guard')
					const share = Math.max(
						0,
						Math.min(1, ((status.until - now) * STEP) / tune.tagOut.duration),
					)
					const guard = guardOf(u.id)
					guard.root.position.set(p.x, GROUND, p.z)
					guard.root.rotation.y = now * STEP * g.spin
					for (const [k, pair] of guard.dashes.entries())
						pair.visible = k < Math.ceil(share * g.dashes)
				} else clearGuard(u.id)
				// Slowed by Mandador: ripples round the feet, as if wading.
				if (
					(active(u, 'pass.slow', now) || active(u, 'rallyRing.groundSlow', now)) &&
					now >= rec.wadeAt
				) {
					rec.wadeAt = now + v.wade.every / STEP
					effects.ring(
						{ x: p.x, z: p.z },
						{
							color: PALETTE.cream,
							from: v.wade.from,
							to: v.wade.to,
							width: v.wade.width,
							life: v.wade.life,
							opacity: v.wade.opacity,
							y: 0.05,
						},
					)
				}
				// Hasted by the ring: a stroke trailing the way she ran.
				if (active(u, 'rallyRing.groundHaste', now) && now >= rec.runAt) {
					const run = v.run
					const before = rec.at ?? p
					const dx = p.x - before.x
					const dz = p.z - before.z
					const moved = Math.hypot(dx, dz)
					if (moved >= run.minMove) {
						rec.runAt = now + run.every / STEP
						effects.streak(
							{ x: p.x - (dx / moved) * run.length, z: p.z - (dz / moved) * run.length },
							{ x: p.x - (dx / moved) * 0.25, z: p.z - (dz / moved) * 0.25 },
							{
								color: PALETTE.cream,
								ink: PALETTE.ink,
								width: run.width,
								life: run.life,
								y: run.y,
							},
						)
					}
					rec.at = { x: p.x, z: p.z }
				} else rec.at = null
				seen.set(u.id, rec)
			}
			for (const id of seen.keys()) if (!live.has(id)) seen.delete(id)
			for (const id of guards.keys()) if (!live.has(id)) clearGuard(id)
			for (const id of tethers.keys()) if (!live.has(id)) clearTether(id)
		},
		// The swap: two strokes cross, one for each of them, and each lands in a burst where they left.
		contact(fact) {
			if (fact.ability !== 'tagOut' || fact.part !== 'impact' || !fact.from) return
			const s = v.swap
			const team = positions.get(fact.source)?.team ?? 'A'
			const burst = (at, color, turn) =>
				effects.spokes(at, {
					color,
					ink: PALETTE.ink,
					count: s.count,
					from: s.from,
					to: s.to,
					life: s.life,
					turn,
				})
			effects.streak(fact.from, fact.point, {
				color: PALETTE.cream,
				ink: PALETTE.ink,
				width: s.width,
				life: s.life,
				y: 0.5,
			})
			effects.streak(fact.point, fact.from, {
				color: TEAM[team],
				ink: PALETTE.ink,
				width: s.width * s.back,
				life: s.life,
				y: 1.05,
			})
			burst(fact.point, PALETTE.cream, Math.floor(last) * 0.7)
			burst(fact.from, TEAM[team], Math.floor(last) * 0.7 + 1)
		},
		dispose() {
			clear()
			effects.dispose()
			scene.remove(group)
			for (const o of owned) o.dispose()
		},
	}
}
