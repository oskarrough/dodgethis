import { tune } from '../../tune.js'
import { STEP } from '../../../../core/app.js'
import { sweepObstacles, mapExit } from '../../obstacles.js'

// Extend only through the connected puddles intersecting the normal stopping point.
export function slideReach(hero, sim, dir) {
	const stats = tune.slide
	const p = hero.body.position
	const end = { x: p.x + dir.x * stats.maxRange, z: p.z + dir.z * stats.maxRange }
	const radius = Math.max(0, hero.body.radius - tune.collision.epsilon)
	const limit =
		stats.maxRange *
		Math.min(
			sweepObstacles(p, end, radius, sim.obstacles) ?? 1,
			mapExit(p, end, hero.body.radius, sim.bounds) ?? 1,
		)
	const spans = sim.summons
		.filter((u) => u.key === 'balloon' && u.data.phase === 'puddle' && u.until > sim.tick)
		.flatMap((u) => {
			const dx = u.body.position.x - p.x,
				dz = u.body.position.z - p.z
			const along = dx * dir.x + dz * dir.z
			const across = dx * dir.z - dz * dir.x
			const radius = tune.balloon.radius
			if (Math.abs(across) > radius) return []
			const half = Math.sqrt(radius * radius - across * across)
			return [{ start: along - half, end: along + half }]
		})
		.sort((a, b) => a.start - b.start)
	let reach = Math.min(stats.range, limit)
	for (const span of spans)
		if (span.start <= reach && span.end > reach) reach = Math.min(limit, span.end)
	return reach
}
export default {
	name: 'Slide',
	kind: 'instant',
	held: 'arrow',
	icon: '<svg viewBox="0 0 48 48"><path class="tone" d="M5 28 H32 V19 L45 32 L32 44 V36 H5 Z"/><path class="ink-line" d="M3 16 H20 M7 10 H25"/></svg>',
	effects: { cast: true, pose: 'slide' },
	onRelease({ hero, sim, dir, ability }) {
		const distance = slideReach(hero, sim, dir)
		const stats = ability.stats
		const time = Math.max(1, Math.ceil((stats.time * distance) / stats.range / STEP)) * STEP - 1e-9
		hero.dashAbility = ability.id
		hero.body.dash(dir, { distance, time })
	},
	bot: {
		priority: 35,
		act(ctx, slot) {
			const { h, p, enemies, cast, frame } = ctx
			const stats = tune.slide
			const close = enemies.filter(
				(e) => Math.hypot(e.pos.x - p.x, e.pos.z - p.z) <= stats.bot.danger,
			)
			if (close.length && h.hp / h.maxHp < stats.bot.escapeHp) {
				const dx = close.reduce((n, e) => n + p.x - e.pos.x, 0)
				const dz = close.reduce((n, e) => n + p.z - e.pos.z, 0)
				const len = Math.hypot(dx, dz) || 1
				const aim = { x: p.x + (dx / len) * stats.range, z: p.z + (dz / len) * stats.range }
				const nearest = (at) =>
					Math.min(...enemies.map((e) => Math.hypot(e.pos.x - at.x, e.pos.z - at.z)))
				if (
					nearest(aim) >= nearest(p) + stats.bot.escapeGain &&
					ctx.safe(aim, enemies) &&
					cast(slot, aim)
				)
					return frame
			}
			return null
		},
	},
	card: {
		summary: `Belly slide {range} in {time}. A puddle at the stopping point carries you to its edge, up to {maxRange}.`,
	},
}
