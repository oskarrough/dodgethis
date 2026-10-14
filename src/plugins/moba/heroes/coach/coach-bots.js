import { neutralFrame } from '../../../../core/intents.js'
import { tune } from '../../tune.js'
import { segmentClear } from '../../obstacles.js'
import { sweepHit } from '../../skillshot.js'
import { coachThrowOrigin } from './coach-cutout.js'

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
function coachClearLine(from, to, target, heroes, radius, sim) {
	if (!segmentClear(from, to, radius, sim.obstacles, sim.bounds)) return false
	const contact = sweepHit(
		from.x,
		from.z,
		to.x,
		to.z,
		target.pos.x,
		target.pos.z,
		target.radius + radius,
	)
	return heroes.every((u) => {
		if (u.id === target.id || u.dead || distance(from, u.pos) < u.radius) return true
		const at = sweepHit(from.x, from.z, to.x, to.z, u.pos.x, u.pos.z, u.radius + radius)
		return at == null || (contact != null && at >= contact)
	})
}
export function coachBotAct(ctx) {
	const { h, p, own, enemies, cast, frame, sim } = ctx
	if (ctx.skillsLocked || ctx.castBusy || h.cast || h.body.dashing) return null
	const b = tune.heroes.coach.bots
	const ally = own
		.filter(
			(u) =>
				u.id !== h.id &&
				u.hp / u.maxHp < b.saveHp &&
				distance(p, u.pos) <= tune.tagOut.range &&
				enemies.some((e) => distance(e.pos, u.pos) <= b.dangerRange),
		)
		.sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp || a.id.localeCompare(c.id))[0]
	if (ally && cast('slot2', ally.pos)) return frame
	if (
		enemies.filter(
			(u) =>
				distance(p, u.pos) <= tune.redLight.radius &&
				Math.hypot(u.vel.x, u.vel.z) > tune.redLight.movingSpeed,
		).length >= b.redEnemies &&
		cast('slot3', p)
	)
		return frame
	const hurt = own
		.filter(
			(u) =>
				u.id !== h.id &&
				u.maxHp - u.hp >= tune.pass.healAmount * b.passDeficit &&
				distance(p, u.pos) <= tune.pass.range &&
				coachClearLine(p, u.pos, u, [...own, ...enemies], tune.pass.radius, sim),
		)
		.sort((a, c) => c.maxHp - c.hp - (a.maxHp - a.hp) || a.id.localeCompare(c.id))[0]
	if (hurt && cast('slot1', hurt.pos)) return frame
	return null
}
export function coachBotDead({ h, sim, perceived, interceptTime }) {
	const frame = neutralFrame(),
		c = sim.cutouts.find((u) => u.owner === h.id)
	if (!c) return frame
	const enemies = perceived.heroes.filter((u) => !u.dead && u.team !== h.team)
	const origin = coachThrowOrigin(c, sim.bounds, sim.obstacles)
	const target = enemies.sort(
		(a, b) => distance(origin, a.pos) - distance(origin, b.pos) || a.id.localeCompare(b.id),
	)[0]
	if (!target || c.cast) return frame
	const shotAt = (x) => {
		const from = coachThrowOrigin({ ...c, x }, sim.bounds, sim.obstacles)
		const lead = tune.outThrow.castPoint + interceptTime(from, target, tune.outThrow.speed)
		const aim = {
			x: target.pos.x + target.vel.x * lead,
			z: target.pos.z + target.vel.z * lead,
		}
		return distance(from, aim) <= tune.outThrow.range &&
			coachClearLine(from, aim, target, enemies, tune.outThrow.radius, sim)
			? aim
			: null
	}
	const aim = shotAt(c.x)
	if (aim) {
		frame.order = { x: c.x, z: c.z }
		if (sim.tick >= c.cooldownUntil) {
			frame.aim = aim
			frame.pressed = [{ action: 'slot1', at: aim }]
		}
		return frame
	}
	// Keep a valid destination; only search again when the target blocks it.
	if (c.goalX != null && shotAt(c.goalX)) return frame
	const edge = sim.bounds.halfX - tune.outThrow.radius
	const clamp = (x) => Math.max(-edge, Math.min(edge, x))
	const candidates = [clamp(target.pos.x), -edge, edge]
	const step = Math.max(tune.outThrow.radius, tune.heroes.coach.cutout.searchStep)
	for (let offset = step; offset < edge * 2; offset += step)
		candidates.push(clamp(c.x - offset), clamp(c.x + offset))
	candidates.sort((a, b) => Math.abs(a - c.x) - Math.abs(b - c.x) || a - b)
	const x = candidates.find((candidate) => shotAt(candidate)) ?? clamp(target.pos.x)
	frame.order = { x, z: c.z }
	return frame
}
