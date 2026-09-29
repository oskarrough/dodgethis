import { STEP } from '../../core/app.js'
import { neutralFrame } from '../../core/intents.js'
import { tune } from './tune.js'

// Slice-three sparring partner, not the M4 tactical brain. Orders and Q only.
export function createScriptedHero(id) {
	let nextThink = 0
	let retreating = false
	return (sim, intents) => {
		const h = sim.heroes.find((unit) => unit.id === id)
		if (!h || h.dead || sim.tick < nextThink) return
		nextThink = sim.tick + Math.max(1, Math.round(tune.scripted.think / STEP))
		const p = h.body.position
		if (h.hp < h.maxHp * tune.scripted.retreat) retreating = true
		if (h.hp >= h.maxHp * tune.scripted.recover) retreating = false
		const side = h.team === 'A' ? -1 : 1
		const enemies = [...sim.heroes, ...sim.lane.minions, ...sim.lane.structures]
			.filter((u) => !u.dead && u.team !== h.team && sim.lane.vulnerable(u))
			.sort(
				(a, b) =>
					Math.hypot(a.body.position.x - p.x, a.body.position.z - p.z) -
					Math.hypot(b.body.position.x - p.x, b.body.position.z - p.z),
			)
		const target = enemies[0]
		const allies = sim.lane.minions.filter((u) => !u.dead && u.team === h.team)
		const front = allies.sort((a, b) => side * (a.body.position.x - b.body.position.x))[0]
		const guard = sim.lane.structures.find((u) => !u.dead && u.team === h.team)
		const goal = retreating
			? { x: h.spawn.x, z: h.spawn.z }
			: {
					x:
						(front?.body.position.x ?? guard?.body.position.x ?? h.spawn.x) +
						side * tune.scripted.hold,
					z: tune.scripted.file,
				}
		const frame = neutralFrame()
		if (
			!retreating &&
			target &&
			Math.hypot(target.body.position.x - p.x, target.body.position.z - p.z) <=
				tune.orders.attackRange + target.body.radius
		) {
			if (h.order?.target !== target.id)
				frame.order = { x: target.body.position.x, z: target.body.position.z }
		} else if (
			!h.order ||
			h.order.kind !== 'move' ||
			Math.hypot(goal.x - h.order.goal.x, goal.z - h.order.goal.z) > tune.orders.replanDistance
		)
			frame.order = goal
		if (
			!retreating &&
			target &&
			!h.cd[0] &&
			!h.cast &&
			Math.hypot(target.body.position.x - p.x, target.body.position.z - p.z) <= tune.loose.range
		) {
			frame.aim = { x: target.body.position.x, z: target.body.position.z }
			frame.pressed = [{ action: 'slot1', at: { ...frame.aim } }]
		}
		intents.feed(id, frame)
	}
}
