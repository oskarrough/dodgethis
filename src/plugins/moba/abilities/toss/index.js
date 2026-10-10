import { tune } from '../../tune.js'

// Q: a line skillshot; with a caught shot in the pocket, casting throws that back instead.
export default {
	kind: 'shot',
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="tone" d="M6 34 Q6 22 16 22 L24 22 Q28 22 28 27 Q28 31 24 31 L18 31 L18 36 Q18 42 12 42 Q6 42 6 34 Z"/><circle class="gold" cx="35" cy="14" r="7"/><path class="ink-line" d="M27 22 L31 19"/></svg>',
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
