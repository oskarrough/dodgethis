import { STEP } from '../../../../core/app.js'
import { tune } from '../../tune.js'
import { createBossPull } from '../../mechanics/dungeon/dungeon-warden.js'
import { distance } from '../../../../core/spatial.js'

const ticks = (s) => Math.max(1, Math.round(s / STEP))
const DEG = Math.PI / 180
// The signed turn from angle a to angle b, in (−π, π].
const turnTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a))

// A Warden whose face (`state.facing`, radians from +z toward +x) turns toward its target at a
// fixed rate. Combat asks `damageFrom` how much of each striker's blow lands: from in front only
// `front`, and the throwback is queued (`echoes`) and struck at the striker next step. On a clock
// it stops to polish (`polishUntil`), taking every blow whole, then hates the nearest hero.
export function createEspejo(args) {
	const { heroes, spot, systems } = args
	const g = () => tune.encounters.espejo
	const encounter = {
		id: 'espejo',
		name: 'Espejo',
		spawn: { x: spot.x, z: spot.z },
		hp: g().hp,
		damage: g().damage,
	}
	const pull = createBossPull({ ...args, encounter })
	const { unit, state } = pull
	Object.assign(state, { facing: 0, nextPolish: null, polishUntil: 0 })
	const echoes = []
	const living = () => heroes.filter((h) => !h.dead)
	const polishing = () => systems().t < state.polishUntil
	const inFront = (p) => {
		const q = unit.body.position
		const toward = Math.atan2(p.x - q.x, p.z - q.z)
		return Math.abs(turnTo(state.facing, toward)) <= (g().cone * DEG) / 2
	}
	unit.damageFrom = (source, raw) => {
		if (!source?.body || !heroes.includes(source) || polishing()) return 1
		if (!inFront(source.body.position)) return 1
		echoes.push({ id: source.id, damage: raw * g().back })
		return g().front
	}
	function face(dt) {
		const target = heroes.find((h) => h.id === unit.target && !h.dead)
		if (!target) return
		const p = target.body.position,
			q = unit.body.position
		const want = Math.atan2(p.x - q.x, p.z - q.z)
		const most = g().turn * DEG * dt
		const turn = turnTo(state.facing, want)
		state.facing += Math.max(-most, Math.min(most, turn))
	}
	function echo() {
		for (const { id, damage } of echoes.splice(0)) {
			const h = heroes.find((u) => u.id === id && !u.dead)
			if (!h) continue
			systems().hit(
				{ id: -1, owner: encounter.id, team: 'B', slot: 'mirror', damage, dx: 0, dz: 0 },
				{ id: h.id, unit: h, hero: true },
				h.body.position,
			)
		}
	}
	// Polished, it forgets: the nearest hero is all it hates.
	function forget() {
		const q = unit.body.position
		const nearest = [...living()].sort(
			(a, b) =>
				distance(a.body.position, q) - distance(b.body.position, q) || a.id.localeCompare(b.id),
		)[0]
		unit.threat = nearest ? { [nearest.id]: 1 } : {}
	}
	function step(t, dt) {
		echo()
		if (state.phase !== 'engaged') {
			pull.step(t, dt)
			Object.assign(state, { nextPolish: null, polishUntil: 0 })
			echoes.length = 0
			return
		}
		state.nextPolish ??= t + ticks(g().every)
		if (t >= state.nextPolish) {
			state.polishUntil = t + ticks(g().polish)
			state.nextPolish = state.polishUntil + ticks(g().every)
			systems().endCast(unit, 'polish')
		}
		if (t < state.polishUntil) {
			if (t + 1 >= state.polishUntil) forget()
			// A wipe while it polishes still ends the pull.
			if (!living().length) pull.step(t, dt)
			return
		}
		pull.step(t, dt)
		face(dt)
	}
	return {
		...pull,
		spot,
		units: [unit],
		step,
		won: () => unit.dead && state.phase === 'ended',
		// What bots see: where its face points, whom it hates, and whether it polishes.
		botView: () => ({
			facing: state.facing,
			target: unit.target,
			polishing: polishing(),
		}),
	}
}
