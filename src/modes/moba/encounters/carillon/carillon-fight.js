import { STEP } from '../../../../core/app.js'
import { tune } from '../../tune.js'
import { createBossPull } from '../../mechanics/dungeon/dungeon-warden.js'
import { distance } from '../../../../core/spatial.js'

const ticks = (s) => Math.max(1, Math.round(s / STEP))

// A Warden in a bronze bell (`damageTaken` is `shut` until a toll cracks it). While it is pulled
// it tolls on a clock: `toll` is the ring warned round the bell, landing at `toll.lands`; after
// it lands the bell lies open until `openUntil`. A wipe or reset closes the bell and stops the clock.
export function createCarillon(args) {
	const { heroes, spot, systems } = args
	const g = () => tune.encounters.carillon
	const encounter = {
		id: 'carillon',
		name: 'Carillon',
		spawn: { x: spot.x, z: spot.z },
		hp: g().hp,
		damage: g().damage,
	}
	const pull = createBossPull({ ...args, encounter })
	const { unit, state } = pull
	Object.assign(state, { toll: null, nextToll: null, openUntil: 0 })
	const living = () => heroes.filter((h) => !h.dead)
	function land(t) {
		const { toll } = state
		state.toll = null
		state.openUntil = t + ticks(g().open)
		for (const h of living()) {
			if (distance(h.body.position, toll) > g().toll.radius) continue
			const p = h.body.position
			const d = distance(p, toll) || 1
			systems().hit(
				{
					id: -1,
					owner: encounter.id,
					team: 'B',
					slot: 'toll',
					damage: g().toll.damage,
					dx: (p.x - toll.x) / d,
					dz: (p.z - toll.z) / d,
				},
				{ id: h.id, unit: h, hero: true },
				p,
			)
			if (!h.dead)
				systems().apply(h, 'core.stun', { source: encounter.id, duration: g().toll.stun })
		}
	}
	function step(t, dt) {
		pull.step(t, dt)
		if (state.phase !== 'engaged') {
			Object.assign(state, { toll: null, nextToll: null, openUntil: 0 })
			unit.damageTaken = g().shut
			return
		}
		state.nextToll ??= t + ticks(g().every)
		if (!state.toll && t >= state.nextToll - ticks(g().toll.warning)) {
			const p = unit.body.position
			state.toll = { x: p.x, z: p.z, lands: state.nextToll }
		}
		if (state.toll && t >= state.toll.lands) {
			land(t)
			state.nextToll = t + ticks(g().every)
		}
		unit.damageTaken = t < state.openUntil ? g().cracked : g().shut
	}
	return {
		...pull,
		spot,
		units: [unit],
		step,
		won: () => unit.dead && state.phase === 'ended',
		// What bots see: the toll on its way, if one is warned.
		botView: () => ({ toll: state.toll && { ...state.toll } }),
	}
}
