import { tune } from '../../tune.js'
import { balloonPop } from './balloon-water.js'
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

export default {
	name: 'Balloon',
	kind: 'instant',
	tell: 'circle',
	held: 'circle',
	icon: '<svg viewBox="0 0 48 48"><circle class="tone" cx="24" cy="20" r="16"/><path class="cream" d="M20 35 L28 35 L24 42 Z"/><path class="ink-line" d="M24 42 V48"/></svg>',
	effects: { cast: true, impact: true, hit: true, pose: 'balloon' },
	statuses: {
		soak: {
			label: 'Soak',
			tags: ['debuff', 'slow'],
			moveSpeed: ({ stats }) => Math.max(0, Math.min(1, 1 - stats.slow)),
			duration: ({ stats }) => stats.duration,
		},
	},
	stages: {
		land: [
			{
				deliver: 'ground',
				radius: 'radius',
				lifetime: 'puddle',
				every: 'interval',
				enemies: [{ effect: 'status', key: 'soak' }],
			},
		],
	},
	summon: {
		lifetime: (stats) => stats.flight + stats.puddle,
		state: () => ({ phase: 'flight' }),
		validData: (data) =>
			['flight', 'puddle'].includes(data.phase) &&
			[data.start, data.target].every((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z)),
		brain(ctx) {
			const { unit, tick, ticks, stats } = ctx
			if (unit.data.phase === 'flight') {
				const fraction = Math.min(1, (tick - unit.from) / Math.max(1, ticks(stats.flight)))
				const { start, target } = unit.data
				unit.body.position.x = start.x + (target.x - start.x) * fraction
				unit.body.position.z = start.z + (target.z - start.z) * fraction
				if (fraction >= 1 || (unit.data.popAt != null && tick >= unit.data.popAt)) balloonPop(ctx)
			}
		},
	},
	onRelease({ hero, sim, target, slot }) {
		const unit = sim.summon(hero, 'balloon', hero.body.position)
		Object.assign(unit.data, { start: { ...hero.body.position }, target: { ...target }, slot })
	},
	// The casting engine dispatches recasts before cooldown/busy gates, without resetting the clock.
	onRecast({ hero, sim, tick, ticks, ability }) {
		const unit = sim.summons.find(
			(u) => u.owner === hero.id && u.key === ability.id && u.data.phase === 'flight',
		)
		if (!unit) return false
		unit.data.popAt = Math.max(
			tick + ticks(ability.stats.popTell),
			unit.from + ticks(ability.stats.minFlight),
		)
		return true
	},
	bot: {
		priority: 20,
		act({ p, own, enemies, cast, frame }, slot) {
			const stats = tune.balloon
			const hurt = own
				.filter(
					(u) =>
						u.maxHp - u.hp >= stats.healAmount * stats.bot.deficit &&
						distance(p, u.pos) <= stats.range,
				)
				.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id.localeCompare(b.id))[0]
			if (hurt && cast(slot, hurt.pos)) return frame
			const enemy = enemies
				.filter((u) => distance(p, u.pos) <= stats.range)
				.sort((a, b) => distance(p, a.pos) - distance(p, b.pos) || a.id.localeCompare(b.id))[0]
			const savingHeal = own.some(
				(u) => distance(p, u.pos) <= stats.range && u.hp / u.maxHp < stats.bot.healReserveHp,
			)
			if (enemy && (!savingHeal || enemy.hp / enemy.maxHp <= stats.bot.finishHp)) {
				const aim = {
					x: enemy.pos.x + enemy.vel.x * stats.flight,
					z: enemy.pos.z + enemy.vel.z * stats.flight,
				}
				if (cast(slot, distance(p, aim) <= stats.range ? aim : enemy.pos)) return frame
			}
			return null
		},
	},
	card: {
		summary: `Lob for {flight}: heal {healAmount}, deal {damage} and soak. Press again to pop early. A {puddle} puddle keeps soaking.`,
	},
}
