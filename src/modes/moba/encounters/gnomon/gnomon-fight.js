import { STEP } from '../../../../core/app.js'
import { tune } from '../../tune.js'
import { createBossPull } from '../../mechanics/dungeon/dungeon-warden.js'

const ticks = (s) => Math.max(1, Math.round(s / STEP))

// A Warden atop the stair with two clocks. Its shadow (`state.shadow`: foot, `dir`, `length`,
// `lands`) is aimed at each living hero in turn by id, and lands on all it covers. Its life is
// sampled every second (`history`), and at each rewind it takes back the most it had `back` s
// before. `bless` folds every boon the party carries into `blessing`, which the clocks read.
export function createGnomon(args) {
	const { heroes, spot, systems } = args
	const g = () => tune.encounters.gnomon
	const encounter = {
		id: 'gnomon',
		name: 'Gnomon',
		spawn: { x: spot.x, z: spot.z },
		hp: g().hp,
		damage: g().damage,
	}
	const pull = createBossPull({ ...args, encounter })
	const { unit, state } = pull
	let blessing = { taken: 1, damage: 1, length: 1, back: 1 }
	const fresh = () => ({ shadow: null, hour: 0, nextShadow: null, nextRewind: null, rewound: 0 })
	Object.assign(state, fresh())
	const history = []
	const living = () => heroes.filter((h) => !h.dead).sort((a, b) => a.id.localeCompare(b.id))
	const length = () => g().shadow.length * blessing.length
	const back = () => g().rewind.back * blessing.back
	function cast(t) {
		const aim = living()[state.hour++ % living().length]
		if (!aim) return
		const q = unit.body.position,
			p = aim.body.position
		const d = Math.hypot(p.x - q.x, p.z - q.z) || 1
		state.shadow = {
			x: q.x,
			z: q.z,
			dir: { x: (p.x - q.x) / d, z: (p.z - q.z) / d },
			length: length(),
			width: g().shadow.width,
			warned: t,
			lands: t + ticks(g().shadow.warning),
			landed: false,
		}
	}
	function land() {
		const s = state.shadow
		s.landed = true
		for (const h of living()) {
			const p = h.body.position
			const along = (p.x - s.x) * s.dir.x + (p.z - s.z) * s.dir.z
			const across = Math.abs((p.x - s.x) * s.dir.z - (p.z - s.z) * s.dir.x)
			if (along < -h.body.radius || along > s.length + h.body.radius) continue
			if (across > g().shadow.width / 2 + h.body.radius) continue
			systems().hit(
				{
					id: -1,
					owner: encounter.id,
					team: 'B',
					slot: 'shadow',
					damage: g().shadow.damage * blessing.damage,
					dx: s.dir.z,
					dz: -s.dir.x,
				},
				{ id: h.id, unit: h, hero: true },
				p,
			)
			if (!h.dead)
				systems().apply(h, 'core.stun', { source: encounter.id, duration: g().shadow.hold })
		}
	}
	function rewind(t) {
		const then = [...history].reverse().find((sample) => sample.t <= t - ticks(back()))
		if (then && then.hp > unit.hp) {
			state.rewound = then.hp - unit.hp
			unit.hp = then.hp
		}
		history.length = 0
	}
	function step(t, dt) {
		pull.step(t, dt)
		unit.damageTaken = blessing.taken
		if (state.phase !== 'engaged') {
			Object.assign(state, fresh())
			history.length = 0
			return
		}
		if (!history.length || t - history.at(-1).t >= ticks(1)) history.push({ t, hp: unit.hp })
		state.nextShadow ??= t + ticks(g().shadow.every)
		state.nextRewind ??= t + ticks(g().rewind.every)
		if (t >= state.nextShadow - ticks(g().shadow.warning) && !state.shadow) cast(t)
		if (state.shadow && !state.shadow.landed && t >= state.shadow.lands) land()
		if (state.shadow?.landed && t >= state.shadow.lands + ticks(g().shadow.linger)) {
			state.shadow = null
			state.nextShadow = t + ticks(g().shadow.every - g().shadow.linger)
		}
		if (t >= state.nextRewind) {
			rewind(t)
			state.nextRewind = t + ticks(g().rewind.every)
		}
	}
	return {
		...pull,
		spot,
		units: [unit],
		step,
		won: () => unit.dead && state.phase === 'ended',
		bless(boons) {
			const effects = boons.map((boon) => g().boons[boon.id] ?? {})
			blessing = Object.fromEntries(
				['taken', 'damage', 'length', 'back'].map((key) => [
					key,
					effects.reduce((product, e) => product * (e[key] ?? 1), 1),
				]),
			)
			encounter.damage = g().damage * blessing.damage
		},
		// The view's reading: how long the shadow falls now, and when the hour next turns back.
		get blessing() {
			return blessing
		},
		// What bots see: the shadow on its way, if one is warned.
		botView: () => ({ shadow: state.shadow && !state.shadow.landed ? { ...state.shadow } : null }),
	}
}
