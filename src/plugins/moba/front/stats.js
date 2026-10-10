import { STEP } from '../../../core/app.js'
import { heroDefinition } from '../heroes.js'
import { stepHorizontalVelocity } from '../../../core/move.js'

function escapeTime(distance, profile) {
	if (distance <= 0) return 0
	if (!(profile.speed > 0 && profile.accel > 0)) return Infinity
	let elapsed = 0
	let walked = 0
	let vx = 0
	while (walked < distance) {
		;({ vx } = stepHorizontalVelocity(vx, 0, 1, 0, true, STEP, profile))
		const step = vx * STEP
		if (walked + step >= distance) return elapsed + (distance - walked) / vx
		walked += step
		elapsed += STEP
	}
	return elapsed
}

export function heroStats(kit, front, level = 1, heroId = 'fletcher') {
	const mul = 1 + front.level.growth * (Math.max(1, Math.min(front.level.cap, level)) - 1)
	if (heroId !== 'fletcher') {
		const definition = heroDefinition(heroId)
		return {
			level,
			hp: definition.base.hp * mul,
			speed: definition.base.speed,
			attack: (definition.basic?.damage ?? 0) * mul,
			attackRange: definition.basic?.range ?? 0,
			attackRate: definition.basic?.rate ?? 0,
			abilities: definition.abilities,
			pocketLife: kit.catching.pocketLife,
		}
	}
	const qClear = kit.loose.radius + kit.hero.radius
	const rainClear = kit.rain.radius + kit.hero.radius
	return {
		level,
		hp: kit.hero.hp * mul,
		speed: kit.hero.speed,
		attack: kit.attack.damage * mul,
		attackRange: kit.orders.attackRange,
		attackRate: kit.attack.rate,
		momentum: kit.momentum.reduction,
		q: {
			...kit.loose,
			damage: kit.loose.damage * mul,
			warning: kit.loose.castPoint,
			flight: front.preview.distance / kit.loose.speed,
			clear: qClear,
			sidestep: escapeTime(qClear, kit.hero),
			steady: qClear / kit.hero.speed,
			margin:
				kit.loose.castPoint +
				front.preview.distance / kit.loose.speed -
				escapeTime(qClear, kit.hero),
		},
		w: { ...kit.vault },
		e: {
			...kit.rain,
			damage: kit.rain.damage * mul,
			clear: rainClear,
			escape: escapeTime(rainClear, kit.hero),
			steady: rainClear / kit.hero.speed,
			margin: kit.rain.delay - escapeTime(rainClear, kit.hero),
		},
		r: { ...front.volley, damage: front.volley.damage * mul },
	}
}

const n = (v) => Number(v.toFixed(3))
export function numberLines(s, distance) {
	return [
		`Level ${s.level} · ${Math.round(s.hp)} HP · ${s.speed} m/s`,
		`Basic · ${Math.round(s.attack)} damage · ${s.attackRange} m · ${s.attackRate}/s`,
		`Loose · ${Math.round(s.q.damage)} damage · ${s.q.range} m · ${s.q.radius} m radius · ${s.q.speed} m/s · ${s.q.cooldown} s recharge`,
		`Warning ${n(s.q.warning)} s; flight to ${distance} m ${n(s.q.flight)} s`,
		`Dodge Loose: moving from rest takes ${n(s.q.sidestep)} s to get clear`,
		`Vault · ${s.w.range} m in ${s.w.time} s · ${s.w.cooldown} s recharge`,
		`Rain · ${Math.round(s.e.damage)} damage · ${s.e.range} m reach · ${s.e.radius} m radius · ${s.e.delay} s delay · ${s.e.cooldown} s recharge`,
		`Slow ${Math.round(s.e.slow * 100)}% for ${s.e.duration} s`,
		`Dodge Rain: moving from its centre takes ${n(s.e.escape)} s to get clear`,
		`Planned Volley · ${Math.round(s.r.damage)} damage · ${s.r.range} m · ${s.r.radius} m radius · ${s.r.speed} m/s`,
		`Warning ${s.r.castPoint} s · ${s.r.cooldown} s recharge · level ${s.r.unlock}`,
	]
}
