import { tune } from '../../tune.js'
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

// E: Pong's ricochet with bodies for walls. One hard serve at the enemy nearest the aim,
// and the ball pings on through whoever stands closest, softer each time.
export default {
	name: 'Pinball',
	kind: 'instant',
	tell: 'tether',
	held: 'circle',
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle class="tone" cx="9" cy="38" r="5"/><circle class="tone" cx="24" cy="12" r="5"/><circle class="tone" cx="40" cy="34" r="5"/><path class="ink-line" d="M9 38 L24 12 L40 34"/><circle class="gold" cx="32" cy="23" r="4"/></svg>',
	effects: { cast: true, impact: true, pose: 'draw' },
	// Serve at the closest enemy hero in reach; the chain finds the rest.
	bot: {
		priority: 12,
		act(ctx, slot) {
			const { p, enemies, cast, frame } = ctx
			const mark = enemies
				.filter((e) => distance(p, e.pos) <= tune.pinball.range)
				.sort((a, b) => distance(p, a.pos) - distance(p, b.pos) || a.id.localeCompare(b.id))[0]
			if (mark && cast(slot, mark.pos)) return frame
			return null
		},
	},
	card: {
		sentence: `Serves the enemy nearest your aim within {range} for {damage:damage}; the ball jumps on to {jumps} more within {jumpRange}, each hit {falloff} softer.`,
	},
	stages: {
		release: [
			{
				deliver: 'target',
				pick: 'nearestAim',
				targets: 'enemy',
				range: 'range',
				hit: ['damage'],
				chain: { range: 'jumpRange', repeat: 'jumps', falloff: 'falloff' },
			},
		],
	},
}
