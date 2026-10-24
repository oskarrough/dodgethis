import { tune } from '../../tune.js'
import { createBossPull } from '../../mechanics/dungeon/dungeon-warden.js'

// A Warden atop the stair, for now, that the boons change: `bless` takes every boon the party
// carries and sets how hard Gnomon hits and how much it takes. Its shadow comes later.
export function createGnomon(args) {
	const { spot } = args
	const encounter = {
		id: 'gnomon',
		name: 'Gnomon',
		spawn: { x: spot.x, z: spot.z },
		hp: tune.encounters.gnomon.hp,
	}
	const pull = createBossPull({ ...args, encounter })
	return {
		...pull,
		units: [pull.unit],
		won: () => pull.unit.dead && pull.state.phase === 'ended',
		bless(boons) {
			const effects = boons.map((boon) => tune.encounters.gnomon.boons[boon.id] ?? {})
			encounter.damage = effects.reduce((product, e) => product * (e.damage ?? 1), 1)
			pull.unit.damageTaken = effects.reduce((product, e) => product * (e.taken ?? 1), 1)
		},
	}
}
