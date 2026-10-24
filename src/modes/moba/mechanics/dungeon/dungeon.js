import { createDungeon } from './dungeon-run.js'
import { dungeonBots } from './dungeon-bots.js'

// A dungeon run: the map's encounters, its waystones, the stair and the run's end.
export default {
	population: 'boss',
	create: createDungeon,
	botHabit: dungeonBots,
}
