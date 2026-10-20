import { tune } from '../../tune.js'
import { menderTargetUnit, menderReleaseTarget } from './mend-target.js'

export default {
	name: 'Mend',
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="tone" d="M18 6 H30 V18 H42 V30 H30 V42 H18 V30 H6 V18 H18 Z"/></svg>',
	kind: 'instant',
	castColor: '#1fae4a',
	bot: false,
	tell: 'circle',
	held: 'circle',
	effects: { cast: true, impact: true, pose: 'menderMend' },
	targetUnit: menderTargetUnit,
	onRelease(context) {
		const ally = menderReleaseTarget(context)
		if (!ally) return
		const { hero, sim, ability, present } = context
		const { healAmount, critChance, critMultiplier } = ability.stats
		sim.heal(hero, ally, healAmount, ability.id, { critChance, critMultiplier })
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
			`Cast for ${tune.mend.castPoint} s to heal the ally nearest your aim within ${tune.mend.range} m for ${tune.mend.healAmount}. ${tune.mend.critChance * 100}% chance to heal ×${tune.mend.critMultiplier}.`,
	},
}
