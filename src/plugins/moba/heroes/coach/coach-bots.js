import { neutralFrame } from '../../../../core/intents.js'
import { tune } from '../../tune.js'
import { botClearLine } from '../../ability-bots.js'
import { coachThrowOrigin } from './coach-cutout.js'

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
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
			botClearLine(from, aim, target, enemies, tune.outThrow.radius, sim)
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
