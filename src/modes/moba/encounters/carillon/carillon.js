import { createCarillon } from './carillon-fight.js'
import { carillonBotThreats } from './carillon-bots.js'

// Carillon, the sun wing's belfry come alive: a Warden asleep in a great bronze bell, which turns
// most blows aside. Each time it tolls, a ring of sound rolls out round it; stand outside the ring,
// then rush in while the bronze lies cracked and strike hard. Win it and the party carries its
// boon to Gnomon.
export default {
	name: 'Carillon',
	create: createCarillon,
	botThreats: carillonBotThreats,
	boon: {
		id: 'lupa',
		name: 'Lupa',
		line: 'Gnomon takes more from every blow',
	},
}
