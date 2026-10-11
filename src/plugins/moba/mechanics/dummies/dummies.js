import { tune } from '../../tune.js'
import { STEP } from '../../../../core/app.js'

// The lobby's practice dummies; `view.dress` (dummies/view.js) dresses their bodies.
export default {
	population: 'dummies',
	create: ({ posts, makeBody, view }) =>
		posts.map((post, i) => ({
			id: `dummy${i + 1}`,
			team: 'B',
			post,
			dress: view.dress,
			body: makeBody(post.x, post.z, 'B', undefined, view.dress),
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
