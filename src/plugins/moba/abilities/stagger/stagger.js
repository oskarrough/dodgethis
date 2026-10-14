export default {
	kind: 'stance',
	defersDamage: true,
	effects: { cast: 'staggerStart', pose: 'stagger' },
	state: () => ({ pool: 0, source: null, left: 0, ended: null }),
	card: {
		summary: () =>
			'Bank incoming damage, then repay it evenly after the stance ends. Shields absorb repayments.',
	},
	deferDamage({ hero, shot, damage }) {
		const state = hero.abilityState.stagger
		state.pool += damage
		const { owner, team, ability, slot, dx, dz } = shot
		state.source = { owner, team, ability, slot, dx, dz }
	},
	onEnd({ hero, tick, ticks, ability, reason }) {
		if (reason || hero.dead) return
		const state = hero.abilityState.stagger
		state.left = ticks(ability.stats.payout)
		state.ended = tick
	},
	watch({ hero, sim, tick }) {
		const state = hero.abilityState.stagger
		if (hero.dead || state.left <= 0 || tick === state.ended) return
		const damage = state.pool / state.left
		state.pool = Math.max(0, state.pool - damage)
		if (damage > 0 && state.source)
			sim.hit(
				{ ...state.source, damage, deferred: true, traitProcs: false, noHelp: true },
				{ id: hero.id, unit: hero, hero: true },
				hero.body.position,
			)
		if (--state.left === 0) {
			state.pool = 0
			state.source = null
		}
	},
}
