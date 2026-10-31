import { tune } from './tune.js'

// Small verbs the talent trees share (heroes/<id>/<id>-talents.js). Nothing here draws.

// Which cooldown slot holds an ability for this hero: 0 for slot1, -1 when it isn't in the kit.
export const slotOf = (hero, abilityId) =>
	Object.values(hero.definition.abilities).findIndex((ability) => ability?.id === abilityId)

// An amount at the hero's level, grown as ability damage grows.
export const scaled = (hero, amount) => amount * (1 + tune.levels.growth * ((hero.level ?? 1) - 1))

// Foes whose edge is within `radius` of a point, as targeting.js lists them ({ unit, id, x, z, radius, hero }).
export const foesNear = (sim, hero, point, radius) =>
	sim
		.enemiesOf(hero.team)
		.filter((e) => !e.unit.dead && Math.hypot(e.x - point.x, e.z - point.z) <= radius + e.radius)

// Strike one foe from a talent as the hero's own ability would.
export function strike(
	sim,
	hero,
	foe,
	{ ability, slot, damage, from = hero.body.position, ...extra },
) {
	const dx = foe.x - from.x
	const dz = foe.z - from.z
	const length = Math.hypot(dx, dz) || 1
	sim.hit(
		{
			owner: hero.id,
			team: hero.team,
			ability,
			slot,
			damage,
			dx: dx / length,
			dz: dz / length,
			isAbility: true,
			from: { x: from.x, z: from.z },
			...extra,
		},
		foe,
		{ x: foe.x, z: foe.z },
	)
}

// Push a unit `distance` straight away from a point over `time`.
export function shove(sim, unit, from, distance, time) {
	const p = unit.body.position
	const dx = p.x - from.x
	const dz = p.z - from.z
	const length = Math.hypot(dx, dz) || 1
	return sim.displace(
		unit,
		{ x: p.x + (dx / length) * distance, z: p.z + (dz / length) * distance },
		time,
	)
}

// An active status of `key` on a unit, optionally from one source.
export const statusOn = (unit, key, tick, source = null) =>
	(unit.statuses ?? []).find(
		(status) =>
			status.key === key &&
			!status.removed &&
			(source == null || status.src === source) &&
			(status.until == null || status.until > tick),
	)
