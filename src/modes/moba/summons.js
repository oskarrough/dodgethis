import { abilityOf } from './ability.js'
import { unitTuneValue } from './unit-definition.js'
import { ticks } from './sim-kit.js'
import { packStatuses } from './statuses.js'

// No physics body: targetable circles need not obstruct movement or shots through allies.
export function summonBody(at, radius = 0) {
	return { position: { x: at.x, y: 0, z: at.z }, radius, retire() {}, cancelDash() {} }
}

export function createSummons(ctx) {
	const summons = ctx.summons
	let nextId = 0
	function summon(owner, key, at) {
		const ability = abilityOf(key)
		const declaration = ability?.summon
		if (!declaration) throw new Error(`MOBA summon needs an ability declaration: ${key}`)
		const stats = ability.stats
		const hp = unitTuneValue(declaration, 'hp', stats) ?? null
		const radius = unitTuneValue(declaration, 'radius', stats) ?? 0
		const position = hp === null ? at : ctx.walkGoal(at, radius)
		const unit = {
			id: `summon-${++nextId}`,
			kind: 'summon',
			key,
			owner: owner.id,
			team: owner.team,
			hp,
			maxHp: hp,
			dead: false,
			statuses: [],
			body: summonBody(position, radius),
			from: ctx.t,
			until: ctx.t + ticks(unitTuneValue(declaration, 'lifetime', stats)),
			data: declaration.state?.() ?? {},
		}
		summons.push(unit)
		return unit
	}
	function removeSummons(owner = null) {
		for (let i = summons.length - 1; i >= 0; i--)
			if (owner === null || summons[i].owner === owner) {
				ctx.clearStatuses(summons[i], 'removed')
				summons.splice(i, 1)
			}
	}
	function stepSummons(dt) {
		for (const unit of summons.slice()) {
			const i = summons.indexOf(unit)
			if (i < 0) continue
			if (ctx.lane?.match.winner) {
				removeSummons()
				return
			}
			const owner = ctx.heroes.find((h) => h.id === unit.owner)
			if (!owner || unit.dead || ctx.t >= unit.until) {
				ctx.clearStatuses(unit, 'expired')
				summons.splice(i, 1)
				continue
			}
			ctx.expireStatuses(unit)
			ctx.stepStatuses(unit)
			const ability = abilityOf(unit.key)
			ability.summon.brain?.({
				unit,
				owner,
				ability,
				stats: ability.stats,
				sim: ctx.api,
				tick: ctx.t,
				ticks,
				dt,
				present: ctx.present,
			})
		}
		if (ctx.lane?.match.winner) removeSummons()
	}
	function snapshotSummons(wire) {
		return summons
			.filter((u) => !u.dead)
			.map(({ body, statuses, ...unit }) => ({
				...structuredClone(unit),
				pos: { x: body.position.x, z: body.position.z },
				radius: body.radius,
				statuses: wire ? packStatuses(statuses) : structuredClone(statuses),
			}))
	}
	return { summon, removeSummons, stepSummons, snapshotSummons }
}
