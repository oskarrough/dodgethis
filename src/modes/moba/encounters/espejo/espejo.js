import { createEspejo } from './espejo-fight.js'
import { espejoBotGoal } from './espejo-bots.js'

// Espejo, at the sun wing's end: a glazier with a mirror for a face. Strike it from the front and
// your blow is thrown back at you; it turns slowly toward whoever it hates most. So one holds it
// looking away while the rest work at its back. Now and then it stops to polish its face and
// forgets every grudge, and the nearest hero must take it up. Win it and the party carries its
// boon to Gnomon.
export default {
	name: 'Espejo',
	create: createEspejo,
	botGoal: espejoBotGoal,
	boon: {
		id: 'azogue',
		name: 'Azogue',
		line: 'Gnomon’s shadow falls short',
	},
}
