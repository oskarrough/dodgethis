import { STEP } from '../../../core/app.js'
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

export function heroStats(kit, front, level = 1) {
	const mul = 1 + front.level.growth * (Math.max(1, Math.min(front.level.cap, level)) - 1)
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
		`Piercing · ${Math.round(s.r.damage)} damage · unlocks at level ${s.r.unlock}.`,
	]
}

const n = (v) => Number(v.toFixed(3))
export function numberLines(s, distance) {
	return [
		`Level ${s.level} · ${Math.round(s.hp)} HP · ${s.speed} m/s`,
		`Basic · ${Math.round(s.attack)} damage · ${s.attackRange} m · ${s.attackRate}/s`,
		`Loose · ${Math.round(s.q.damage)} damage · ${s.q.range} m · ${s.q.radius} m radius · ${s.q.speed} m/s · ${s.q.cooldown} s recharge`,
		`Warning ${n(s.q.warning)} s; flight to ${distance} m ${n(s.q.flight)} s`,
		`Sidestep ${n(s.q.steady)} s at speed; ${n(s.q.sidestep)} s from rest (60 Hz)`,
		`Vault · ${s.w.range} m in ${s.w.time} s · ${s.w.cooldown} s recharge`,
		`Rain · ${Math.round(s.e.damage)} damage · ${s.e.range} m reach · ${s.e.radius} m radius · ${s.e.delay} s delay · ${s.e.cooldown} s recharge`,
		`Slow ${Math.round(s.e.slow * 100)}% for ${s.e.duration} s`,
		`Centre escape ${n(s.e.steady)} s at speed; ${n(s.e.escape)} s from rest; ${n(s.e.margin)} s to spare`,
		`Volley · ${Math.round(s.r.damage)} damage · ${s.r.range} m · ${s.r.radius} m radius · ${s.r.speed} m/s`,
		`Warning ${s.r.castPoint} s · ${s.r.cooldown} s recharge · level ${s.r.unlock}`,
	]
}
