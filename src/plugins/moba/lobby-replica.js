import { createBody } from '../../core/body.js'
import { createSnapshotBuffer } from '../../core/snapshot-buffer.js'
import { STEP } from '../../core/app.js'
import { PALETTE } from '../../core/style.js'
import { HEROES, heroDefinition } from './heroes.js'
import { dressHero } from './hero-view.js'
import { tune } from './tune.js'

const finite = Number.isFinite
const point = (p) => p && finite(p.x) && finite(p.z)
const lerp = (a, b, blend) => a + (b - a) * blend
const angle = (a, b, blend) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * blend
const timers = ['cd', 'cancelUntil']
const fields = [
	'heroId',
	'seatTeam',
	'joinOrder',
	'readyWalk',
	'abilityState',
	'hp',
	'maxHp',
	'level',
	'dead',
	'respawnTick',
	'stunUntil',
	'attack',
	'attackTick',
	'order',
	'cast',
	'cancelUntil',
	'slow',
	'freezeUntil',
	'proneUntil',
	'stance',
	'channel',
	'catchWindow',
	'castTick',
	'ballThrow',
]
const sameAction = (a, b) =>
	a &&
	b &&
	a.ability === b.ability &&
	a.slot === b.slot &&
	a.total === b.total &&
	a.phase === b.phase &&
	a.startedTick === b.startedTick

// Keep the sim's ordinary entities, but replace its unstepped physics bodies with the same costumes
// on core replica bodies. Views still read body poses; this buffer owns their render clock.
export function createLobbyReplica(simulation, scene) {
	return createUnitReplica(simulation, scene, { lobby: true })
}

// Shared combat poses and cue timing. Lane populations are added by lane-replica.js, not here.
export function createUnitReplica(
	simulation,
	scene,
	{ lobby = false, validateState = () => null, applySample = () => {} } = {},
) {
	const buffer = createSnapshotBuffer(tune.lobby.replica)
	const listeners = []
	const facts = []
	const visuals = new Map()
	const shots = new Map()
	const stats = { rejected: 0, rejectionReason: null }
	let tick = 0
	let lastAcceptedTick = -1
	const sim = Object.create(simulation, { tick: { get: () => tick } })

	function bodyFor(unit) {
		const definition = unit.definition ?? heroDefinition()
		const p = unit.body.position
		const body = createBody(scene, null, null, {
			profile: definition.base,
			position: [p.x, 0, p.z],
			color: (unit.seatTeam ?? unit.team) === 'A' ? PALETTE.teamA : PALETTE.teamB,
			replica: true,
		})
		const undress = (unit.dress ?? dressHero)(body, definition.id, unit.seatTeam ?? unit.team)
		const dispose = body.dispose
		body.dispose = () => {
			undress()
			dispose()
		}
		return body
	}
	for (const unit of [...sim.heroes, ...sim.dummies]) {
		const body = bodyFor(unit)
		unit.body.dispose()
		unit.body = body
	}

	function valid(state) {
		if (!state || !Number.isSafeInteger(state.t) || state.t < 0 || state.t < lastAcceptedTick)
			return false
		// Validate all plain payload data before mutating any entity or buffer.
		const plain = (value, depth = 0) => {
			if (value == null || typeof value === 'string' || typeof value === 'boolean') return true
			if (typeof value === 'number') return finite(value)
			if (typeof value !== 'object' || depth > tune.lobby.replica.depth) return false
			const values = Object.values(value)
			return values.length <= tune.proof.trace && values.every((v) => plain(v, depth + 1))
		}
		if (!plain(state)) return false
		for (const [key, units] of [
			['heroes', sim.heroes],
			['dummies', sim.dummies],
		]) {
			if (!Array.isArray(state[key]) || state[key].length !== units.length) return false
			const seen = new Set()
			for (const pose of state[key]) {
				const unit = units.find((u) => u.id === pose?.id)
				if (
					!unit ||
					seen.has(pose.id) ||
					typeof pose.dead !== 'boolean' ||
					!finite(pose.yaw) ||
					!finite(pose.hp) ||
					!finite(pose.maxHp) ||
					pose.hp < 0 ||
					pose.maxHp <= 0 ||
					pose.hp > pose.maxHp ||
					(!point(pose.pos) && !(key === 'dummies' && pose.dead && pose.pos === null))
				)
					return false
				if (
					pose.pos &&
					(Math.abs(pose.pos.x) > sim.bounds.halfX || Math.abs(pose.pos.z) > sim.bounds.halfZ)
				)
					return false
				if (
					key === 'heroes' &&
					(pose.team !== unit.team ||
						(lobby &&
							(!['A', 'B'].includes(pose.seatTeam) ||
								!Number.isSafeInteger(pose.joinOrder) ||
								pose.joinOrder < 0 ||
								typeof pose.readyWalk !== 'boolean')) ||
						!HEROES[pose.heroId]?.playable ||
						(!lobby && pose.heroId !== unit.heroId) ||
						!point(pose.vel) ||
						!timers.every(
							(key) =>
								Array.isArray(pose[key]) &&
								pose[key].length === unit[key].length &&
								pose[key].every((value) => finite(value) && value >= 0),
						))
				)
					return false
				if (
					pose.cast &&
					(!finite(pose.cast.left) ||
						!finite(pose.cast.total) ||
						pose.cast.total <= 0 ||
						!point(pose.cast.target) ||
						!finite(pose.cast.yaw))
				)
					return false
				seen.add(pose.id)
			}
		}
		if (
			lobby &&
			(!Array.isArray(state.readySeats) || state.readySeats.length !== sim.readySeats.seats.length)
		)
			return false
		const occupants = new Set()
		for (const [i, seat] of (lobby ? state.readySeats : []).entries()) {
			const box = sim.readySeats.seats[i]
			if (
				seat?.id !== box.id ||
				seat.team !== box.team ||
				seat.x !== box.x ||
				seat.z !== box.z ||
				!['inside', 'full', 'blocked'].every((key) => typeof seat[key] === 'boolean') ||
				!['claimTick', 'enteredAt'].every(
					(key) =>
						seat[key] === null ||
						(Number.isSafeInteger(seat[key]) && seat[key] >= 0 && seat[key] <= state.t),
				)
			)
				return false
			if (seat.occupant) {
				const occupant = seat.occupant
				if (
					typeof occupant.bot !== 'boolean' ||
					(!occupant.bot && !sim.heroes.some((h) => h.id === occupant.id)) ||
					occupants.has(occupant.id) ||
					!HEROES[occupant.heroId]?.playable ||
					!Number.isSafeInteger(occupant.joinOrder) ||
					occupant.joinOrder < 0
				)
					return false
				occupants.add(occupant.id)
			}
		}
		for (const key of ['projectiles', 'zones', 'boards', 'cutouts']) {
			if (!Array.isArray(state[key]) || state[key].length > tune.proof.trace) return false
			const seen = new Set()
			for (const entity of state[key]) {
				if (!entity || !Number.isSafeInteger(entity.id) || entity.id < 0 || seen.has(entity.id))
					return false
				if (
					key === 'projectiles' &&
					(!point(entity.pos) || !point(entity.dir) || !finite(entity.speed) || entity.speed <= 0)
				)
					return false
				if (
					key === 'zones' &&
					(!point(entity.pos) || !finite(entity.left) || !finite(entity.total) || entity.total <= 0)
				)
					return false
				seen.add(entity.id)
			}
		}
		return true
	}

	function apply(state, nowSeconds) {
		const reject = (reason) => {
			stats.rejected++
			stats.rejectionReason = reason
			return false
		}
		if (!buffer.accepts(nowSeconds)) return reject('Snapshot arrival time went backwards')
		let copy
		try {
			copy = structuredClone(state)
		} catch {
			return reject('Snapshot is not cloneable')
		}
		if (!valid(copy)) return reject('Invalid combat snapshot or tick')
		const reason = validateState(copy)
		if (reason) return reject(reason)
		// Index once per packet, never scan populations per pose at render rate.
		for (const key of ['heroes', 'dummies', 'projectiles', 'zones'])
			copy[key] = new Map(copy[key].map((entity) => [entity.id, entity]))
		buffer.push(nowSeconds, copy)
		lastAcceptedTick = copy.t
		stats.rejectionReason = null
		return true
	}

	function poseUnit(unit, a, b, blend, beforeTick) {
		const changedHero = a.heroId && unit.heroId !== a.heroId
		const changedTeam = a.seatTeam && unit.seatTeam !== a.seatTeam
		if (changedHero) unit.definition = heroDefinition(a.heroId)
		if (a.seatTeam) unit.seatTeam = a.seatTeam
		if (changedHero || changedTeam || (unit.dead && !a.dead)) {
			const body = bodyFor(unit)
			unit.corpse?.dispose()
			if (!unit.dead) unit.body.dispose()
			unit.corpse = null
			unit.body = body
		}
		for (const key of fields) if (Object.hasOwn(a, key)) unit[key] = structuredClone(a[key])
		const continuous = b && a.dead === b.dead && a.heroId === b.heroId && a.seatTeam === b.seatTeam
		if (a.pos && !unit.body.retired) {
			const p = continuous && b.pos ? b.pos : a.pos
			unit.body.position.x = lerp(a.pos.x, p.x, blend)
			unit.body.position.z = lerp(a.pos.z, p.z, blend)
			unit.yaw = angle(a.yaw, continuous ? b.yaw : a.yaw, blend)
			unit.body.face({ x: -Math.sin(unit.yaw), z: -Math.cos(unit.yaw) })
			const velocity = a.vel ?? { x: 0, z: 0 }
			unit.body.setVelocity({ ...velocity, y: 0 })
		}
		if (a.dead && !unit.body.retired) {
			for (const part of unit.body.mesh.children)
				if (part !== unit.body.visual) part.visible = false
			unit.body.retire()
			unit.corpse = unit.body
		}
		for (const key of timers)
			if (a[key])
				unit[key] = a[key].map((v, i) =>
					continuous && b[key][i] <= v ? lerp(v, b[key][i], blend) : v,
				)
		for (const key of ['cast', 'attack', 'channel']) {
			if (!a[key]) continue
			unit[key].left =
				continuous && sameAction(a[key], b[key])
					? lerp(a[key].left, b[key].left, blend)
					: Math.max(0, a[key].left - (tick - beforeTick))
		}
	}

	function update(nowSeconds) {
		const sample = buffer.sample(nowSeconds)
		if (!sample) return
		const { before, after, blend } = sample
		tick = lerp(before.t, after.t, blend)
		for (const key of ['heroes', 'dummies'])
			for (const unit of sim[key])
				poseUnit(unit, before[key].get(unit.id), after[key].get(unit.id), blend, before.t)
		for (const [i, seat] of (lobby ? before.readySeats : []).entries())
			Object.assign(sim.readySeats.seats[i], structuredClone(seat))
		const live = new Set()
		for (const [id, a] of before.projectiles) {
			let shot = shots.get(id)
			if (!shot) {
				shot = {}
				shots.set(id, shot)
			}
			Object.assign(shot, a)
			const b = after.projectiles.get(id) ?? a
			shot.x = lerp(a.pos.x, b.pos.x, blend)
			shot.z = lerp(a.pos.z, b.pos.z, blend)
			shot.dx = lerp(a.dir.x, b.dir.x, blend)
			shot.dz = lerp(a.dir.z, b.dir.z, blend)
			live.add(id)
		}
		for (const id of shots.keys()) if (!live.has(id)) shots.delete(id)
		sim.shots.splice(0, sim.shots.length, ...shots.values())
		sim.zones.splice(
			0,
			sim.zones.length,
			...[...before.zones.values()].map((a) => {
				const b = after.zones.get(a.id)
				return {
					...a,
					left: b ? lerp(a.left, b.left, blend) : Math.max(0, a.left - (tick - before.t)),
				}
			}),
		)
		for (const key of ['boards', 'cutouts']) sim[key].splice(0, sim[key].length, ...before[key])
		applySample(sample, sim)
		// Online deduplicates ids. After a hidden-tab stall, expired cues must not replay in a burst.
		const oldestCueTick = before.t - Math.ceil(tune.lobby.replica.delay / STEP) - 1
		while (facts.length && facts[0].tick <= before.t) {
			const fact = facts.shift()
			if (fact.tick < oldestCueTick) continue
			for (const listener of listeners) listener(fact)
		}
		for (const [object, read] of visuals) {
			const pose = read()
			object.position.copy(pose.position)
			object.quaternion.copy(pose.quaternion)
		}
	}

	return {
		sim,
		apply,
		update,
		stats,
		present(fact) {
			facts.push(fact)
			if (facts.length > tune.proof.trace) facts.shift()
		},
		onPresent: (listener) => listeners.push(listener),
		smooth(object, read) {
			visuals.set(object, read)
			return () => visuals.delete(object)
		},
		dispose() {
			buffer.clear()
			facts.length = 0
			listeners.length = 0
			visuals.clear()
			shots.clear()
		},
	}
}
