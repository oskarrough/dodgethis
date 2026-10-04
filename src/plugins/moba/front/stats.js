import { STEP } from '../../../core/app.js'
import { heroDefinition } from '../heroes.js'
import { stepHorizontalVelocity } from '../../../core/move.js'

// Fractional final tick uses the same velocity integration as the body at 60 Hz.
export function travelAt(seconds, profile) {
	let left = Math.max(0, seconds)
	let distance = 0
	let vx = 0
	while (left > 0) {
		const velocity = stepHorizontalVelocity(vx, 0, 1, 0, true, STEP, profile)
		distance += velocity.vx * Math.min(STEP, left)
		vx = velocity.vx
		left = Math.max(0, left - STEP)
	}
	return distance
}

export function escapeTime(distance, profile) {
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

export function kitLines(s) {
	return [
		`Hero hits with Loose recharge Vault by ${s.momentum} s.`,
		`First hit · ${Math.round(s.q.damage)} damage · ${s.q.cooldown} s recharge.`,
		`Vault ${s.w.range} m toward aim in ${s.w.time} s · ${s.w.cooldown} s recharge.`,
		`${Math.round(s.e.damage)} damage · ${Math.round(s.e.slow * 100)}% slow for ${s.e.duration} s · ${s.e.cooldown} s recharge.`,
		`Not built yet · planned for level ${s.r.unlock}.`,
	]
}

// Selected-ability panel, not a tooltip. All gameplay values come from live tune.
export function abilityLines(s, slot, heroId = 'fletcher') {
	if (heroId !== 'fletcher' && slot) {
		if (slot === 'Trait')
			return [`Pocket · hold a caught shot for ${s.pocketLife} s, then send it back with Toss.`]
		const ability = s.abilities[`slot${['Q', 'W', 'E', 'R'].indexOf(slot) + 1}`]
		if (!ability) return ['Not playable yet.']
		const labels = {
			damage: ['damage', ''],
			range: ['range', ' m'],
			radius: ['radius', ' m'],
			speed: ['speed', ' m/s'],
			angle: ['arc', '°'],
			castPoint: ['windup', ' s'],
			time: ['travel', ' s'],
			duration: ['lasts', ' s'],
			prone: ['prone', ' s'],
			cooldown: ['recharge', ' s'],
		}
		const parts = Object.entries(ability.stats)
			.filter(([, value]) => typeof value === 'number')
			.map(([key, value]) => {
				const [label, unit] = labels[key] ?? [key.replace(/([A-Z])/g, ' $1').toLowerCase(), '']
				return `${value}${unit} ${label}`
			})
		return Array.from({ length: Math.ceil(parts.length / 3) }, (_, i) =>
			parts.slice(i * 3, i * 3 + 3).join(' · '),
		)
	}
	switch (slot) {
		case 'Trait':
			return [`Hero hits with Loose reduce Vault's recharge by ${s.momentum} s.`]
		case 'Q':
			return [
				`${Math.round(s.q.damage)} damage · ${s.q.cooldown} s recharge`,
				`${s.q.range} m range · ${s.q.radius} m radius · ${s.q.speed} m/s`,
				`${s.q.castPoint} s windup · stops on the first hit`,
			]
		case 'W':
			return [
				`${s.w.range} m dash toward your aim · ${s.w.time} s travel`,
				`${s.w.cooldown} s recharge`,
			]
		case 'E':
			return [
				`${Math.round(s.e.damage)} damage · ${s.e.cooldown} s recharge`,
				`${s.e.range} m reach · ${s.e.radius} m radius · ${s.e.delay} s delay`,
				`${Math.round(s.e.slow * 100)}% slow for ${s.e.duration} s`,
			]
		case 'R':
			return [
				`Planned · not playable yet · unlock at level ${s.r.unlock}`,
				`${Math.round(s.r.damage)} damage · ${s.r.cooldown} s recharge`,
				`${s.r.range} m range · ${s.r.radius} m radius · ${s.r.speed} m/s · ${s.r.castPoint} s windup`,
			]
		default:
			return [
				`${Math.round(s.hp)} HP · ${s.speed} m/s`,
				`Basic attack · ${Math.round(s.attack)} damage · ${s.attackRange} m range · ${s.attackRate}/s`,
			]
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
