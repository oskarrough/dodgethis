import { tune } from '../../tune.js'
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
export default {
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="tone" d="M6 16 H32 V9 L43 20 L32 31 V24 H6 Z"/><path class="cream" d="M42 34 H16 V27 L5 38 L16 47 V42 H42 Z"/></svg>',
	name: 'Tag out',
	kind: 'instant',
	bot: {
		priority: 30,
		act(ctx, slot) {
			const { h, p, own, enemies, cast, frame } = ctx
			const b = tune.tagOut.bot
			const danger = (at) => enemies.filter((e) => distance(e.pos, at) <= b.dangerRange).length
			const ally = own
				.filter(
					(u) =>
						u.id !== h.id &&
						u.hp / u.maxHp < b.saveHp &&
						distance(p, u.pos) <= tune.tagOut.range &&
						danger(u.pos) > danger(p) &&
						h.hp / h.maxHp >= b.saveHp &&
						ctx.safe(
							u.pos,
							enemies.filter((e) => distance(e.pos, u.pos) <= b.dangerRange),
						),
				)
				.sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp || a.id.localeCompare(c.id))[0]
			if (ally && cast(slot, ally.pos)) return frame
			return null
		},
	},
	tell: 'tether',
	held: 'circle',
	effects: { cast: 'tagOutWindup', impact: 'tagOutSwap', pose: 'coachTag' },
	statuses: {
		guard: {
			label: 'Tag out',
			tags: ['buff'],
			duration: ({ stats }) => stats.duration,
			on: {
				amplify({ unit, event }) {
					if (unit === event.target) event.factor *= 1 - tune.tagOut.damageReduction
				},
			},
		},
	},
	ready({ hero, sim }) {
		return sim.heroes.some(
			(u) =>
				u.id !== hero.id &&
				u.team === hero.team &&
				!u.dead &&
				distance(hero.body.position, u.body.position) <= tune.tagOut.range,
		)
	},
	stages: {
		release: [
			{
				deliver: 'target',
				pick: 'nearestAim',
				targets: 'ally',
				range: 'range',
				hit: ['cleanse'],
				// The position swap stays code, before the ally's cleanse and our guard.
				before({ hero, sim, event }) {
					const ally = event.target
					event.from = { ...hero.body.position }
					event.to = { ...ally.body.position }
					for (const unit of [hero, ally]) {
						unit.body.cancelDash()
						unit.dashAbility = null
						unit.shove = null
						sim.cleanse(unit, 'motion')
						unit.order = null
					}
					hero.body.place(event.to.x, event.to.y, event.to.z)
					ally.body.place(event.from.x, event.from.y, event.from.z)
				},
				after({ hero, sim, ability, event, present }) {
					sim.apply(hero, 'tagOut.guard')
					present({
						type: 'contact',
						part: 'impact',
						source: hero.id,
						target: event.target.id,
						ability: ability.id,
						point: { ...event.to },
						from: event.from,
					})
				},
			},
		],
	},
	card: {
		summary: `Swap with the ally nearest your aim within {range}. Cleanse them; take {damageReduction} less damage for {duration}.`,
	},
}
