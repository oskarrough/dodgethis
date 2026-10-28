import { STEP } from '../../../../core/app.js'
import { tune } from '../../tune.js'

// A flight is an ordinary replicated summon. Each contact chooses the next body from
// the live court, with distance/id ties, and never visits a body twice.
export const pinballFlight = {
	lifetime: (stats) => (stats.jumps + 2) * Math.max(STEP, stats.flight),
	state: () => ({ hit: {}, hop: 0 }),
	validData: (data) =>
		[data.start, data.to].every((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z)) &&
		typeof data.target === 'string' &&
		typeof data.slot === 'string' &&
		Number.isInteger(data.hop) &&
		data.hop >= 0 &&
		Number.isFinite(data.depart) &&
		Number.isFinite(data.arrive) &&
		data.arrive > data.depart &&
		data.hit &&
		typeof data.hit === 'object' &&
		!Array.isArray(data.hit) &&
		Object.values(data.hit).every((hit) => hit === true),
	brain({ unit, owner, sim, tick, ticks, stats, present }) {
		if (owner.dead) {
			unit.dead = true
			return
		}
		const d = unit.data
		const targets = sim.enemiesOf(owner.team)
		const target = targets.find((t) => t.id === d.target)
		if (target) d.to = { x: target.x, z: target.z }
		const progress = Math.min(1, (tick - d.depart) / (d.arrive - d.depart))
		unit.body.position.x = d.start.x + (d.to.x - d.start.x) * progress
		unit.body.position.z = d.start.z + (d.to.z - d.start.z) * progress
		if (tick < d.arrive) return
		d.hit[d.target] = true
		if (target) {
			const length = Math.hypot(d.to.x - d.start.x, d.to.z - d.start.z) || 1
			sim.hit(
				{
					owner: owner.id,
					team: owner.team,
					ability: 'pinball',
					slot: d.slot,
					isAbility: true,
					damage:
						stats.damage *
						(1 + tune.levels.growth * (owner.level - 1)) *
						(1 - stats.falloff) ** d.hop,
					dx: (d.to.x - d.start.x) / length,
					dz: (d.to.z - d.start.z) / length,
				},
				target,
				d.to,
			)
		}
		// The line arrives on the same tick as damage, including a dead target's empty contact.
		present({
			type: 'contact',
			part: target ? 'impact' : 'end',
			source: owner.id,
			ability: 'pinball',
			origin: { ...d.start },
			point: { ...d.to },
			hop: d.hop,
		})
		const near = (t) => Math.hypot(t.x - d.to.x, t.z - d.to.z)
		const next =
			d.hop < stats.jumps &&
			sim
				.enemiesOf(owner.team)
				.filter((t) => !d.hit[t.id] && near(t) <= stats.jumpRange + (t.radius ?? 0))
				.sort((a, b) => near(a) - near(b) || a.id.localeCompare(b.id))[0]
		if (!next) {
			unit.dead = true
			return
		}
		d.start = { ...d.to }
		d.to = { x: next.x, z: next.z }
		d.target = next.id
		d.hop++
		d.depart = tick
		d.arrive = tick + Math.max(1, ticks(stats.flight))
	},
}

export function servePinball({ hero, sim, event, tick, ticks, stats, present }) {
	const target = event.target
	if (
		!target ||
		target.dead ||
		target.team === hero.team ||
		Math.hypot(
			target.body.position.x - hero.body.position.x,
			target.body.position.z - hero.body.position.z,
		) > stats.range
	) {
		present({ type: 'denied', hero: hero.id, slot: event.slot, reason: 'targetLost' })
		return
	}
	const ball = sim.summon(hero, 'pinball', hero.body.position)
	Object.assign(ball.data, {
		start: { x: hero.body.position.x, z: hero.body.position.z },
		to: { x: event.target.body.position.x, z: event.target.body.position.z },
		target: event.target.id,
		slot: event.slot,
		depart: tick,
		arrive: tick + Math.max(1, ticks(stats.flight)),
	})
	present({
		type: 'contact',
		part: 'release',
		source: hero.id,
		ability: 'pinball',
		point: { ...hero.body.position },
	})
}
