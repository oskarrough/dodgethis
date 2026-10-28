import { STEP } from '../../../../core/app.js'
import { sweepHit } from '../../obstacles.js'

export default {
	kind: 'dash',
	// The generic dash ignores first-body contact; Oolong's hero hook owns every kick.
	bot: false,
	tell: 'line',
	held: 'line',
	effects: { cast: true, hit: true, pose: 'flyingKick' },
	card: {
		sentence: `Kicks up to {range} into the first body, dealing {damage:damage} to an enemy; an ally stops it harmlessly.`,
	},
	watch({ hero, sim, ability }) {
		if (hero.dead || hero.dashAbility !== ability.id || !hero.body.dashing) return
		const p = hero.body.position
		const dir = hero.body.dashDirection
		// casting.js rounds the dash to whole fixed steps; sweep exactly that same travel.
		const time = Math.max(1, Math.ceil(ability.stats.time / STEP)) * STEP - 1e-9
		const step = (ability.stats.range / time) * STEP
		const to = { x: p.x + dir.x * step, z: p.z + dir.z * step }
		const units = [
			...sim.heroes,
			...sim.dummies,
			...(sim.lane?.minions ?? []),
			...(sim.lane?.structures ?? []),
		]
		const contacts = units
			.filter((u) => u !== hero && !u.dead)
			.map((unit) => ({
				unit,
				at: sweepHit(
					p.x,
					p.z,
					to.x,
					to.z,
					unit.body.position.x,
					unit.body.position.z,
					ability.stats.radius + unit.body.radius,
				),
			}))
			.filter((c) => c.at != null)
			.sort((a, b) => a.at - b.at || a.unit.id.localeCompare(b.unit.id))
		const contact = contacts[0]
		if (!contact) return
		hero.body.place(p.x + dir.x * step * contact.at, p.y, p.z + dir.z * step * contact.at)
		hero.body.cancelDash()
		if (contact.unit.team !== hero.team)
			sim.hit(
				{
					owner: hero.id,
					team: hero.team,
					ability: ability.id,
					slot: 'slot1',
					dx: dir.x,
					dz: dir.z,
					isAbility: true,
				},
				{ id: contact.unit.id, unit: contact.unit, hero: !contact.unit.kind },
				contact.unit.body.position,
			)
		hero.dashAbility = null
	},
}
