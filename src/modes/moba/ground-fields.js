import { STATUS_EFFECT_REFS } from './ability.js'
import { resolveEffects, statusPayload } from './ability-effects.js'
import { STEP } from '../../core/app.js'
import { ticks } from './sim-kit.js'

// Field membership and clocks live here; summons only supply an optional end condition.
export function createGroundFields(ctx) {
	const ground = new Set()
	const groundFields = [] // Plain presentation rows, shared by local views and snapshots.
	let nextGroundId = 0
	function addGround(actor, ability, action, event) {
		const stats = ability.stats
		const field = {
			id: ++nextGroundId,
			action,
			actor,
			definition: actor.definition,
			carrier: event.carrier,
			ability,
			event: { ...event },
			point: { ...event.point },
			until: ctx.t + ticks(stats[action.lifetime]),
			next: ctx.t,
			members: new Map(),
		}
		field.view = {
			id: field.id,
			ability: ability.id,
			owner: actor.id,
			team: actor.team,
			x: field.point.x,
			z: field.point.z,
			radius: stats[action.radius],
			from: ctx.t,
			until: field.until,
		}
		ground.add(field)
		groundFields.push(field.view)
	}
	function leaveGround(field, unit, entries) {
		for (const { record, key } of entries)
			if (record.while === 'inside')
				for (const status of unit.statuses ?? [])
					if (status.field === field.id && status.key === `${field.ability.id}.${key}`) {
						status.until = ctx.t + ticks(field.ability.stats[record.linger])
						if (status.until <= ctx.t) ctx.remove(unit, status.id, 'expired')
						else ctx.presentStatus(unit, status, 'refresh')
					}
	}
	function stepGroundField(field, forceEnd = false) {
		const { actor, ability, action, members } = field
		const stats = ability.stats
		const removed = !ctx.heroes.includes(actor) || actor.definition !== field.definition
		const ended =
			forceEnd ||
			removed ||
			Boolean(ctx.lane?.match.winner) ||
			ctx.t >= field.until ||
			(field.carrier && !ctx.summons.includes(field.carrier))
		const inside = new Map()
		if (!ended)
			for (const unit of [
				...ctx.auraUnits().filter((unit) => unit.team === actor.team),
				...ctx.api.enemiesOf(actor.team).map((target) => target.unit),
			]) {
				// Untargetable cosmetic summons are not field occupants.
				if (unit.hp == null) continue
				if (
					Math.hypot(unit.body.position.x - field.point.x, unit.body.position.z - field.point.z) >
					stats[action.radius] + (unit.body.radius ?? 0)
				)
					continue
				const side = unit.team === actor.team ? 'allies' : 'enemies'
				inside.set(
					unit,
					ability.groundEffects.filter((entry) => entry.action === action && entry.side === side),
				)
			}
		for (const [unit, entries] of members)
			if (!inside.has(unit)) {
				members.delete(unit)
				leaveGround(field, unit, entries)
			}
		if (ended) {
			ground.delete(field)
			groundFields.splice(groundFields.indexOf(field.view), 1)
			return
		}
		const pulse = ctx.t >= field.next
		if (pulse) field.next = ctx.t + Math.max(1, ticks(stats[action.every]))
		for (const [unit, entries] of inside) {
			const entering = !members.has(unit)
			members.set(unit, entries)
			if (unit.dead) continue
			const effects = entries
				.filter(({ record }) => pulse || (entering && record.while === 'inside'))
				.map(({ record, key }) => ({ ...record, key: record.key ?? key }))
			const resolved = resolveEffects(ability, effects, actor.level)
			for (const effect of resolved.filter((effect) => STATUS_EFFECT_REFS[effect.effect])) {
				const { key, ...options } = statusPayload(ability, effect)
				ctx.apply(unit, key, {
					...options,
					source: actor,
					field: field.id,
					...(effect.while === 'inside' && {
						duration: (field.next - ctx.t + ticks(stats[effect.linger]) + 1) * STEP,
					}),
				})
			}
			const source = {
				unit: actor,
				ability,
				slot: field.event.slot,
				dir: field.event.dir ?? { x: 0, z: 0 },
				point: { ...unit.body.position },
			}
			ctx.applyEffects(
				source,
				unit,
				resolved.filter((effect) => !STATUS_EFFECT_REFS[effect.effect]),
			)
			if (!unit.dead && resolved.some((effect) => effect.effect === 'freeze'))
				ctx.freezeImpact(source, unit)
		}
	}
	function removeGround(owner = null) {
		const fields = [...ground]
		for (const field of fields)
			if (owner === null || field.actor.id === owner) stepGroundField(field, true)
	}
	function stepGround() {
		const fields = [...ground]
		for (const field of fields) stepGroundField(field)
	}
	return { addGround, stepGround, removeGround, groundFields }
}
