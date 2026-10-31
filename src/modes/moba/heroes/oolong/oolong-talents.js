import { foesNear, scaled, shove, slotOf, statusOn, strike } from '../../talent-kit.js'

// Oolong's tree (talents.js): row n opens at level 2 + n. Numbers in oolong-tune.js under `talents`.
const palm = (event, hero) =>
	event.source === hero && event.shot?.slot === 'primary' && !event.shot.talent
const kick = (event, hero) => event.source === hero && event.shot?.ability === 'flyingKick'
const svg = (body) => `<svg viewBox="0 0 48 48" aria-hidden="true">${body}</svg>`
const bankOf = (hero) =>
	hero.statuses.find((status) => status.key === 'stagger.bank' && !status.removed)
const staggering = (hero, tick) => hero.stance?.ability === 'stagger' && hero.stance.until > tick

export default {
	// What a bot takes in each row: the blows that reach a crowd, and the stance that holds a Warden.
	bot: [1, 2, 1, 2, 0, 1],
	rows: [
		// Level 2: the palm.
		[
			{
				id: 'teaHands',
				name: 'Tea Hands',
				icon: svg(
					'<path class="tone" d="M14 40 V18 Q14 10 20 10 H30 Q36 10 36 18 V40 Z"/><path class="ink-line" d="M20 6 Q24 2 28 6"/>',
				),
				text: 'Every Palm Strike that lands pours {fraction} of its blow back into Oolong as health. A monk who fights well need not stop for tea.',
				on: {
					hit({ hero, sim, event, numbers }) {
						if (palm(event, hero) && event.damage > 0)
							sim.heal(hero, hero, event.damage * numbers.fraction, event.shot.ability)
					},
				},
			},
			{
				id: 'twoHands',
				name: 'Two Hands',
				icon: svg(
					'<path class="ink-line" d="M8 34 Q24 10 40 34"/><circle class="tone" cx="12" cy="36" r="6"/><circle class="tone" cx="36" cy="36" r="6"/>',
				),
				text: 'Palm Strike sweeps rather than jabs. Every other foe within {radius} of the one you strike takes {fraction} of the blow.',
				on: {
					hit({ hero, sim, event, numbers }) {
						if (!palm(event, hero) || !(event.damage > 0)) return
						const at = event.target.body.position
						for (const foe of foesNear(sim, hero, at, numbers.radius))
							if (foe.unit !== event.target)
								strike(sim, hero, foe, {
									ability: event.shot.ability,
									slot: 'primary',
									damage: event.damage * numbers.fraction,
									from: at,
									talent: true,
								})
					},
				},
			},
			{
				id: 'openPalm',
				name: 'Open Palm',
				icon: svg(
					'<path class="tone" d="M10 30 V16 H16 V28 M16 14 H22 V28 M22 14 H28 V28 M28 18 H34 V34 Q34 42 26 42 H18 Q10 42 10 30 Z"/><path class="ink-line" d="M38 22 H46 M38 30 H46"/>',
				),
				text: 'One Palm Strike in {every} lands open-handed and shoves the foe {distance} away, out of the fight for a breath.',
				on: {
					hit({ hero, sim, event, numbers, state }) {
						if (!palm(event, hero) || event.lethal) return
						state.count = ((state.count ?? 0) + 1) % numbers.every
						if (state.count === 0)
							shove(sim, event.target, hero.body.position, numbers.distance, numbers.time)
					},
				},
			},
		],
		// Level 3: the kick.
		[
			{
				id: 'longKick',
				name: 'Long Kick',
				icon: svg(
					'<path class="ink-line" d="M4 30 H34"/><path class="tone" d="M30 22 L44 30 L30 38 Z"/><path class="ink-line" d="M6 22 H14 M6 38 H14"/>',
				),
				text: 'Oolong takes a longer run-up. Flying Kick reaches {range} farther, but the wind-up takes {castPoint} more.',
				stats: {
					flyingKick: { range: (v, n) => v + n.range, castPoint: (v, n) => v + n.castPoint },
				},
			},
			{
				id: 'rebound',
				name: 'Rebound',
				icon: svg(
					'<path class="ink-line" d="M6 18 H36"/><path class="tone" d="M30 10 L40 18 L30 26 Z"/><path class="ink-line" d="M40 32 H12"/><path class="tone" d="M18 24 L8 32 L18 40 Z"/>',
				),
				text: 'Oolong springs off whatever he kicks. After the blow he bounds {distance} back the way he came, out of reach of the reply.',
				on: {
					hit({ hero, sim, event, numbers }) {
						if (!kick(event, hero)) return
						const p = hero.body.position
						const { dx = 0, dz = 0 } = event.shot
						sim.displace(
							hero,
							{ x: p.x - dx * numbers.distance, z: p.z - dz * numbers.distance },
							numbers.time,
						)
					},
				},
			},
			{
				id: 'crackedPot',
				name: 'Cracked Pot',
				icon: svg(
					'<path class="tone" d="M12 16 H36 L32 42 H16 Z"/><path class="ink-line" d="M22 16 L26 26 L20 32 L24 42"/>',
				),
				text: 'A Flying Kick that fells its foe is ready again at once. In a pack of small things this makes for a great deal of kicking.',
				on: {
					hit({ hero, event }) {
						if (kick(event, hero) && event.lethal) hero.cd[slotOf(hero, 'flyingKick')] = 0
					},
				},
			},
		],
		// Level 4: the stance.
		[
			{
				id: 'slowBrew',
				name: 'Slow Brew',
				icon: svg(
					'<circle class="cream" cx="24" cy="26" r="16"/><path class="ink-line" d="M24 26 V14 M24 26 L32 30"/>',
				),
				text: 'Oolong takes his time over the bill. [[Stagger]] repays what it banked over {payout} more, which leaves room for a drink in between.',
				stats: { stagger: { payout: (v, n) => v + n.payout } },
			},
			{
				id: 'spill',
				name: 'Spill',
				icon: svg(
					'<path class="tone" d="M10 10 H30 L26 30 H14 Z" transform="rotate(30 20 20)"/><ellipse class="cream" cx="30" cy="40" rx="14" ry="5"/>',
				),
				text: 'When the stance ends, {fraction} of what [[Stagger]] banked spills over: every foe within {radius} takes it, and Oolong owes that much less.',
				after: {
					stagger: {
						onEnd({ hero, sim, reason, numbers }) {
							const bank = bankOf(hero)
							if (reason || hero.dead || !(bank?.amount > 0)) return
							const spilled = bank.amount * numbers.fraction
							bank.amount -= spilled
							for (const foe of foesNear(sim, hero, hero.body.position, numbers.radius))
								strike(sim, hero, foe, { ability: 'stagger', slot: 'slot2', damage: spilled })
						},
					},
				},
			},
			{
				id: 'firmFooting',
				name: 'Firm Footing',
				icon: svg(
					'<path class="tone" d="M8 40 H40 L36 32 H12 Z"/><path class="ink-line" d="M16 30 V12 M32 30 V12"/>',
				),
				text: 'While Oolong holds his stance, whoever strikes him from within {range} is slowed by {slow} for {duration}.',
				on: {
					damaged({ hero, sim, event, numbers, tick }) {
						const source = event.source
						if (event.target !== hero || !source?.body || source.team === hero.team) return
						if (!staggering(hero, tick)) return
						const p = source.body.position
						const q = hero.body.position
						if (Math.hypot(p.x - q.x, p.z - q.z) > numbers.range + source.body.radius) return
						sim.apply(source, 'rain.slow', {
							source: hero.id,
							mag: 1 - numbers.slow,
							duration: numbers.duration,
						})
					},
				},
			},
		],
		// Level 5: the jug.
		[
			{
				id: 'bottomless',
				name: 'Bottomless',
				icon: svg(
					'<path class="tone" d="M16 6 H32 V14 Q42 20 40 34 Q38 44 24 44 Q10 44 8 34 Q6 20 16 14 Z"/><path class="ink-line" d="M16 30 H32"/>',
				),
				text: 'The jug runs deeper than it looks. Swig can be drunk for {duration} longer, but it takes {cooldown} longer to fill again.',
				stats: {
					swig: { duration: (v, n) => v + n.duration, cooldown: (v, n) => v + n.cooldown },
				},
			},
			{
				id: 'walkingDrink',
				name: 'Walking Drink',
				icon: svg(
					'<path class="tone" d="M14 14 H26 V20 Q32 24 30 34 Q28 40 20 40 Q12 40 10 34 Q8 24 14 20 Z"/><path class="ink-line" d="M34 24 H44 M36 32 H46"/>',
				),
				text: 'Oolong learns to drink on the move. Swig no longer roots him and walking no longer stops it, but each gulp gives only {factor} of the [[Shield]].',
				ability: { swig: { root: false, cancelOnMove: false } },
				stats: { swig: { shieldPerSecond: (v, n) => v * n.factor } },
			},
			{
				id: 'sharedPot',
				name: 'Shared Pot',
				icon: svg(
					'<path class="tone" d="M16 14 H32 L30 30 H18 Z"/><circle class="cream" cx="8" cy="38" r="5"/><circle class="cream" cx="24" cy="40" r="5"/><circle class="cream" cx="40" cy="38" r="5"/>',
				),
				text: 'Swig is poured for the whole table. Allies within {radius} gain {fraction} of every gulp’s [[Shield]].',
				after: {
					swig: {
						onTick({ hero, sim, ability, dt, tick, numbers }) {
							const stats = ability.stats
							const q = hero.body.position
							for (const ally of sim.heroes) {
								if (ally === hero || ally.dead || ally.team !== hero.team) continue
								const p = ally.body.position
								if (Math.hypot(p.x - q.x, p.z - q.z) > numbers.radius) continue
								const held = statusOn(ally, 'swig.shield', tick, hero.id)
								sim.apply(ally, 'swig.shield', {
									source: hero,
									amount: (held?.amount ?? 0) + stats.shieldPerSecond * dt * numbers.fraction,
									duration: stats.shieldLife,
								})
							}
						},
					},
				},
			},
		],
		// Level 6: the brawler's temper.
		[
			{
				id: 'challenge',
				name: 'Challenge',
				icon: svg(
					'<path class="tone" d="M8 18 L22 18 L34 8 V40 L22 30 L8 30 Z"/><path class="ink-line" d="M38 16 L46 12 M38 24 H46 M38 32 L46 36"/>',
				),
				text: 'Taking his stance, Oolong bellows a challenge across the court. Every Warden within {radius} turns its full anger on him.',
				after: {
					stagger: {
						onStart({ hero, sim, numbers }) {
							for (const foe of foesNear(sim, hero, hero.body.position, numbers.radius)) {
								const threat = foe.unit.threat
								if (!threat) continue
								const top = Math.max(0, ...Object.values(threat))
								const gap = top - (threat[hero.id] ?? 0) + numbers.threat
								sim.dungeon?.addThreat(hero.id, gap, foe.unit)
							}
						},
					},
				},
			},
			{
				id: 'spicedBrew',
				name: 'Spiced Brew',
				icon: svg(
					'<path class="tone" d="M14 18 H30 V22 Q36 26 34 36 Q32 42 22 42 Q12 42 10 36 Q8 26 14 22 Z"/><path class="ink-line" d="M34 6 L38 14 L32 14 L36 22"/>',
				),
				text: 'While a [[Shield]] from Swig still holds, Palm Strike deals {factor} damage. Drink first, then strike.',
				on: {
					amplify({ hero, event, numbers, tick }) {
						const shield = statusOn(hero, 'swig.shield', tick)
						if (palm(event, hero) && shield?.amount > 0) event.factor *= numbers.factor
					},
				},
			},
			{
				id: 'secondWind',
				name: 'Second Wind',
				icon: svg(
					'<path class="ink-line" d="M6 18 Q22 10 30 18 Q38 26 26 28 M6 30 Q26 24 36 32 Q44 40 32 42"/>',
				),
				text: 'When a blow leaves Oolong below {health} of his health, Swig is ready at once. The jug grants this kindness once every {cooldown}.',
				on: {
					damaged({ hero, event, numbers, state, tick, ticks }) {
						if (event.target !== hero || hero.dead || tick < (state.next ?? 0)) return
						if (hero.hp / hero.maxHp >= numbers.health) return
						hero.cd[slotOf(hero, 'swig')] = 0
						state.next = tick + ticks(numbers.cooldown)
					},
				},
			},
		],
		// Level 7: the master's way.
		[
			{
				id: 'teapotTyphoon',
				name: 'Teapot Typhoon',
				icon: svg(
					'<circle class="tone" cx="24" cy="24" r="8"/><path class="ink-line" d="M24 4 V12 M24 36 V44 M4 24 H12 M36 24 H44 M10 10 L15 15 M33 33 L38 38 M38 10 L33 15 M10 38 L15 33"/>',
				),
				text: 'A Flying Kick that connects lands like a dropped teapot. Every other foe within {radius} takes {damage:damage} and is thrown {distance} away.',
				on: {
					hit({ hero, sim, event, numbers }) {
						if (!kick(event, hero) || event.shot.talent) return
						const at = hero.body.position
						for (const foe of foesNear(sim, hero, at, numbers.radius)) {
							if (foe.unit === event.target) continue
							strike(sim, hero, foe, {
								ability: 'flyingKick',
								slot: 'slot1',
								damage: scaled(hero, numbers.damage),
								talent: true,
							})
							shove(sim, foe.unit, at, numbers.distance, numbers.time)
						}
					},
				},
			},
			{
				id: 'ironBelly',
				name: 'Iron Belly',
				icon: svg(
					'<circle class="tone" cx="24" cy="26" r="16"/><path class="ink-line" d="M12 26 H36 M24 14 V38"/>',
				),
				text: 'Oolong’s belly is iron. Even outside his stance, {fraction} of every blow is banked as [[Stagger]] and repaid over {payout}.',
				on: {
					damage({ hero, sim, event, numbers, tick, ticks }) {
						const { shot, target } = event
						if (target !== hero || shot.periodic || !(event.damage > 0) || staggering(hero, tick))
							return
						const banked = event.damage * numbers.fraction
						event.damage -= banked
						const bank = sim.apply(hero, 'stagger.bank', { source: hero.id })
						if (!bank) return
						bank.amount = (bank.amount ?? 0) + banked
						const { owner, team, ability, slot, dx, dz } = shot
						bank.data.source = { owner, team, ability, slot, dx, dz }
						bank.data.left = ticks(numbers.payout)
						bank.data.ended = tick
						bank.until = tick + bank.data.left + 1
					},
				},
			},
			{
				id: 'bottomsUp',
				name: 'Bottoms Up',
				icon: svg(
					'<path class="tone" d="M18 6 H30 V12 Q38 16 38 28 L34 42 H14 L10 28 Q10 16 18 12 Z" transform="rotate(160 24 24)"/><path class="ink-line" d="M10 44 H38"/>',
				),
				text: 'Draining Swig to the last drop washes [[Stagger]] away. A full drink clears whatever the bank still owes.',
				stages: {
					swig: {
						release({ hero }) {
							const bank = bankOf(hero)
							if (!bank) return
							bank.amount = 0
							bank.data.left = 0
							bank.data.source = null
						},
					},
				},
			},
		],
	],
}
