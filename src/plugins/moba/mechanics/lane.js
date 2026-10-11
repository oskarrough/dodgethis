import { createLane } from '../lane.js'
import { laneBots } from '../lane-bots.js'

// Structures and minions share one lane population, but opt into its rules separately.
// The sim draws it with lane-view.js and projects its wire snapshot with lane-replica.js.
export const lane = {
	create: createLane,
	botHabit: laneBots,
}
