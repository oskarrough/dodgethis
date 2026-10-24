import { STEP } from '../../../../core/app.js'

export default {
	kind: 'stance',
	effects: { cast: true, pose: 'stagger' },
	statuses: {
		bank: {
			label: 'Stagger',
			tags: ['pending'],
			bar: 'pending',
			data: () => ({ source: null, left: 0, ended: null }),
			interval: STEP,
			on: {
				damage({ hero, status, ability: stanceAbility, event, tick }) {
					const { shot, target, damage } = event
					if (target !== hero || shot.periodic) return
					if (hero.stance?.ability !== stanceAbility.id || hero.stance.until <= tick) return
					status.amount += damage
					const { owner, team, ability, slot, dx, dz } = shot
					status.data.source = { owner, team, ability, slot, dx, dz }
					event.damage = 0
				},
				tick({ hero, status, sim, tick }) {
					const state = status.data
					if (state.left <= 0 || tick === state.ended) return
					const damage = status.amount / state.left
					status.amount = Math.max(0, status.amount - damage)
					if (damage > 0 && state.source)
						sim.hit(
							{
								...state.source,
								damage,
								periodic: true,
								unmodified: true,
								ambient: true,
								traitProcs: false,
								noHelp: true,
								status: status.key,
							},
							{ id: hero.id, unit: hero, hero: true },
							hero.body.position,
						)
					if (--state.left === 0) {
						status.amount = 0
						state.source = null
					}
				},
			},
		},
	},
	card: {
		sentence: `For {duration}, damage you take is banked as [[Stagger]] and repaid afterwards; a [[Shield]] soaks the repayment.`,
	},
	onStart({ hero, sim }) {
		// A second stance can bank into a still-paying pool, exactly as before.
		const bank = sim.apply(hero, 'stagger.bank', { source: hero.id })
		bank.amount ??= 0
	},
	onEnd({ hero, tick, ticks, ability, reason }) {
		if (reason || hero.dead) return
		const bank = hero.statuses.find((status) => status.key === 'stagger.bank')
		if (!bank) return
		bank.data.left = ticks(ability.stats.payout)
		bank.data.ended = tick
		bank.until = tick + bank.data.left + 1
	},
}
