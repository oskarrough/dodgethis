import { STEP } from '../../../../core/app.js'
import { tune } from '../../tune.js'
import { createBossPull } from '../../mechanics/dungeon/dungeon-warden.js'
import { distance } from '../../../../core/spatial.js'

const ticks = (s) => Math.max(1, Math.round(s / STEP))

// A Warden in a hot hall. While it is pulled, a shade walks the hall's length (`shadeAt`) and
// every hero in the hall outside it bakes: Heat stacks up (`heat`, by hero id), each stack burns,
// and a full load stuns. In the shade the stacks cool away. A wipe or reset clears the Heat.
export function createFornax(args) {
	const { heroes, spot, systems } = args
	const g = () => tune.encounters.fornax
	const encounter = {
		id: 'fornax',
		name: 'Fornax',
		spawn: { x: spot.x, z: spot.z },
		hp: g().hp,
		damage: g().damage,
	}
	const pull = createBossPull({ ...args, encounter })
	const state = pull.state
	const heat = {}
	const next = {}
	function shadeAt(t) {
		const swing = Math.sin((2 * Math.PI * t * STEP) / g().shade.period)
		return { x: spot.x + g().shade.span * swing, z: spot.z, radius: g().shade.radius }
	}
	const shaded = (h, shade) => distance(h.body.position, shade) <= shade.radius
	function bake(t) {
		const shade = shadeAt(t)
		for (const h of heroes) {
			if (h.dead || distance(h.body.position, spot) > g().hall) {
				heat[h.id] = 0
				continue
			}
			next[h.id] ??= t + ticks(g().heat.every)
			if (t < next[h.id]) continue
			if (shaded(h, shade)) {
				heat[h.id] = Math.max(0, (heat[h.id] ?? 0) - 1)
				next[h.id] = t + ticks(g().heat.cool)
				continue
			}
			heat[h.id] = (heat[h.id] ?? 0) + 1
			next[h.id] = t + ticks(g().heat.every)
			burn(h, heat[h.id] * g().heat.burn)
			if (h.dead || heat[h.id] < g().heat.bake) continue
			systems().apply(h, 'core.stun', { source: encounter.id, duration: g().heat.baked })
			heat[h.id] = 0
		}
	}
	function burn(h, damage) {
		systems().hit(
			{ id: -1, owner: encounter.id, team: 'B', slot: 'heat', damage, dx: 0, dz: 0 },
			{ id: h.id, unit: h, hero: true },
			h.body.position,
		)
	}
	function cool() {
		for (const id of Object.keys(heat)) delete heat[id]
		for (const id of Object.keys(next)) delete next[id]
	}
	function step(t, dt) {
		pull.step(t, dt)
		state.shade = shadeAt(t)
		if (state.phase === 'engaged') bake(t)
		else cool()
	}
	return {
		...pull,
		spot,
		heat,
		units: [pull.unit],
		step,
		won: () => pull.unit.dead && state.phase === 'ended',
		// What bots see: where the shade stands now and how much Heat each hero holds.
		botView: () => ({
			phase: state.phase,
			shade: state.shade ?? shadeAt(0),
			heat: { ...heat },
		}),
	}
}
