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
			damageTaken: () => 1 - tune.tagOut.damageReduction,
		},
	},
	targetUnit({ hero, sim, target, ability }) {
		return (
			sim.heroes
				.filter(
					(u) =>
						u.id !== hero.id &&
						u.team === hero.team &&
						!u.dead &&
						distance(hero.body.position, u.body.position) <= ability.stats.range,
				)
				.sort(
					(a, b) =>
						distance(a.body.position, target) - distance(b.body.position, target) ||
						a.id.localeCompare(b.id),
				)[0] ?? null
		)
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
	onRelease({ hero, sim, ability, targetId, present }) {
		const ally = sim.heroes.find((u) => u.id === targetId)
		if (
			!ally ||
			ally.dead ||
			distance(hero.body.position, ally.body.position) > ability.stats.range
		) {
			present({ type: 'denied', hero: hero.id, slot: 'slot2', reason: 'targetLost' })
			return
		}
		const from = { ...hero.body.position },
			to = { ...ally.body.position }
		for (const u of [hero, ally]) {
			u.body.cancelDash()
			u.dashAbility = null
			u.shove = null
			sim.cleanse(u, 'motion')
			u.order = null
		}
		hero.body.place(to.x, to.y, to.z)
		ally.body.place(from.x, from.y, from.z)
		sim.cleanse(ally, 'stun')
		sim.cleanse(ally, 'freeze')
		sim.cleanse(ally, 'slow')
		sim.apply(hero, 'tagOut.guard')
		present({
			type: 'contact',
			part: 'impact',
			source: hero.id,
			target: ally.id,
			ability: ability.id,
			point: { ...to },
			from,
		})
	},
	card: {
		summary: () =>
			`Swap with the ally nearest your aim within ${tune.tagOut.range} m. Cleanse them; take ${tune.tagOut.damageReduction * 100}% less damage for ${tune.tagOut.duration} s.`,
	},
}
