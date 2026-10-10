import { tune } from '../../tune.js'

// Q: a line skillshot, first hit. It banks off cover and map edges (bounce is in the tune).
export default {
	kind: 'shot',
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="ink-line" d="M8 38 L24 10 L40 38"/><circle class="gold" cx="24" cy="10" r="5"/><path class="tone" d="M4 42 L44 42 L44 45 L4 45 Z"/></svg>',
	pierce: false,
	heal: false,
	catchable: true,
	aimAssist: true,
	tell: 'line',
	held: 'line',
	effects: { cast: 'nock', projectile: 'loose', hit: 'looseHit', pose: 'draw' },
	card: {
		summary: () => 'A shot that bounces off cover and walls, hitting harder with every cushion.',
		notes: () => [
			`Up to ${tune.bank.bounce.max} cushions, +${tune.bank.bounce.damagePerCushion} damage each`,
		],
	},
}
