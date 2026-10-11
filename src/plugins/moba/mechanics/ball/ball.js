import { createBall } from '../../ball.js'
import { ballBots } from '../../ball-bots.js'

export default {
	population: 'ball',
	create: createBall,
	botHabit: ballBots,
	stats: true,
}
