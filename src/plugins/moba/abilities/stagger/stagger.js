export default {
	kind: 'stance',
	defersDamage: true,
	effects: { cast: 'staggerStart', pose: 'stagger' },
	state: () => ({ pool: 0, payments: [], left: 0, ended: null }),
	card: {
		summary: () =>
			'Bank incoming damage, then repay it evenly after the stance ends. Shields absorb repayments.',
	},
	deferDamage({ hero, shot, damage }) {
		const state = hero.abilityState.stagger
		state.pool += damage
		state.payments.push({
			shot: { ...shot, deferred: true, traitProcs: false, slow: null },
			amount: damage,
		})
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
		for (const payment of state.payments) {
			const damage = payment.amount / state.left
			payment.amount -= damage
			state.pool = Math.max(0, state.pool - damage)
			sim.hit(
				{ ...payment.shot, damage },
				{ id: hero.id, unit: hero, hero: true },
				hero.body.position,
			)
			if (hero.dead) return
		}
		if (--state.left === 0) {
			state.pool = 0
			state.payments = []
		}
	},
}
