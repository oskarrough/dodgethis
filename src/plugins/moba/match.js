import { createLane } from './lane.js'
import { laneBots } from './lane-bots.js'
import { createLaneView } from './lane-view.js'
import { projectLaneSnapshot } from './lane-replica.js'
import { createBall } from './ball.js'
import { ballBots } from './ball-bots.js'
import { createBallView } from './ball-view.js'
import { createFlag } from './flag.js'
import { flagBots } from './flag-bots.js'
import { createFlagView } from './flag-view.js'
import { createBots } from './bots.js'
import { createCamps } from './camps.js'
import { campBots } from './camp-bots.js'
import { createOnboarding } from './onboarding.js'
import { dressDummy } from './dummy-view.js'
import { tune } from './tune.js'
import { STEP } from '../../core/app.js'

// Structures and minions share one lane population, but opt into its rules separately.
const lane = {
	create: createLane,
	view: createLaneView,
	snapshot: projectLaneSnapshot,
	botHabit: laneBots,
}
export const structures = {
	lane,
	stats: true,
	structures: true,
	onboarding: createOnboarding,
	obstacles: (layout) =>
		layout.structures
			.filter((s) => s.obstacle !== false)
			.map(({ id, kind, x, z }) => ({ id, kind, x, z, r: tune[kind].radius })),
}
export const minions = { lane, stats: true, waves: true }
export const ball = {
	population: 'ball',
	create: createBall,
	view: createBallView,
	botHabit: ballBots,
	stats: true,
}
export const camps = { camps: createCamps, botHabit: campBots }
// Flagfall's centre flag: one ring both teams fight over on a fixed clock.
export const flag = {
	population: 'flag',
	create: createFlag,
	view: createFlagView,
	botHabit: flagBots,
	minimap: (sim) => sim.flag && { ...sim.flag.state, live: sim.flag.state.phase === 'up' },
}
export const bots = { controllers: createBots, stats: true }
export const dummies = {
	population: 'dummies',
	create: ({ posts, makeBody }) =>
		posts.map((post, i) => ({
			id: `dummy${i + 1}`,
			team: 'B',
			post,
			dress: dressDummy,
			body: makeBody(post.x, post.z, 'B', undefined, dressDummy),
			yaw: 0,
			dir: i % 2 ? 1 : -1, // Walk away from the neighbouring post first, so a pair never starts pressed together.
			flipIn: tune.dummies.flipMax,
			hp: tune.dummies.hp,
			maxHp: tune.dummies.hp,
			cast: null,
			castTick: Math.max(0, Math.round(tune.dummies.castEvery / STEP)),
			sparring: i === 0,
			dead: false,
			corpse: null,
			respawnTick: null,
			slow: { until: 0, factor: 1 },
		})),
}
