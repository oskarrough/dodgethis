import { STEP } from '../../core/app.js'
import { tune } from './tune.js'
import { look } from './look.js'
import { unitFromDeclaration } from './unit-definition.js'
import { clampWalkable } from './obstacles.js'

export const MINION_DEFINITIONS = Object.fromEntries(
	['brute', 'melee', 'ranged', 'wizard'].map((kind) => [
		kind,
		unitFromDeclaration(
			kind,
			{
				hp: 'hp',
				radius: () => (kind === 'brute' ? look.laneView.bruteRadius : tune.waves.radius),
				speed: 'speed',
				attack: { damage: 'damage', rate: 'rate', range: 'range', tell: 'tell' },
				brain: 'lane',
			},
			() => tune.minions[kind],
		),
	]),
)

const ticks = (s) => Math.max(1, Math.round(s / STEP))
// A lane's normal is authored A→B, so files keep their side on the reverse march.
const direction = (a, b) => {
	const length = Math.hypot(b.x - a.x, b.z - a.z) || 1
	return { x: (b.x - a.x) / length, z: (b.z - a.z) / length }
}
const offset = (point, forward, file) => ({
	x: point.x - forward.z * file,
	z: point.z + forward.x * file,
})

// Seconds between waves at match time `seconds`: `interval`, then from the map's late mark it starts at
// `lateInterval` and shortens by `lateStep` each minute down to `minInterval`.
export function waveInterval(seconds, late = tune.match.late) {
	const w = tune.waves
	if (seconds < late) return w.interval
	const minutes = Math.floor((seconds - late) / 60)
	return Math.max(w.minInterval, w.lateInterval - w.lateStep * minutes)
}

// A team's march along `lane` at side offset `file`, ending in front of the enemy core.
export function route(structures, lane, team, file) {
	const path = team === 'A' ? lane.path : [...lane.path].reverse()
	const points = path.map((point, i) => {
		const forward = direction(path[Math.max(0, i - 1)], path[Math.max(1, i)])
		return offset(point, team === 'A' ? forward : { x: -forward.x, z: -forward.z }, file)
	})
	const core = structures.find((s) => s.kind === 'core' && s.team !== team)
	if (core) {
		const end = path.at(-1)
		const forward = direction(path.at(-2), end)
		const towardCore = direction(end, core.body.position)
		const goal = offset(
			{
				x: core.body.position.x - towardCore.x * (core.body.radius + tune.waves.structureStandoff),
				z: core.body.position.z - towardCore.z * (core.body.radius + tune.waves.structureStandoff),
			},
			team === 'A' ? towardCore : { x: -towardCore.x, z: -towardCore.z },
			file,
		)
		// A collinear core extends the final leg; an off-lane core needs the courtyard turn.
		if (forward.x * towardCore.z - forward.z * towardCore.x === 0) points[points.length - 1] = goal
		else points.push(goal)
	}
	return points
}

// The wave clock and spawner: every lane, both teams, rows of minions in files, growing over time.
export function createWaves(shared) {
	const { layout, minions, structures, reinforcements, makeBody, obstacles, present } = shared
	let nextWave = ticks(tune.waves.first)
	function spawn(t) {
		for (const lane of layout.lanes)
			for (const team of ['A', 'B']) {
				const path = team === 'A' ? lane.path : [...lane.path].reverse()
				const forward = direction(path[0], path[1])
				for (const [row, kind] of (t * STEP >= (layout.late ?? tune.match.late)
					? ['melee', 'ranged', 'wizard', 'brute']
					: ['melee', 'ranged', 'wizard']
				).entries()) {
					const stats = MINION_DEFINITIONS[kind].base
					const count =
						stats.count +
						(kind === tune.waves.reinforcement ? (reinforcements[`${team}-${lane.id}`] ?? 0) : 0)
					const growth = 1 + tune.waves.growth * Math.floor((t * STEP) / tune.waves.growthPeriod)
					for (let file = 0; file < count; file++) {
						const spacing =
							(count === 2 ? file * 2 - 1 : file - (count - 1) / 2) * tune.waves.fileSpacing
						const start = offset(
							{
								x: path[0].x - forward.x * row * tune.waves.rowSpacing,
								z: path[0].z - forward.z * row * tune.waves.rowSpacing,
							},
							team === 'A' ? forward : { x: -forward.x, z: -forward.z },
							spacing,
						)
						const unit = {
							id: `minion-${shared.nextSerial()}`,
							team,
							kind,
							hp: stats.hp * growth,
							maxHp: stats.hp * growth,
							damageScale: growth,
							dead: false,
							body: makeBody(start.x, start.z, team, kind),
							lane: lane.id,
							route: route(structures, lane, team, spacing),
							routeLeg: 1,
							halfWidth: lane.halfWidth,
							file: spacing,
							target: null,
							forced: null,
							aggroUntil: 0,
							attackTick: t,
							attack: null,
							statuses: [],
						}
						const safe = clampWalkable(
							unit.body.position,
							unit.body.radius,
							tune.orders.clearance,
							obstacles,
							layout.bounds,
						)
						unit.body.position.x = safe.x
						unit.body.position.z = safe.z
						minions.push(unit)
						present({ type: 'spawn', target: unit.id, point: { ...unit.body.position } })
					}
				}
			}
	}
	return {
		step(t) {
			if (t < nextWave) return
			if (shared.wavesEnabled()) spawn(t)
			nextWave += ticks(waveInterval(t * STEP, layout.late ?? tune.match.late))
		},
		get nextWave() {
			return nextWave
		},
	}
}
