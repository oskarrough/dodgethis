import { tune } from '../../tune.js'
import { createManos } from './manos-fight.js'
import { handsBotGoal, handsBotThreats } from './manos-bots.js'

// Manos, the mesa gate. Three great clay hands rise from the sand, and the gate opens only while all
// three are lit at once. The first light wakes the Tiestos in the walls, who lob shards at
// anyone who stands still. Three heroes may hold a hand each; a lone hero must run the circuit.
export default {
	name: 'Manos',
	create: createManos,
	// The door's posts, laid with the map's ground so paths and bodies treat them as walls.
	obstacles: (spot) =>
		tune.encounters.manos.door.posts.map((z, i) => ({
			id: `manos-door-${i + 1}`,
			kind: 'door',
			x: spot.x + tune.encounters.manos.door.x,
			z: spot.z + z,
			r: tune.encounters.manos.door.radius,
			height: tune.encounters.manos.door.height,
		})),
	botGoal: handsBotGoal,
	botThreats: handsBotThreats,
}
