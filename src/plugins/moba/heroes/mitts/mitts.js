import { tune } from '../../tune.js'

const n = (v) => Number(v.toFixed(2))

export default {
	kit: { slot1: 'toss', slot2: 'catch', slot3: 'dive' },
	basic: 'gloveSlap',
	name: 'Mitts',
	order: 2,
	color: 'red',
	silhouette: 'square',
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect class="tone" x="9" y="13" width="30" height="27" rx="8"/><path class="cream" d="M30 9 Q34 6 37 9 L38 18 L31 19 Z M37 22 Q42 20 44 24 L40 31 L36 28 Z"/><circle class="cream" cx="18" cy="24" r="4"/></svg>',
	returnPose: 'toss',
	trait: () => ({
		name: 'Pocket',
		icon: 'pocket',
		chip: `${n(tune.catching.pocketLife)}s`,
		summary: `Hold a caught shot for ${n(tune.catching.pocketLife)} s, then send it back with Toss.`,
	}),
	traits: {
		onDeath({ hero }) {
			hero.body.cancelDash()
			hero.dashAbility = null
		},
	},
}
