import encounters from '../../encounters/all-encounters.js'
import { createDungeon } from './dungeon-run.js'
import { dungeonBots } from './dungeon-bots.js'

// A dungeon run: the map's encounters, its waystones, the stair and the run's end. An encounter
// may bring posts of its own (a door) that stand until its fight removes them.
export default {
	population: 'dungeon',
	create: createDungeon,
	botHabit: dungeonBots,
	obstacles: (layout) =>
		layout.encounters.flatMap((spot) => encounters[spot.id].obstacles?.(spot) ?? []),
}
