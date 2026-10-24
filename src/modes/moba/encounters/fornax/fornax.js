import { createFornax } from './fornax-fight.js'
import { fornaxBotGoal } from './fornax-bots.js'

// Fornax, the oven of the shade wing's long hall. Only the shade of an awning that walks the hall
// is cool; everywhere else the heat builds on you until you are baked solid. Fight it from the
// shade, and bring the fight with you as the shade moves. Win it and the party carries its boon
// to Gnomon.
export default {
	name: 'Fornax',
	create: createFornax,
	botGoal: fornaxBotGoal,
	boon: {
		id: 'bizcocho',
		name: 'Bizcocho',
		line: 'Gnomon’s blows land softer',
	},
}
