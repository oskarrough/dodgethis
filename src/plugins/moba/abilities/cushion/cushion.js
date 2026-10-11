import { tune } from '../../tune.js'

// W: a short wall across your aim at the cursor. Bank banks off it; shots and bodies treat it as cover.
export default {
	kind: 'instant',
	placesCover: true,
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="tone" d="M10 30 L38 30 L38 36 L10 36 Z"/><path class="ink-line" d="M14 10 L24 28 L34 10"/><circle class="gold" cx="34" cy="10" r="4"/></svg>',
	tell: 'circle',
	held: 'circle',
	effects: { cast: 'vault' },
	watch({ hero, sim, tick }) {
		for (const o of sim.obstacles.filter((o) => o.kind === 'cushion' && o.owner === hero.id))
			if (o.until <= tick) sim.removeCover(o)
	},
	onRelease({ hero, sim, tick, ticks, ability, dir, target }) {
		const { length, post, duration } = ability.stats
		const count = Math.max(2, Math.ceil(length / (post * 1.5)) + 1)
		for (let i = 0; i < count; i++) {
			const along = (i / (count - 1) - 0.5) * length
			const x = target.x - dir.z * along,
				z = target.z + dir.x * along
			// Never wall a hero in.
			if (
				sim.heroes.some(
					(h) =>
						!h.dead &&
						Math.hypot(h.body.position.x - x, h.body.position.z - z) < post + h.body.radius,
				)
			)
				continue
			sim.addCover({
				id: `cushion-${hero.id}-${tick}-${i}`,
				kind: 'cushion',
				owner: hero.id,
				x,
				z,
				r: post,
				until: tick + ticks(duration),
			})
		}
	},
	card: {
		summary: () =>
			'Place a short wall at the cursor. Bank bounces off it; it blocks shots and bodies.',
		notes: () => [`${tune.cushion.length}m wide, lasts ${tune.cushion.duration}s`],
	},
}
