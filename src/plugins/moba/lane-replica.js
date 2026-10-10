import { createUnitReplica } from './lobby-replica.js'
import { tune } from './tune.js'
import { HEROES, freshAbilityState } from './heroes.js'

// Fixed columns avoid repeating entity field names. Packets are full states, never deltas;
// the replica expands these rows before its ordinary population and health validation.
const columns = {
	heroes: [
		'id',
		'team',
		'heroId',
		'hp',
		'maxHp',
		'dead',
		'pos',
		'vel',
		'yaw',
		'level',
		'cd',
		'cancelUntil',
		'abilityState',
		'respawnTick',
		'stunUntil',
		'ballThrow',
		'attack',
		'attackTick',
		'order',
		'cast',
		'slow',
		'freezeUntil',
		'proneUntil',
		'stance',
		'channel',
		'catchWindow',
	],
	minions: [
		'id',
		'kind',
		'team',
		'hp',
		'maxHp',
		'dead',
		'pos',
		'yaw',
		'target',
		'attackTick',
		'attack',
	],
	structures: [
		'id',
		'team',
		'kind',
		'vulnerable',
		'silentUntil',
		'hp',
		'maxHp',
		'dead',
		'target',
		'attackTick',
		'attack',
	],
	projectiles: [
		'id',
		'owner',
		'team',
		'ability',
		'slot',
		'pos',
		'dir',
		'speed',
		'radius',
		'travelled',
		'range',
		'target',
	],
}
const heroDefaults = {
	respawnTick: null,
	stunUntil: 0,
	ballThrow: null,
	attack: null,
	attackTick: 0,
	order: null,
	cast: null,
	freezeUntil: 0,
	proneUntil: 0,
	stance: null,
	channel: null,
	catchWindow: null,
}
const coordinateFields = { heroes: ['pos', 'vel'], minions: ['pos'], projectiles: ['pos', 'dir'] }
const recapColumns = [
	'heroId',
	'team',
	'bot',
	'kills',
	'deaths',
	'heroDamage',
	'structureDamage',
	'xp',
	'recent',
	'death',
]
const hitColumns = ['source', 'damage']
const packHits = (hits) => hits.map((hit) => hitColumns.map((key) => hit[key]))
const unpack = (row, fields) =>
	Array.isArray(row) && row.length === fields.length
		? Object.fromEntries(fields.map((field, index) => [field, row[index]]))
		: null
const hostFields = new Set([
	'aggroOrigin',
	'returnGoal',
	'forced',
	'aggroUntil',
	'returning',
	'damageScale',
])

// Full sim snapshots remain useful for traces; only the online contract asks for this projection.
export function projectLaneSnapshot(state) {
	const round = (value) => {
		if (typeof value === 'number' && !Number.isInteger(value))
			return Math.round(value * tune.lobby.replica.precision) / tune.lobby.replica.precision || 0
		if (Array.isArray(value)) return value.map(round)
		if (!value || typeof value !== 'object') return value
		return Object.fromEntries(
			Object.entries(value)
				.filter(([key]) => !hostFields.has(key))
				.map(([key, v]) => [key, round(v)]),
		)
	}
	const copy = round(state)
	for (const [key, fields] of Object.entries(columns))
		copy[key] = copy[key].map((unit) => {
			const row = fields.map((field) => {
				const value = unit[field] ?? null
				if (key === 'heroes') {
					if (Object.hasOwn(heroDefaults, field) && value === heroDefaults[field]) return null
					if (['cd', 'cancelUntil'].includes(field) && value.every((v) => v === 0)) return null
					if (
						field === 'abilityState' &&
						JSON.stringify(value) === JSON.stringify(freshAbilityState(HEROES[unit.heroId]))
					)
						return null
					if (field === 'slow' && value.until === 0 && value.factor === 1) return null
				}
				if (coordinateFields[key]?.includes(field) && value) return [value.x, value.z]
				if (key === 'minions' && field === 'id') return Number(value.slice('minion-'.length))
				return value
			})
			if (key === 'heroes')
				while (row.length > fields.indexOf('respawnTick') && row.at(-1) === null) row.pop()
			return row
		})
	copy.matchStats = Object.entries(copy.matchStats).map(([id, row]) => [
		id,
		...recapColumns.map((key) =>
			key === 'recent'
				? packHits(row.recent)
				: key === 'death' && row.death
					? [row.death.source, row.death.tick, packHits(row.death.hits)]
					: row[key],
		),
	])
	copy.projection = true
	return copy
}

const finite = Number.isFinite
const tick = (n) => Number.isSafeInteger(n) && n >= 0
const team = (value) => ['A', 'B'].includes(value)
const point = (p) => p && finite(p.x) && finite(p.z)
const lerp = (a, b, blend) => a + (b - a) * blend
const health = (u) =>
	finite(u.hp) &&
	finite(u.maxHp) &&
	u.hp >= 0 &&
	u.maxHp > 0 &&
	u.hp <= u.maxHp &&
	typeof u.dead === 'boolean'
const attack = (a) => !a || (finite(a.left) && finite(a.total) && a.total > 0)
const recapHits = (hits) =>
	Array.isArray(hits) &&
	hits.length <= tune.hud.recapSources &&
	hits.every(
		(hit) =>
			hit &&
			(hit.source === null || typeof hit.source === 'string') &&
			finite(hit.damage) &&
			hit.damage >= 0,
	)

// One buffer and one presentation clock for combat, populations, objectives and recaps.
// The inherited sim's step is never run; find/pick can still read the reconciled lane arrays.
export function createLaneReplica(simulation, scene) {
	let laneTick = 0
	let nextWave = 0
	let nextBall = 0
	let ball = null
	const minions = new Map()
	const structures = new Map(simulation.lane.structures.map((u) => [u.id, u]))
	const lane = Object.create(simulation.lane, {
		time: { get: () => laneTick },
		nextWave: { get: () => nextWave },
	})
	const ballReplica = {
		buffered: true,
		get state() {
			return ball
		},
		get nextBall() {
			return nextBall
		},
		carrying: (hero) => ball?.state === 'carried' && ball.carrier === hero.id,
	}
	function validateState(state) {
		if (state.map !== simulation.bounds.id) return 'Lane map mismatch'
		if (
			!state.match ||
			!['early', 'objective', 'late'].includes(state.match.phase) ||
			!(state.match.winner === null || team(state.match.winner)) ||
			!(
				state.match.endedTick === null ||
				(tick(state.match.endedTick) && state.match.endedTick <= state.t)
			) ||
			!!state.match.winner !== (state.match.endedTick !== null) ||
			!tick(state.match.nextWave) ||
			!tick(state.match.nextBall)
		)
			return 'Invalid lane match clock'
		for (const side of ['A', 'B']) {
			const t = state.teams?.[side]
			if (
				!t ||
				!finite(t.xp) ||
				t.xp < 0 ||
				!tick(t.level) ||
				t.level < tune.hero.level ||
				t.level > tune.levels.cap
			)
				return `Invalid team ${side} XP or level`
		}
		for (const key of ['minions', 'structures', 'globes']) {
			if (!Array.isArray(state[key]) || state[key].length > tune.proof.trace)
				return `Invalid ${key} population`
			const seen = new Set()
			for (const u of state[key]) {
				if (!u || seen.has(u.id) || !team(u.team)) return `Invalid ${key} identity`
				seen.add(u.id)
				if (key === 'globes') {
					if (!tick(u.id) || !point(u.pos) || !tick(u.expires)) return 'Invalid globe'
				} else {
					if (!health(u) || !attack(u.attack) || !tick(u.attackTick))
						return `Invalid ${key} combat state`
					if (key === 'structures') {
						const known = structures.get(u.id)
						if (
							!known ||
							u.team !== known.team ||
							u.kind !== known.kind ||
							typeof u.vulnerable !== 'boolean' ||
							!tick(u.silentUntil)
						)
							return 'Invalid structure'
					} else if (
						typeof u.id !== 'string' ||
						!u.id.startsWith('minion-') ||
						!Object.hasOwn(tune.minions, u.kind) ||
						!point(u.pos) ||
						!finite(u.yaw) ||
						(minions.has(u.id) &&
							(minions.get(u.id).kind !== u.kind || minions.get(u.id).team !== u.team))
					)
						return 'Invalid minion'
				}
			}
			if (key === 'structures' && seen.size !== structures.size) return 'Missing structure'
		}
		const b = state.ball
		if (
			b !== null &&
			(!b ||
				!tick(b.id) ||
				!point(b.pos) ||
				!['warning', 'loose', 'channel', 'carried', 'flying'].includes(b.state) ||
				!tick(b.popAt) ||
				!tick(b.pickableAt) ||
				(b.team != null && !team(b.team)) ||
				(b.carrier != null && !simulation.heroes.some((h) => h.id === b.carrier)) ||
				(b.state === 'carried' && b.carrier == null) ||
				(b.state === 'warning' && (!tick(b.spawnAt) || !tick(b.warnAt))) ||
				(b.state === 'channel' &&
					(!b.channel ||
						!simulation.heroes.some((h) => h.id === b.channel.hero) ||
						!tick(b.channel.startTick) ||
						!tick(b.channel.endTick))) ||
				(b.state === 'flying' &&
					(!b.shot ||
						!point(b.shot.pos) ||
						!point(b.shot.dir) ||
						!tick(b.releaseTick) ||
						!point(b.releasePos))))
		)
			return 'Invalid Ball'
		if (
			!state.matchStats ||
			typeof state.matchStats !== 'object' ||
			Array.isArray(state.matchStats)
		)
			return 'Missing recap ledger'
		for (const h of state.heroes) {
			if (
				!tick(h.level) ||
				h.level !== state.teams[h.team].level ||
				!(h.respawnTick === null || tick(h.respawnTick))
			)
				return 'Invalid hero level or respawn clock'
			const row = state.matchStats[h.id]
			if (!row || row.heroId !== h.heroId || row.team !== h.team)
				return 'Missing or mismatched hero recap'
		}
		for (const row of Object.values(state.matchStats)) {
			if (
				!row ||
				!team(row.team) ||
				!HEROES[row.heroId]?.playable ||
				typeof row.bot !== 'boolean' ||
				!['kills', 'deaths', 'heroDamage', 'structureDamage', 'xp'].every(
					(key) => finite(row[key]) && row[key] >= 0,
				) ||
				!tick(row.kills) ||
				!tick(row.deaths) ||
				!recapHits(row.recent) ||
				(row.death &&
					(!tick(row.death.tick) ||
						row.death.tick > state.t ||
						!(row.death.source === null || typeof row.death.source === 'string') ||
						!recapHits(row.death.hits)))
			)
				return 'Invalid recap ledger'
		}
		return null
	}
	function pose(unit, a, b, blend, changed) {
		const body = unit.body
		const wasDead = unit.dead
		if (changed) Object.assign(unit, structuredClone(a))
		if (a.pos) {
			const p = b?.pos ?? a.pos
			body.position.x = lerp(a.pos.x, p.x, blend)
			body.position.z = lerp(a.pos.z, p.z, blend)
			unit.yaw =
				a.yaw + (b ? Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)) * blend : 0)
			body.face(unit.yaw)
		}
		if (a.attack) {
			unit.attack.left =
				b?.attack &&
				b.attack.phase === a.attack.phase &&
				b.attack.total === a.attack.total &&
				b.attackTick === a.attackTick
					? lerp(a.attack.left, b.attack.left, blend)
					: Math.max(0, a.attack.left - (laneTick - unitSampleTick))
		}
		if (a.dead && !wasDead) {
			body.retire()
			const index = simulation.obstacles.findIndex((o) => o.id === a.id)
			if (index >= 0) simulation.obstacles.splice(index, 1)
		}
		body.mesh.position.copy(body.position)
		body.mesh.quaternion.copy(body.pose.quaternion)
	}
	let unitSampleTick = 0
	let previousSample = null
	let followingSample = null
	let followingMinions = new Map()
	let followingStructures = new Map()
	const replica = createUnitReplica(simulation, scene, {
		validateState,
		applySample({ before, after, blend }, sim) {
			laneTick = sim.tick
			unitSampleTick = before.t
			const changed = before !== previousSample
			if (changed) {
				previousSample = before
				nextWave = before.match.nextWave
				nextBall = before.match.nextBall
				Object.assign(lane.match, before.match)
				for (const side of ['A', 'B']) Object.assign(lane.teams[side], before.teams[side])
				lane.globes.splice(0, lane.globes.length, ...structuredClone(before.globes))
				sim.matchStats = structuredClone(before.matchStats)
				ball = structuredClone(before.ball)
				const live = new Set(before.minions.map((u) => u.id))
				for (const [id, u] of minions)
					if (!live.has(id)) {
						u.body.dispose()
						minions.delete(id)
					}
			}
			if (after !== followingSample) {
				followingSample = after
				followingMinions = new Map(after.minions.map((u) => [u.id, u]))
				followingStructures = new Map(after.structures.map((u) => [u.id, u]))
			}
			for (const a of before.minions) {
				let unit = minions.get(a.id)
				if (!unit) {
					unit = {
						body: simulation.laneView.makeBody(a.pos.x, a.pos.z, a.team, a.kind),
						dead: false,
					}
					minions.set(a.id, unit)
				}
				pose(unit, a, followingMinions.get(a.id), blend, changed)
			}
			if (changed) lane.minions.splice(0, lane.minions.length, ...minions.values())
			for (const a of before.structures)
				pose(structures.get(a.id), a, followingStructures.get(a.id), blend, changed)
			const b = after.ball
			if (ball) {
				const continuous =
					b && ball.id === b.id && ball.state === b.state && ball.carrier === b.carrier
				const target = continuous ? b.pos : before.ball.pos
				ball.pos.x = lerp(before.ball.pos.x, target.x, blend)
				ball.pos.z = lerp(before.ball.pos.z, target.z, blend)
			}
		},
	})
	const apply = replica.apply
	replica.apply = (state, nowSeconds) => {
		if (state?.projection === true) {
			state = { ...state }
			for (const [key, fields] of Object.entries(columns)) {
				if (!Array.isArray(state[key])) continue
				state[key] = state[key].map((row) => {
					if (
						key === 'heroes' &&
						Array.isArray(row) &&
						row.length >= fields.indexOf('respawnTick') &&
						row.length <= fields.length
					)
						row = fields.map((_, index) => row[index] ?? null)
					const unit = unpack(row, fields)
					if (!unit) return null
					if (key === 'heroes') {
						for (const [field, value] of Object.entries(heroDefaults))
							if (unit[field] === null) unit[field] = value
						if (unit.slow === null) unit.slow = { until: 0, factor: 1 }
						if (unit.abilityState === null)
							unit.abilityState = freshAbilityState(HEROES[unit.heroId])
						for (const field of ['cd', 'cancelUntil'])
							if (unit[field] === null)
								unit[field] =
									simulation.heroes.find((h) => h.id === unit.id)?.[field].map(() => 0) ?? null
					}
					for (const field of coordinateFields[key] ?? []) {
						const value = unit[field]
						unit[field] =
							Array.isArray(value) && value.length === 2 ? { x: value[0], z: value[1] } : null
					}
					if (key === 'minions') {
						if (!tick(unit.id)) return null
						unit.id = `minion-${unit.id}`
					}
					return unit
				})
			}
			if (Array.isArray(state.matchStats)) {
				const rows = state.matchStats
				if (
					rows.every(
						(row) =>
							Array.isArray(row) &&
							typeof row[0] === 'string' &&
							row.length === recapColumns.length + 1,
					) &&
					new Set(rows.map((row) => row[0])).size === rows.length
				) {
					state.matchStats = Object.fromEntries(
						rows.map(([id, ...values]) => {
							const row = unpack(values, recapColumns)
							if (Array.isArray(row.recent))
								row.recent = row.recent.map((hit) => unpack(hit, hitColumns))
							if (row.death !== null) {
								row.death = unpack(row.death, ['source', 'tick', 'hits'])
								if (!row.death) return [id, null]
								if (Array.isArray(row.death.hits))
									row.death.hits = row.death.hits.map((hit) => unpack(hit, hitColumns))
							}
							return [id, row]
						}),
					)
				}
			}
		}
		return apply(state, nowSeconds)
	}
	replica.sim.lane = lane
	replica.sim.ball = ballReplica
	replica.sim.snapshot = () => ({
		...simulation.snapshot(),
		t: replica.sim.tick,
		match: { ...lane.match, nextWave, nextBall },
		ball: structuredClone(ball),
		matchStats: structuredClone(replica.sim.matchStats),
	})
	return replica
}
