import { absorbAura } from '../../aura-damage.js'
export default {
	kind: 'channel',
	root: true,
	cooldownFrom: 'end',
	statuses: {
		shield: {
			label: 'Shield',
			tags: ['shield'],
			on: { absorb: absorbAura },
			bar: 'shield',
		},
	},
	cancelOnMove: true,
	cancelOnCast: true,
	effects: { cast: true, pose: 'swig' },
	card: {
		sentence: `Roots you to drink for up to {duration}, gaining {shieldPerSecond} of [[Shield]]; moving, casting or a [[Stun]] stops the drink.`,
		facts: [['Shield lasts', `{shieldLife}`]],
	},
	onTick({ hero, sim, ability, dt, tick }) {
		const stats = ability.stats
		const amount = stats.shieldPerSecond * dt
		const shield = hero.statuses.find(
			(status) =>
				status.key === 'swig.shield' &&
				status.src === hero.id &&
				(status.until === null || status.until > tick),
		)
		sim.apply(hero, 'swig.shield', {
			source: hero,
			amount: (shield?.amount ?? 0) + amount,
			duration: stats.shieldLife,
		})
	},
}
