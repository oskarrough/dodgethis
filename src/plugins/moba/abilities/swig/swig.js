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
			stack: 'independent',
			absorb: true,
			bar: 'shield',
		},
	},
	cancelOnMove: true,
	cancelOnCast: true,
	effects: { cast: 'swigStart', pose: 'swig' },
	card: {
		summary: () =>
			'Root and drink, gaining shield. Orders, casts and disables interrupt the drink.',
	},
	onStart({ hero }) {
		hero.order = null
		hero.attack = null
	},
	onTick({ hero, sim, ticks, ability, dt }) {
		sim.apply(hero, 'swig.shield', {
			source: hero.id,
			amount: ability.stats.shieldPerSecond * dt,
			duration: ability.stats.shieldLife,
		})
		hero.cd[2] = ticks(ability.stats.cooldown)
	},
	onRelease: endSwig,
	onCancel: endSwig,
}
