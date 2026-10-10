import { createFlag } from './flag.js'
import { flagBots } from './bots.js'

// Flagfall's centre flag: one ring both teams fight over on a fixed clock.
export default {
	population: 'flag',
	create: createFlag,
	botHabit: flagBots,
	minimap: (sim) => sim.flag && { ...sim.flag.state, live: sim.flag.state.phase === 'up' },
}
