import { STEP } from '../../core/app.js'
import { ticks } from './sim-kit.js'
import { clampMap, sweepObstacles } from './obstacles.js'

// Move either a physics hero or a plain lane body without snapping render interpolation.
export function stepUnitDisplacement(unit, tick, dt) {
	const state = unit.displacement
	if (!state) return false
	if (unit.dead || tick > state.until) {
		unit.displacement = null
		return false
	}
	const fraction = Math.min(1, (tick - state.started) / (state.until - state.started))
	const point = {
		x: state.from.x + (state.to.x - state.from.x) * fraction,
		z: state.from.z + (state.to.z - state.from.z) * fraction,
	}
	const body = unit.body
	if (body.rigidBody) {
		body.update({ x: 0, z: 0 }, dt, 0)
		const next = body.rigidBody.nextTranslation()
		body.rigidBody.setNextKinematicTranslation({ ...next, ...point })
	} else Object.assign(body.position, point)
	return true
}

export function createDisplacement(ctx) {
	function displace(unit, point, duration) {
		if (!unit || unit.dead || unit.structure) return false
		if (![point?.x, point?.z, duration].every(Number.isFinite) || duration <= 0) return false
		const from = { x: unit.body.position.x, z: unit.body.position.z }
		const end = clampMap(point, unit.body.radius, ctx.walkingBounds ?? ctx.field)
		const at = sweepObstacles(
			from,
			end,
			unit.body.radius,
			ctx.obstacles.filter((o) => o.id !== unit.id),
		)
		const to = {
			x: from.x + (end.x - from.x) * (at ?? 1),
			z: from.z + (end.z - from.z) * (at ?? 1),
		}
		unit.body.cancelDash?.()
		unit.body.setVelocity?.({ x: 0, y: unit.body.velocity.y, z: 0 })
		unit.dashAbility = null
		ctx.footprints.delete(unit.body)
		ctx.endCast(unit, 'displaced')
		ctx.cancelChannel(unit, 'displaced')
		if (!unit.kind) ctx.ball?.hurt(unit)
		unit.attack = null
		unit.ballThrow = null
		unit.shove = null
		unit.path = null
		unit.displacement = {
			from,
			to,
			started: ctx.t,
			until: ctx.t + Math.max(1, ticks(Math.max(STEP, duration))),
		}
		return true
	}
	return { displace }
}
