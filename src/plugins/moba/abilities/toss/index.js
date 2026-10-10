import { tune } from '../../tune.js'

// Q: a line skillshot; with a caught shot in the pocket, casting throws that back instead.
export default {
	kind: 'shot',
	pierce: false,
	heal: false,
	bounce: false,
	catchable: true,
	returnsPocket: true,
	aimAssist: true,
	tell: 'line',
	held: 'line',
	effects: { cast: 'tossWindup', projectile: 'toss', hit: 'tossHit', pose: 'toss' },
	card: {
		summary: () =>
			'Line skillshot. With a caught shot in your pocket, Toss sends that back instead.',
		notes: () => [`Pocketed shots last ${Number(tune.catching.pocketLife.toFixed(2))} s`],
	},
}
