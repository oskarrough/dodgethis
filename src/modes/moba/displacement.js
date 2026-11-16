import { STEP } from '../../core/app.js'
import { ticks, cancelAttack } from './sim-kit.js'
import { clampMap, sweepObstacles } from './obstacles.js'

// Move either a physics hero or a plain lane body without snapping render interpolation.
export function stepUnitDisplacement(unit, tick, dt) {
	const status = unit.statuses?.find((entry) => entry.motion && entry.until > tick)
	const state = status?.motion
	if (!state || unit.dead) return false
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
	// Where a knock from `from` to `point` meets the walking edge inside a Flagfall shore gap, if it does.
	function overEdge(unit, from, point, others) {
		if (unit.kind || !ctx.gaps?.length) return null
		const dz = point.z - from.z
		const flank = dz < 0 ? -1 : 1
		const edge = ctx.layout.bounds.halfZ - unit.body.radius
		if (Math.abs(dz) < 1e-4 || Math.abs(point.z) < edge || Math.abs(from.z) > edge) return null
		const f = (edge * flank - from.z) / dz
		const to = { x: from.x + (point.x - from.x) * f, z: edge * flank }
		if (!ctx.gapAt(to.x, flank) || sweepObstacles(from, to, unit.body.radius, others) != null)
			return null
		return { to }
	}

	// A `knock` (an enemy's blow, not a hop or a recall) that carries a hero out through a shore gap dunks them.
	function displace(unit, point, duration, knock = null) {
		if (!unit || unit.dead || unit.structure || unit.kind === 'summon') return false
		if (![point?.x, point?.z, duration].every(Number.isFinite) || duration <= 0) return false
		const from = { x: unit.body.position.x, z: unit.body.position.z }
		const others = ctx.obstacles.filter((o) => o.id !== unit.id)
		const over = knock ? overEdge(unit, from, point, others) : null
		const end = over ? over.to : clampMap(point, unit.body.radius, ctx.walkingBounds ?? ctx.field)
		const at = over ? null : sweepObstacles(from, end, unit.body.radius, others)
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
		cancelAttack(unit, ctx.present, 'displaced')
		unit.ballThrow = null
		unit.shove = null
		unit.path = null
		const until = ctx.t + Math.max(1, ticks(Math.max(STEP, duration)))
		const status = ctx.apply(unit, 'core.motion')
		status.motion = { from, to, started: ctx.t, until }
		// Motion includes its endpoint tick; ordinary statuses expire at that tick.
		status.until = until + 1
		if (over) {
			const length = Math.hypot(point.x - from.x, point.z - from.z)
			const team = ['A', 'B'].includes(knock.team) ? knock.team : unit.team === 'A' ? 'B' : 'A'
			const dir = { x: (point.x - from.x) / length, z: (point.z - from.z) / length }
			unit.shove = { until, dunk: true, dir, source: knock.source ?? null, team }
		}
		return true
	}
	return { displace }
}
