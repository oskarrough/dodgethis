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
		// Commit to a siege in basic reach. At mid, close on heroes instead of
		// parking outside basic range while two identical waves cancel forever.
		const siege = enemies.find(
			(u) =>
				u.structure &&
				Math.hypot(u.body.position.x - p.x, u.body.position.z - p.z) <=
					tune.orders.attackRange + u.body.radius,
		)
		const rival = enemies.find(
			(u) =>
				!u.kind && Math.hypot(u.body.position.x - p.x, u.body.position.z - p.z) <= tune.loose.range,
		)
		const target = siege ?? rival ?? enemies[0]
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
		const ball = sim.ball?.state
		if (sim.ball?.carrying(h)) {
			const structure = enemies.find((u) => u.structure)
			if (structure) {
				const at = structure.body.position
				const distance = Math.hypot(at.x - p.x, at.z - p.z)
				if (
					distance <=
					tune.ball.range + tune.ball.radius + structure.body.radius - tune.orders.arrival
				) {
					if (!h.ballThrow) frame.pressed = [{ action: 'primary', at: { x: at.x, z: at.z } }]
				} else if (!h.order || h.order.kind !== 'move') {
					const reach =
						tune.ball.range + tune.ball.radius + structure.body.radius - 2 * tune.orders.arrival
					frame.order = {
						x: at.x + ((p.x - at.x) / distance) * reach,
						z: at.z + ((p.z - at.z) / distance) * reach,
					}
				}
				intents.feed(id, frame)
				return
			}
		}
		if (
			!retreating &&
			ball &&
			['loose', 'channel'].includes(ball.state) &&
			!sim.heroes.some(
				(u) =>
					!u.dead &&
					u.team !== h.team &&
					Math.hypot(u.body.position.x - ball.pos.x, u.body.position.z - ball.pos.z) <=
						tune.ball.pickup + tune.orders.attackRange,
			)
		) {
			const distance = Math.hypot(ball.pos.x - p.x, ball.pos.z - p.z)
			if (distance <= tune.ball.pickup) {
				if (!h.cast && !h.ballThrow && (h.order || h.attack)) frame.pressed = [{ action: 'stop' }]
			} else if (
				!h.order ||
				h.order.kind !== 'move' ||
				Math.hypot(h.order.goal.x - ball.pos.x, h.order.goal.z - ball.pos.z) > tune.orders.arrival
			)
				frame.order = { ...ball.pos }
			intents.feed(id, frame)
			return
		}
		if (
			!retreating &&
			target &&
			Math.hypot(target.body.position.x - p.x, target.body.position.z - p.z) <=
				(target === rival ? tune.loose.range : tune.orders.attackRange + target.body.radius)
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
