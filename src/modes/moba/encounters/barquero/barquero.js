import { createBarquero } from './barquero-fight.js'
import { barqueroBotGoal } from './barquero-bots.js'

// Barquero, the boatman at the shade wing's end, waits at his ferry for Tara, the clay idol, and
// will not take it across until it is brought to him. Tara rolls only while someone walks beside
// it, and the hounds of the dunes come for whoever does. So one pushes while the rest keep the
// hounds off; a lone hero pushes, turns to fight, and pushes again. Win it and the party carries
// Tara to Gnomon.
export default {
	name: 'Barquero',
	create: createBarquero,
	botGoal: barqueroBotGoal,
	boon: {
		id: 'tara',
		name: 'Tara',
		line: 'Gnomon guards itself less',
	},
}
