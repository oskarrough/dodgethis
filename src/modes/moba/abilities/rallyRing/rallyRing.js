import { tune } from '../../tune.js'
import { distance } from '../../../../core/spatial.js'

// E: Coach chalks a ring on the stone. Her side runs through it; the other side wades.
export default {
	name: 'Rally ring',
	kind: 'instant',
	tell: 'circle',
	held: 'circle',
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle class="tone" cx="24" cy="24" r="19"/><circle class="cream" cx="24" cy="24" r="13"/><path class="ink-line" d="M15 30 L24 16 L33 30 M19 24 H29"/></svg>',
	effects: { cast: true, pose: 'coachRed' },
	// Ring the closest enemy hero when a teammate is already on them: the chase speeds up, the runner slows.
	bot: {
		priority: 18,
		act(ctx, slot) {
			const { h, p, own, enemies, cast, frame } = ctx
			const stats = tune.rallyRing
			const mark = enemies
				.filter((e) => distance(p, e.pos) <= stats.range)
				.filter((e) =>
					own.some(
						(u) => u.id !== h.id && distance(u.pos, e.pos) <= stats.radius * stats.bot.reach,
					),
				)
				.sort((a, b) => distance(p, a.pos) - distance(p, b.pos) || a.id.localeCompare(b.id))[0]
			if (mark && cast(slot, mark.pos)) return frame
			return null
		},
	},
	card: {
		sentence: `Chalks a {radius} ring up to {range} away for {duration}: allies inside get {haste} [[Haste]], enemies inside a {slow} [[Slow]].`,
	},
	stages: {
		release: [
			{
				deliver: 'ground',
				at: 'aim',
				radius: 'radius',
				lifetime: 'duration',
				every: 'pulse',
				allies: [
					{
						effect: 'haste',
						magnitude: 'haste',
						while: 'inside',
						linger: 'linger',
					},
				],
				enemies: [
					{
						effect: 'slow',
						magnitude: 'slow',
						while: 'inside',
						linger: 'linger',
					},
				],
			},
		],
	},
}
