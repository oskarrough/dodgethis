import { STEP } from '../../../../core/app.js'
import { tune } from '../../tune.js'
import { createBossPull } from '../../mechanics/dungeon/dungeon-warden.js'
import { distance } from '../../../../core/spatial.js'

const ticks = (s) => Math.max(1, Math.round(s / STEP))

// Two Warden pulls, Botijo the jug and Tinaja the jar, each with its own threat. Pulling one pulls both.
// Kinship sets each twin's `damageTaken` while they stand close. When one falls the other goes to
// the wheel (`wheel`): it stands still and strikes no one for `revive` s, then its kin rises whole,
// unless it falls first. A wipe resets both. Won when both lie dead.
export function createTinajaBotijo(args) {
	const { heroes, spot, systems } = args
	const g = () => tune.encounters.tinajaBotijo
	const twin = (id, name, side) =>
		createBossPull({
			...args,
			encounter: {
				id,
				name,
				spawn: { x: spot.x, z: spot.z + side * g().apart },
				hp: g().hp,
				damage: g().damage,
			},
		})
	const twins = [twin('botijo', 'Botijo', -1), twin('tinaja', 'Tinaja', 1)]
	const state = { phase: 'idle', revives: null, wheel: null, reviveTick: null, kin: false }
	const alive = (pull) => !pull.unit.dead
	const living = () => heroes.filter((h) => !h.dead)
	function wake(t) {
		const awake = twins.find((pull) => pull.state.phase === 'engaged')
		if (!awake) return
		for (const pull of twins) {
			if (pull.state.phase !== 'idle') continue
			const target = living().sort(
				(a, b) =>
					distance(a.body.position, pull.unit.body.position) -
						distance(b.body.position, pull.unit.body.position) || a.id.localeCompare(b.id),
			)[0]
			pull.engage(target, t)
		}
	}
	function rise(pull, t) {
		systems().respawn(pull.unit)
		Object.assign(pull.state, {
			phase: 'engaged',
			resetTick: null,
			nextSwing: t,
			nextSlam: t + ticks(tune.warden.firstSlam),
		})
	}
	function step(t, dt) {
		// The twin at the wheel neither moves nor strikes until its kin is up or every hero is down.
		// A fallen twin always steps, so its pull reaches 'ended'.
		for (const pull of twins)
			if (
				!alive(pull)
					? pull.state.phase !== 'ended'
					: pull.unit.id !== state.wheel || !living().length
			)
				pull.step(t, dt)
		wake(t)
		const [a, b] = twins
		state.kin =
			alive(a) && alive(b) && distance(a.unit.body.position, b.unit.body.position) <= g().kinship
		for (const pull of twins) pull.unit.damageTaken = state.kin ? g().shared : 1
		const fallen = twins.find((pull) => !alive(pull))
		const standing = twins.find(alive)
		if (fallen && standing) {
			// The survivor's own wipe (or reset) puts its twin back too.
			if (standing.state.phase === 'idle') {
				fallen.reset()
				Object.assign(state, { revives: null, wheel: null, reviveTick: null })
			} else if (standing.state.phase === 'engaged') {
				if (!state.revives) {
					state.revives = fallen.unit.id
					state.wheel = standing.unit.id
					state.reviveTick = t + ticks(g().revive)
					systems().endCast(standing.unit, 'revive')
				}
				if (t >= state.reviveTick) {
					rise(fallen, t)
					Object.assign(state, { revives: null, wheel: null, reviveTick: null })
				}
			}
		} else Object.assign(state, { revives: null, wheel: null, reviveTick: null })
		state.phase = twins.some((pull) => pull.state.phase === 'engaged')
			? 'engaged'
			: twins.every((pull) => !alive(pull))
				? 'ended'
				: 'idle'
	}
	return {
		spot,
		state,
		twins,
		units: twins.map((pull) => pull.unit),
		// The twin to strike: the weaker one standing, which after a fall is the one at the wheel.
		get unit() {
			const standing = twins.filter(alive)
			if (!standing.length) return twins[0].unit
			return standing.sort((x, y) => x.unit.hp - y.unit.hp || x.unit.id.localeCompare(y.unit.id))[0]
				.unit
		},
		step,
		won: () => twins.every((pull) => !alive(pull)),
		addThreat(source, damage, unit) {
			twins.find((pull) => pull.unit === unit)?.addThreat(source, damage)
		},
		addHealingThreat(source, amount) {
			for (const pull of twins) pull.addHealingThreat(source, amount)
		},
	}
}
