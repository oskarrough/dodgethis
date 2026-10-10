import { tune } from '../../tune.js'

// Q: a line skillshot, first hit.
export default {
	kind: 'shot',
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
