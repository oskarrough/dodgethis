import { tune } from '../../tune.js'
import { menderTargetUnit, menderReleaseTarget } from '../mend/mend-target.js'

export default {
	name: 'Ward',
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="tone" d="M24 5 L41 12 V25 Q41 37 24 44 Q7 37 7 25 V12 Z"/><path class="cream" d="M22 14 H26 V33 H22 Z"/></svg>',
	kind: 'instant',
	bot: false,
	tell: 'circle',
	held: 'circle',
	effects: { cast: true, impact: true, pose: 'menderWard' },
	targetUnit: menderTargetUnit,
	statuses: {
		shield: {
			label: 'Ward',
			tags: ['buff', 'shield'],
			absorb: true,
			bar: 'shield',
			duration: ({ stats }) => stats.duration,
		},
	},
	onRelease(context) {
		const ally = menderReleaseTarget(context)
		if (!ally) return
		const { hero, sim, ability, present } = context
		sim.apply(ally, 'ward.shield', {
			source: hero.id,
			amount: ability.stats.shield,
		})
		present({
			type: 'contact',
			part: 'impact',
			source: hero.id,
			target: ally.id,
			ability: ability.id,
			point: { ...ally.body.position },
		})
	},
	card: {
		summary: () =>
			`Shield the ally nearest your aim within ${tune.ward.range} m for ${tune.ward.shield} damage for ${tune.ward.duration} s.`,
	},
}
