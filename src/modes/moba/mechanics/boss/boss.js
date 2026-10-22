import { createBossPull } from './boss-pull.js'
import { bossBots } from './boss-bots.js'

export default {
	population: 'boss',
	create: createBossPull,
	botHabit: bossBots,
}
