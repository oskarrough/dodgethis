import { createBall } from './ball-objective.js'
import { ballBots } from './ball-bots.js'

export default {
	// Keywords this folder's cards may name with [[Term]] (glossary.js).
	terms: { silence: ['Silence', 'A structure hit by the Ball stops shooting for {ball.silence}.'] },
	population: 'ball',
	create: createBall,
	botHabit: ballBots,
	stats: true,
}
