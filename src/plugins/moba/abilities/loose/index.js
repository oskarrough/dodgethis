import { tune } from '../../tune.js'

// Q: a line skillshot, first hit.
export default {
	kind: 'shot',
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="ink-line" d="M10 38 L36 12"/><path class="gold" d="M30 9 L40 8 L39 18 Z"/><path class="tone" d="M9 33 L15 39 L11 43 L5 37 Z"/></svg>',
	pierce: false,
	heal: false,
	bounce: false,
	catchable: true,
	aimAssist: true,
	tell: 'line',
	held: 'line',
	effects: { cast: 'nock', projectile: 'loose', hit: 'looseHit', pose: 'draw' },
	card: {
		notes: () => [
			`Momentum: hero hits cut Vault's cooldown by ${Number(tune.momentum.reduction.toFixed(2))} s`,
		],
	},
}
