import { foesNear, scaled, slotOf, statusOn, strike } from '../../talent-kit.js'

// Mandador's tree (talents.js): row n opens at level 2 + n. Numbers in mandador-tune.js under `talents`.
// Pass strikes only heroes and nothing in Altamesa is one, so in a run it is a heal; the tree leans
// on that, on Tag out and on the ring. Its statuses read shared numbers, so talents add effects
// beside them rather than restating the guard.
const ball = (event, hero) =>
	event.source === hero && event.shot?.slot === 'primary' && !event.shot.talent
const svg = (body) => `<svg viewBox="0 0 48 48" aria-hidden="true">${body}</svg>`
const ally = (hero, unit) => unit && unit !== hero && unit.team === hero.team && !unit.dead
const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
// Living allies within `radius` of a point, the most hurt first.
const alliesNear = (sim, hero, point, radius) =>
	sim.heroes
		.filter((u) => ally(hero, u) && near(u.body.position, point) <= radius)
		.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || (a.id < b.id ? -1 : 1))
const stun = (sim, hero, point, radius, duration) => {
	for (const foe of foesNear(sim, hero, point, radius))
		sim.apply(foe.unit, 'core.stun', { source: hero.id, duration })
}

export default {
	// What a bot takes in each row: the heals that keep a party standing in front of a Warden.
	bot: [1, 2, 1, 2, 1, 1],
	rows: [
		// Level 2: the ball.
		[
			{
				id: 'drill',
				name: 'Drill',
				icon: svg(
					'<circle class="cream" cx="18" cy="24" r="10"/><path class="ink-line" d="M30 18 H44 M30 24 H46 M30 30 H44"/>',
				),
				text: 'Mandador puts the tennis ball where it hurts. Whatever it strikes is slowed by {slow} for {duration}.',
				on: {
					hit({ hero, sim, event, numbers }) {
						if (!ball(event, hero) || event.lethal) return
						sim.apply(event.target, 'pass.slow', {
							source: hero.id,
							mag: 1 - numbers.slow,
							duration: numbers.duration,
						})
					},
				},
			},
			{
				id: 'goodForm',
				name: 'Good Form',
				icon: svg(
					'<circle class="cream" cx="14" cy="30" r="8"/><path class="tone" d="M30 14 H36 V20 H42 V26 H36 V32 H30 V26 H24 V20 H30 Z"/>',
				),
				text: 'Every tennis ball that lands is a lesson to the rest of the side. The most hurt ally within {radius} is healed {heal}.',
				on: {
					hit({ hero, sim, event, numbers }) {
						if (!ball(event, hero) || hero.dead) return
						const [friend] = alliesNear(sim, hero, hero.body.position, numbers.radius)
						if (friend) sim.heal(hero, friend, numbers.heal, 'pass')
					},
				},
			},
			{
				id: 'keepScore',
				name: 'Keep Score',
				icon: svg(
					'<path class="tone" d="M8 8 H40 V40 H8 Z"/><path class="ink-line" d="M14 16 V32 M20 16 V32 M26 16 V32 M32 16 V32 M12 28 L36 20"/>',
				),
				text: 'Mandador keeps count of every ball that lands, and each one takes {cut} off the wait for Pass.',
				on: {
					hit({ hero, event, numbers, ticks }) {
						if (!ball(event, hero)) return
						const slot = slotOf(hero, 'pass')
						if (slot >= 0) hero.cd[slot] = Math.max(0, hero.cd[slot] - ticks(numbers.cut))
					},
				},
			},
		],
		// Level 3: the pass.
		[
			{
				id: 'longPass',
				name: 'Long Pass',
				icon: svg(
					'<path class="ink-line" d="M4 30 H32"/><circle class="cream" cx="38" cy="30" r="7"/><path class="ink-line" d="M6 22 H14 M6 38 H14"/>',
				),
				text: 'Mandador throws the length of the court. Pass reaches {range} farther and flies {speed} faster.',
				stats: { pass: { range: (v, n) => v + n.range, speed: (v, n) => v + n.speed } },
			},
			{
				id: 'heavyBall',
				name: 'Heavy Ball',
				icon: svg(
					'<circle class="cream" cx="24" cy="24" r="16"/><path class="ink-line" d="M12 14 Q24 24 12 34 M36 14 Q24 24 36 34"/>',
				),
				text: 'A heavier ball, thrown less often. Pass heals {healAmount} more, and takes {cooldown} longer to come back.',
				stats: {
					pass: {
						healAmount: (v, n) => v + n.healAmount,
						cooldown: (v, n) => v + n.cooldown,
					},
				},
			},
			{
				id: 'giveAndGo',
				name: 'Give and Go',
				icon: svg(
					'<path class="ink-line" d="M6 18 H36"/><path class="tone" d="M30 10 L40 18 L30 26 Z"/><path class="ink-line" d="M40 32 H12"/><path class="tone" d="M18 24 L8 32 L18 40 Z"/>',
				),
				text: 'A good pass comes back. When Pass heals an ally, Mandador is healed {fraction} as much.',
				stages: {
					pass: {
						hit({ hero, sim, event, ability, numbers }) {
							if (!ally(hero, event.target) || hero.dead) return
							sim.heal(hero, hero, ability.stats.healAmount * numbers.fraction, 'pass')
						},
					},
				},
			},
		],
		// Level 4: the swap.
		[
			{
				id: 'longReach',
				name: 'Long Reach',
				icon: svg(
					'<path class="tone" d="M6 16 H34 V9 L45 20 L34 31 V24 H6 Z"/><path class="ink-line" d="M6 38 H44"/>',
				),
				text: 'Mandador can call a tired wrestler off from farther away. Tag out reaches {range} farther and is ready {cooldown} sooner.',
				stats: {
					tagOut: { range: (v, n) => v + n.range, cooldown: (v, n) => v - n.cooldown },
				},
			},
			{
				id: 'freshLegs',
				name: 'Fresh Legs',
				icon: svg(
					'<path class="cream" d="M42 34 H16 V27 L5 38 L16 47 V42 H42 Z"/><path class="tone" d="M30 4 H36 V10 H42 V16 H36 V22 H30 V16 H24 V10 H30 Z"/>',
				),
				text: 'An ally sent out of the fight by Tag out comes out with a drink and a towel, and is healed {fraction} of their health.',
				stages: {
					tagOut: {
						release({ hero, sim, event, numbers }) {
							const friend = event?.target
							if (ally(hero, friend))
								sim.heal(hero, friend, friend.maxHp * numbers.fraction, 'tagOut')
						},
					},
				},
			},
			{
				id: 'holdTheLine',
				name: 'Hold the Line',
				icon: svg(
					'<path class="ink-line" d="M4 40 H44"/><path class="tone" d="M14 8 H34 V36 H14 Z"/><path class="ink-line" d="M20 18 H28"/>',
				),
				text: 'While Tag out guards Mandador, whoever strikes the board from within {range} is slowed by {slow} for {duration}.',
				on: {
					damaged({ hero, sim, event, numbers, tick }) {
						const source = event.source
						if (event.target !== hero || !source?.body || source.team === hero.team) return
						if (!statusOn(hero, 'tagOut.guard', tick)) return
						if (near(source.body.position, hero.body.position) > numbers.range + source.body.radius)
							return
						sim.apply(source, 'pass.slow', {
							source: hero.id,
							mag: 1 - numbers.slow,
							duration: numbers.duration,
						})
					},
				},
			},
		],
		// Level 5: the ring.
		[
			{
				id: 'wideRing',
				name: 'Wide Ring',
				icon: svg(
					'<circle class="ink-line" cx="24" cy="24" r="20"/><circle class="cream" cx="24" cy="24" r="12"/>',
				),
				text: 'Mandador chalks the ring with a longer arm. Rally ring is {radius} wider.',
				stats: { rallyRing: { radius: (v, n) => v + n.radius } },
			},
			{
				id: 'shout',
				name: 'Shout',
				icon: svg(
					'<path class="tone" d="M6 18 L20 18 L34 8 V40 L20 30 L6 30 Z"/><path class="ink-line" d="M38 16 L46 12 M38 24 H46 M38 32 L46 36"/>',
				),
				text: 'Mandador calls the bout through the speaking-trumpet as the ring lands, and every foe inside it stops dead for {stun}.',
				stages: {
					rallyRing: {
						release({ hero, sim, event, ability, numbers }) {
							const at = event?.point ?? hero.body.position
							stun(sim, hero, at, ability.stats.radius, numbers.stun)
						},
					},
				},
			},
			{
				id: 'longBout',
				name: 'Long Bout',
				icon: svg(
					'<circle class="cream" cx="24" cy="26" r="16"/><path class="ink-line" d="M24 26 V14 M24 26 L32 30 M18 4 H30"/>',
				),
				text: 'The bout runs long. Rally ring stays on the stone {duration} longer, and is ready {cooldown} sooner.',
				stats: {
					rallyRing: {
						duration: (v, n) => v + n.duration,
						cooldown: (v, n) => v - n.cooldown,
					},
				},
			},
		],
		// Level 6: the touchline temper.
		[
			{
				id: 'coolHead',
				name: 'Cool Head',
				icon: svg(
					'<path class="tone" d="M14 8 H34 V40 H14 Z"/><path class="ink-line" d="M18 18 Q24 14 30 18 M20 30 H28"/>',
				),
				text: 'When a blow leaves Mandador below {health} of its health, Tag out is ready at once. The board keeps its head once every {cooldown}.',
				on: {
					damaged({ hero, event, numbers, state, tick, ticks }) {
						if (event.target !== hero || hero.dead || tick < (state.next ?? 0)) return
						if (hero.hp / hero.maxHp >= numbers.health) return
						const slot = slotOf(hero, 'tagOut')
						if (slot < 0) return
						hero.cd[slot] = 0
						state.next = tick + ticks(numbers.cooldown)
					},
				},
			},
			{
				id: 'stretcher',
				name: 'Stretcher',
				icon: svg(
					'<path class="tone" d="M4 26 H44 V32 H4 Z"/><path class="ink-line" d="M8 32 V40 M40 32 V40"/><path class="cream" d="M20 14 H28 V18 H32 V22 H16 V18 H20 Z"/>',
				),
				text: 'When an ally within {radius} falls below {health} of their health, Pass is ready at once. Mandador sends for the stretcher once every {cooldown}.',
				on: {
					tick({ hero, sim, numbers, state, tick, ticks }) {
						if (hero.dead || tick < (state.next ?? 0)) return
						const [friend] = alliesNear(sim, hero, hero.body.position, numbers.radius)
						if (!friend || friend.hp / friend.maxHp >= numbers.health) return
						const slot = slotOf(hero, 'pass')
						if (slot < 0) return
						hero.cd[slot] = 0
						state.next = tick + ticks(numbers.cooldown)
					},
				},
			},
			{
				id: 'thickBoard',
				name: 'Thick Board',
				icon: svg(
					'<path class="tone" d="M10 6 H38 V42 H10 Z"/><path class="ink-line" d="M16 6 V42 M32 6 V42"/>',
				),
				text: 'Mandador is painted on good timber. The blows of a Warden land {fraction} lighter on it.',
				on: {
					damage({ hero, event, numbers }) {
						if (event.target !== hero || !(event.damage > 0) || !event.source?.threat) return
						event.damage *= 1 - numbers.fraction
					},
				},
			},
		],
		// Level 7: the old mandador's way.
		[
			{
				id: 'finalWhistle',
				name: 'Final Whistle',
				icon: svg(
					'<circle class="tone" cx="18" cy="28" r="10"/><path class="tone" d="M24 22 H44 V30 H26 Z"/><path class="ink-line" d="M8 8 L14 14 M18 4 V12"/>',
				),
				text: 'When Rally ring lands, Mandador blows the whistle on every foe inside it, and each takes {damage:damage}.',
				stages: {
					rallyRing: {
						release({ hero, sim, event, ability, numbers }) {
							const at = event?.point ?? hero.body.position
							for (const foe of foesNear(sim, hero, at, ability.stats.radius))
								strike(sim, hero, foe, {
									ability: 'rallyRing',
									slot: 'slot3',
									damage: scaled(hero, numbers.damage),
									from: at,
									talent: true,
								})
						},
					},
				},
			},
			{
				id: 'teamTalk',
				name: 'Team Talk',
				icon: svg(
					'<circle class="cream" cx="10" cy="30" r="6"/><circle class="cream" cx="38" cy="30" r="6"/><path class="ink-line" d="M10 22 Q24 4 38 22"/>',
				),
				text: 'Pass carries on to the next pair of hands. The most hurt other ally within {radius} of the one it heals is healed {fraction} as much.',
				stages: {
					pass: {
						hit({ hero, sim, event, ability, numbers }) {
							const first = event.target
							if (!ally(hero, first)) return
							const next = alliesNear(sim, hero, first.body.position, numbers.radius).find(
								(u) => u !== first,
							)
							if (next) sim.heal(hero, next, ability.stats.healAmount * numbers.fraction, 'pass')
						},
					},
				},
			},
			{
				id: 'showman',
				name: 'Showman',
				icon: svg(
					'<path class="tone" d="M6 16 H32 V9 L43 20 L32 31 V24 H6 Z"/><path class="ink-line" d="M10 40 L14 34 M24 44 V36 M38 40 L34 34"/>',
				),
				text: 'Mandador arrives from Tag out like a referee into a brawl. Every foe within {radius} of where the board lands stops dead for {stun}.',
				stages: {
					tagOut: {
						release({ hero, sim, numbers }) {
							stun(sim, hero, hero.body.position, numbers.radius, numbers.stun)
						},
					},
				},
			},
		],
	],
}
