const endSwig = ({ hero, ability, ticks, slot }) => {
	hero.cd[Number(slot.slice(-1)) - 1] = ticks(ability.stats.cooldown)
}
export default {
	kind: 'channel',
	root: true,
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
	onTick({ hero, tick, ticks, ability, dt }) {
		hero.shields ??= []
		hero.shields.push({
			amount: ability.stats.shieldPerSecond * dt,
			until: tick + ticks(ability.stats.shieldLife),
		})
		hero.cd[2] = ticks(ability.stats.cooldown)
	},
	onRelease: endSwig,
	onCancel: endSwig,
}
