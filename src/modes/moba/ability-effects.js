import {
	STATUS_EFFECT_REFS,
	AREA_EFFECT_REFS,
	TARGET_EFFECT_REFS,
	ACTION_EFFECT_REFS,
	effectRecord,
} from './ability.js'
import { tune } from './tune.js'
import { STEP } from '../../core/app.js'
import { ticks } from './sim-kit.js'
import { stateUntil } from './statuses.js'

// Resolve once at delivery; projectiles retain these numbers throughout their flight.
export function resolveEffects(ability, records, level, dt = STEP, factor = 1) {
	const stats = ability.stats
	return records.map((input) => {
		const record = effectRecord(ability, input)
		const refs =
			STATUS_EFFECT_REFS[record.effect] ??
			AREA_EFFECT_REFS[record.effect] ??
			TARGET_EFFECT_REFS[record.effect] ??
			ACTION_EFFECT_REFS[record.effect]
		const effect = { ...record }
		for (const field of Object.keys(refs)) effect[field] = stats[record[field]]
		if (['damage', 'heal'].includes(effect.effect))
			effect.amount =
				effect.amount * (record.scale === null ? 1 : 1 + tune.levels.growth * (level - 1)) * factor
		if (record.perSecond) effect.amount *= dt
		return effect
	})
}

export function statusPayload(ability, effect) {
	return {
		key: `${ability.id}.${effect.key ?? effect.effect}`,
		...(effect.duration !== undefined && { duration: effect.duration }),
		...(effect.amount !== undefined && { amount: effect.amount }),
		...(['slow', 'haste'].includes(effect.effect) && {
			mag:
				effect.effect === 'slow'
					? Math.max(0, Math.min(1, 1 - effect.magnitude))
					: 1 + Math.max(0, effect.magnitude),
		}),
	}
}

export function createAbilityEffects(ctx) {
	function freezeImpact(source, unit) {
		unit.body.cancelDash()
		unit.dashAbility = null
		ctx.takeDashEvent(unit)
		ctx.present({
			type: 'contact',
			part: 'impact',
			source: source.unit.id,
			target: unit.id,
			ability: source.ability.id,
			until: stateUntil(unit, 'frozen'),
			point: { ...unit.body.position },
		})
	}
	// One effect interpreter. Callers supply resolved numbers, never delivery/timing flags.
	function applyEffects(source, unit, effects) {
		const { unit: actor, ability, slot, dir, point } = source
		if (unit.dead || unit.hp <= 0) return { lethal: true }
		const damage = effects.find((effect) => effect.effect === 'damage')
		const statuses = effects.filter((effect) => ['slow', 'freeze', 'haste'].includes(effect.effect))
		if (damage) {
			const result = ctx.hit(
				{
					owner: actor.id,
					team: actor.team,
					ability: ability.id,
					slot,
					isAbility: true,
					dx: dir.x,
					dz: dir.z,
					damage: damage.amount,
					periodic: damage.periodic === true,
					...source.hit,
					applies: statuses.map((effect) => statusPayload(ability, effect)),
				},
				{ id: unit.id, unit, hero: !unit.kind },
				point ?? unit.body.position,
			)
			if (result?.consumed) return { lethal: false, consumed: true }
		} else
			for (const effect of statuses) {
				const { key, ...options } = statusPayload(ability, effect)
				ctx.apply(unit, key, { ...options, source: actor })
			}
		let heal = 0
		const lethal = unit.dead || unit.hp <= 0
		if (!lethal)
			for (const effect of effects) {
				if (effect.effect === 'freeze') freezeImpact(source, unit)
				else if (effect.effect === 'heal') {
					heal = ctx.heal(actor, unit, effect.amount, ability.id, {
						critChance: effect.critChance,
						critMultiplier: effect.critMultiplier,
						periodic: effect.periodic === true,
					})
				} else if (effect.effect === 'shield') {
					const shield =
						effect.stack === 'add' &&
						unit.statuses?.find(
							(status) =>
								status.key === `${ability.id}.shield` &&
								status.src === actor.id &&
								(status.until === null || status.until > ctx.t),
						)
					if (shield) {
						shield.amount += effect.amount
						shield.until = ctx.t + ticks(effect.duration)
					} else
						ctx.apply(unit, `${ability.id}.shield`, {
							source: actor,
							amount: effect.amount,
							...(effect.duration !== undefined && { duration: effect.duration }),
						})
				} else if (effect.effect === 'status') {
					ctx.apply(unit, `${ability.id}.${effect.key}`, {
						source: effect.source === null ? null : actor,
					})
				} else if (effect.effect === 'catch') {
					const duration = effect.duration + (effect.linger ?? 0)
					if (effect.refresh) {
						if (unit.catchWindow) unit.catchWindow.until = ctx.t + ticks(duration)
					} else
						ctx.openCatch(unit, {
							ability: ability.id,
							dir,
							duration,
							radius: effect.radius,
							angle: effect.angle,
							acceptBall: effect.acceptBall,
							...(effect.resetCooldown && { resetSlot: slot, resetCooldown: effect.resetCooldown }),
						})
				} else if (effect.effect === 'displace' || effect.effect === 'knockback') {
					if (effect.effect === 'displace' && (actor.dead || unit.structure)) continue
					const at = effect.to === 'source' ? actor.body.position : (point ?? unit.body.position)
					ctx.displace(
						unit,
						{ x: at.x + dir.x * effect.distance, z: at.z + dir.z * effect.distance },
						effect.duration,
					)
				} else if (effect.effect === 'cleanse') {
					for (const tag of effect.tags) ctx.cleanse(unit, tag)
				}
			}
		return { lethal, heal }
	}
	return { applyEffects, freezeImpact }
}
