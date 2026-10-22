import { absorbAura } from '../../aura-damage.js'
import { cancelAttack } from '../../sim-kit.js'

const endSwig = ({ hero, ability, ticks, slot }) => {
	hero.cd[Number(slot.slice(-1)) - 1] = ticks(ability.stats.cooldown)
}
export default {
	kind: 'channel',
	root: true,
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
		summary: () =>
			'Root and drink, gaining shield. Orders, casts and disables interrupt the drink.',
	},
	onStart({ hero, present }) {
		hero.order = null
		cancelAttack(hero, present, 'swig')
	},
	onTick({ hero, sim, tick, ticks, ability, dt }) {
		const amount = ability.stats.shieldPerSecond * dt
		const shield = hero.statuses.find(
			(status) => status.key === 'swig.shield' && status.src === hero.id && status.until > tick,
		)
		if (shield) {
			shield.amount += amount
			shield.until = tick + ticks(ability.stats.shieldLife)
		} else
			sim.apply(hero, 'swig.shield', {
				source: hero.id,
				amount,
				duration: ability.stats.shieldLife,
			})
		hero.cd[2] = ticks(ability.stats.cooldown)
	},
	onRelease: endSwig,
	onCancel: endSwig,
}
