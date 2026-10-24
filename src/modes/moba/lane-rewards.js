import { STEP } from '../../core/app.js'
import { tune } from './tune.js'
import { structureDown } from './lane-structures.js'

const ticks = (s) => Math.max(1, Math.round(s / STEP))
const distance = (a, b) =>
	Math.hypot(a.body.position.x - b.body.position.x, a.body.position.z - b.body.position.z)

// Team XP and levels, kill credit, and the health globes wizards drop.
export function createRewards(shared) {
	const { layout, heroes, teams, globes, present } = shared
	let lastHit = 0
	function addXp(team, amount, point, passive = false, contributions = {}) {
		const state = teams[team]
		state.xp += amount
		present({
			type: 'xp',
			team,
			amount,
			total: state.xp,
			passive,
			contributions,
			point: { ...point },
		})
		let threshold = 0
		for (let level = 1; level < tune.levels.cap; level++) {
			threshold += tune.levels.first + tune.levels.increment * (level - 1)
			if (state.xp < threshold || state.level > level) continue
			state.level = level + 1
			for (const h of heroes.filter((h) => h.team === team)) {
				const previous = h.maxHp
				h.level = state.level
				h.maxHp = (h.definition?.base.hp ?? tune.hero.hp) * (1 + tune.levels.growth * (h.level - 1))
				if (!h.dead) h.hp = Math.min(h.maxHp, h.hp + h.maxHp - previous)
			}
			present({ type: 'levelUp', team, level: state.level, point: { ...point } })
		}
	}
	function reward(unit, killerTeam, t, source) {
		// A last-hit earns siege/takedown credit; minion soak is shared equally
		// by the heroes who earned it. Passive and lane-only kills have no hero credit.
		const killer = heroes.find((hero) => hero.id === source && hero.team === killerTeam)
		const credit = (amount) => (killer ? { [killer.id]: amount } : {})
		unit.killedBy = killerTeam
		unit.killedAt = ++lastHit
		if (unit.structure) {
			structureDown(shared, unit, killerTeam, t, credit)
		} else if (!unit.kind) {
			addXp(
				killerTeam,
				tune.levels.takedown + tune.levels.victimLevel * unit.level,
				unit.body.position,
				false,
				credit(tune.levels.takedown + tune.levels.victimLevel * unit.level),
			)
		} else {
			const soaking = heroes.filter(
				(h) =>
					!h.dead &&
					h.team !== unit.team &&
					(unit.team !== 'N' || h.team === killerTeam) &&
					distance(unit, h) <= tune.waves.soak,
			)
			if (soaking.length) {
				const amount = tune.minions[unit.kind].xp
				addXp(
					unit.team === 'N' ? killerTeam : unit.team === 'A' ? 'B' : 'A',
					amount,
					unit.body.position,
					false,
					Object.fromEntries(soaking.map((h) => [h.id, amount / soaking.length])),
				)
			}
		}
		if (unit.kind === 'wizard') {
			const globe = {
				id: shared.nextSerial(),
				team: killerTeam,
				pos: { x: unit.body.position.x, y: tune.globes.height, z: unit.body.position.z },
				expires: t + ticks(tune.globes.life),
			}
			globes.push(globe)
			present({ type: 'globe', state: 'spawn', team: killerTeam, point: { ...globe.pos } })
		}
	}
	function passiveXp(t) {
		if (t >= ticks(tune.levels.passiveStart) && t % ticks(1) === 0) {
			for (const team of ['A', 'B'])
				addXp(
					team,
					tune.levels.passive,
					{
						x: layout.bases[team].x,
						y: 0,
						z: 0,
					},
					true,
				)
		}
	}
	function stepGlobes(t) {
		for (let i = globes.length - 1; i >= 0; i--) {
			const globe = globes[i]
			const hero = heroes.find(
				(h) =>
					!h.dead &&
					t < globe.expires &&
					h.team === globe.team &&
					Math.hypot(h.body.position.x - globe.pos.x, h.body.position.z - globe.pos.z) <=
						tune.globes.pickup,
			)
			if (hero) {
				const heal = Math.min(hero.maxHp - hero.hp, hero.maxHp * tune.globes.heal)
				hero.hp += heal
				present({
					type: 'globe',
					state: 'pickup',
					target: hero.id,
					team: globe.team,
					heal,
					point: { ...globe.pos },
				})
			}
			if (hero || t >= globe.expires) {
				if (!hero)
					present({ type: 'globe', state: 'expired', team: globe.team, point: { ...globe.pos } })
				globes.splice(i, 1)
			}
		}
	}
	return { addXp, reward, passiveXp, stepGlobes }
}
