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
		summary: 'Root and drink, gaining shield. Orders, casts and disables interrupt the drink.',
	},
	onTick({ hero, sim, ability, dt, tick, ticks }) {
		const stats = ability.stats
		const amount = stats.shieldPerSecond * dt
		const shield = hero.statuses.find(
			(status) =>
				status.key === 'swig.shield' &&
				status.src === hero.id &&
				(status.until === null || status.until > tick),
		)
		if (shield) {
			shield.amount += amount
			shield.until = tick + ticks(stats.shieldLife)
		} else sim.apply(hero, 'swig.shield', { source: hero, amount, duration: stats.shieldLife })
	},
}
