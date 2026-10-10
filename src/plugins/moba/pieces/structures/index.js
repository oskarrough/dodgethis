import { lane } from '../lane.js'
import { tune } from '../../tune.js'

export default {
	lane,
	stats: true,
	structures: true,
	obstacles: (layout) =>
		layout.structures
			.filter((s) => s.obstacle !== false)
			.map(({ id, kind, x, z }) => ({ id, kind, x, z, r: tune[kind].radius })),
}
