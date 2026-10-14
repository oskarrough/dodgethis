import { tune } from '../../tune.js'
import { balloonHeal, balloonSoak } from '../balloon/balloon-water.js'
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

export default {
	name: 'Sprinkler',
	kind: 'instant',
	tell: 'circle',
	held: 'circle',
	icon: '<svg viewBox="0 0 48 48"><path class="tone" d="M18 42 V18 H30 V42 Z"/><path class="ink-line" d="M5 15 Q24 0 43 15 M10 22 Q24 10 38 22"/></svg>',
	effects: { cast: true, impact: true, hit: true, pose: 'sprinkler' },
	summon: {
		hp: (stats) => stats.hp,
		radius: (stats) => stats.bodyRadius,
		lifetime: (stats) => stats.duration,
		state: () => ({ touched: {} }),
		validData: (data) =>
			data.touched &&
			typeof data.touched === 'object' &&
			Object.values(data.touched).every(Number.isFinite),
		think({ unit, owner, sim, tick, ticks, stats, present }) {
			const elapsed = tick - unit.from
			const period = Math.max(1, ticks(stats.sweep))
			const angle = ((elapsed % period) / period) * Math.PI * 2
			const width = (Math.PI * 2) / period
			const targets = [
				...sim.heroes
					.filter((h) => !h.dead && h.team === owner.team)
					.map((u) => ({
						unit: u,
						x: u.body.position.x,
						z: u.body.position.z,
						radius: u.body.radius,
					})),
				...sim.enemiesOf(owner.team),
			]
			for (const target of targets) {
				if (
					tick - (unit.data.touched[target.unit.id] ?? -Infinity) < period ||
					distance(target, unit.body.position) > stats.radius + target.radius
				)
					continue
				const dx = target.x - unit.body.position.x,
					dz = target.z - unit.body.position.z
				const gap = Math.atan2(
					Math.sin(Math.atan2(dz, dx) - angle),
					Math.cos(Math.atan2(dz, dx) - angle),
				)
				const reach = Math.hypot(dx, dz)
				if (
					reach > target.radius &&
					Math.abs(gap) > width + Math.asin(Math.min(1, target.radius / reach))
				)
					continue
				unit.data.touched[target.unit.id] = tick
				if (target.unit.team === owner.team)
					balloonHeal(owner, target.unit, stats.healAmount, 'sprinkler', present, true)
				else balloonSoak(sim, owner, target.unit)
			}
		},
	},
	onRelease({ hero, sim, target, present }) {
		sim.summon(hero, 'sprinkler', target)
		present({
			type: 'impact',
			hero: hero.id,
			ability: 'sprinkler',
			hit: false,
			point: { ...target, y: 0 },
		})
	},
	bot: {
		priority: 25,
		act({ p, own, enemies, cast, frame }, slot) {
			const stats = tune.sprinkler
			const ally = own
				.filter(
					(u) =>
						distance(p, u.pos) <= stats.range &&
						u.maxHp - u.hp >= stats.healAmount * stats.bot.deficit &&
						enemies.some((e) => distance(e.pos, u.pos) <= stats.radius + stats.bot.danger),
				)
				.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id.localeCompare(b.id))[0]
			if (ally && cast(slot, ally.pos)) return frame
			const crowd = enemies.filter(
				(u) =>
					distance(p, u.pos) <= stats.range &&
					enemies.filter((e) => distance(e.pos, u.pos) <= stats.radius).length >= stats.bot.crowd,
			)[0]
			if (crowd && cast(slot, crowd.pos)) return frame
			return null
		},
	},
	card: {
		summary: () =>
			`Plant a ${tune.sprinkler.hp} HP sprinkler for ${tune.sprinkler.duration} s. Its ${tune.sprinkler.radius} m jet sweeps each second: heal ${tune.sprinkler.healAmount}, soak enemies. It blocks nothing.`,
	},
}
