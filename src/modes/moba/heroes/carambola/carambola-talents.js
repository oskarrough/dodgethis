import { foesNear, slotOf, strike } from '../../talent-kit.js'
import { STEP } from '../../../../core/app.js'
import { tune } from '../../tune.js'

// Carambola's tree (talents.js): row n opens at level 2 + n. Numbers in carambola-tune.js under `talents`.
// Pinball's flight is a summon that reads the shared numbers (summons.js), so the talents that touch
// its chain sit beside it, in aura hooks, rather than restating jumps or falloff.
const svg = (body) => `<svg viewBox="0 0 48 48" aria-hidden="true">${body}</svg>`
const mine = (event, hero, ability) =>
	event.source === hero && event.shot?.ability === ability && !event.shot.talent
const paddle = (event, hero) =>
	event.source === hero && event.shot?.slot === 'primary' && !event.shot.talent
const banked = (event, hero) => mine(event, hero, 'bank') && (event.shot.cushions ?? 0) > 0
const landing = (event, hero) => mine(event, hero, 'lob') && !event.shot.periodic
const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const wardenOf = (unit) => !!unit?.threat
const quicken = (hero, ability, seconds, ticks) => {
	const slot = slotOf(hero, ability)
	if (slot >= 0) hero.cd[slot] = Math.max(0, hero.cd[slot] - ticks(seconds))
}
// The flight now arriving on a foe, so a talent can tell the serve from the jumps after it.
const flightOn = (sim, hero, target) =>
	sim.summons.find(
		(u) => u.owner === hero.id && u.key === 'pinball' && !u.dead && u.data.target === target.id,
	)

export default {
	// What a bot takes in each row: the shots that land without a wall to aim at.
	bot: [0, 0, 0, 1, 0, 1],
	rows: [
		// Level 2: the ricochet.
		[
			{
				id: 'thirdCushion',
				name: 'Third Cushion',
				icon: svg(
					'<path class="ink-line" d="M4 40 L16 8 L30 40 L44 8"/><circle class="gold" cx="44" cy="10" r="4"/>',
				),
				text: 'Carambola has played every wall in the mesa and knows one more. Ricochet banks {bounces} more time before it stops.',
				stats: { bank: { bounce: (v, n) => ({ ...v, max: v.max + n.bounces }) } },
			},
			{
				id: 'hotCelluloid',
				name: 'Hot Celluloid',
				icon: svg(
					'<circle class="gold" cx="24" cy="24" r="10"/><path class="ink-line" d="M8 8 L14 14 M40 8 L34 14 M8 40 L14 34 M40 40 L34 34"/>',
				),
				text: 'The ball warms with every wall it meets. Each bank adds {damage:damage} more to Ricochet’s blow.',
				stats: {
					bank: {
						bounce: (v, n) => ({ ...v, damagePerCushion: v.damagePerCushion + n.damage }),
					},
				},
			},
			{
				id: 'english',
				name: 'English',
				icon: svg(
					'<circle class="tone" cx="24" cy="24" r="12"/><path class="ink-line" d="M10 14 Q24 2 38 14 L34 6 M38 14 L30 16"/>',
				),
				text: 'A ball that has met a wall comes off it spinning. A banked Ricochet slows whatever it strikes by {slow} for {duration}.',
				on: {
					hit({ hero, sim, event, numbers }) {
						if (!banked(event, hero) || event.lethal) return
						sim.apply(event.target, 'rain.slow', {
							source: hero.id,
							mag: 1 - numbers.slow,
							duration: numbers.duration,
						})
					},
				},
			},
		],
		// Level 3: the lob.
		[
			{
				id: 'deadDrop',
				name: 'Dead Drop',
				icon: svg(
					'<path class="ink-line" d="M24 4 V22"/><circle class="gold" cx="24" cy="28" r="6"/><ellipse class="tone" cx="24" cy="40" rx="16" ry="4"/>',
				),
				text: 'Carambola puts the whole paddle into the lob, and it comes down like a roof tile. Whatever it lands on is [[stunned|stun]] for {duration}.',
				on: {
					hit({ hero, sim, event, numbers }) {
						if (!landing(event, hero) || event.lethal) return
						sim.apply(event.target, 'core.stun', { source: hero.id, duration: numbers.duration })
					},
				},
			},
			{
				id: 'longBurn',
				name: 'Long Burn',
				icon: svg(
					'<ellipse class="tone" cx="24" cy="36" rx="18" ry="6"/><path class="ink-line" d="M16 30 Q12 22 18 14 M24 30 Q20 18 26 8 M32 30 Q28 22 34 16"/>',
				),
				text: 'The ground Lob leaves stays hot {fieldLife} longer and burns {burnDamage:damage} more each time.',
				stats: {
					lob: {
						fieldLife: (v, n) => v + n.fieldLife,
						burnDamage: (v, n) => v + n.burnDamage,
					},
				},
			},
			{
				id: 'wideShadow',
				name: 'Wide Shadow',
				icon: svg(
					'<ellipse class="tone" cx="24" cy="36" rx="22" ry="8"/><circle class="gold" cx="24" cy="12" r="6"/>',
				),
				text: 'He sends it higher, and its shadow spreads wider on the sand. Lob lands and burns {radius} wider.',
				stats: {
					lob: {
						radius: (v, n) => v + n.radius,
						fieldRadius: (v, n) => v + n.radius,
					},
				},
			},
		],
		// Level 4: the pinball.
		[
			{
				id: 'rally',
				name: 'Rally',
				icon: svg(
					'<circle class="tone" cx="10" cy="36" r="5"/><circle class="tone" cx="38" cy="36" r="5"/><path class="ink-line" d="M10 30 Q24 4 38 30"/><path class="ink-line" d="M4 44 H44"/>',
				),
				text: 'Every body the ball finds is a wall that walked into the game. Each Pinball strike takes {cut} off the wait for Ricochet.',
				on: {
					hit({ hero, event, numbers, ticks }) {
						if (mine(event, hero, 'pinball')) quicken(hero, 'bank', numbers.cut, ticks)
					},
				},
			},
			{
				id: 'hardRubber',
				name: 'Hard Rubber',
				icon: svg(
					'<circle class="ink" cx="24" cy="24" r="12"/><path class="ink-line" d="M6 24 H12 M36 24 H42 M24 6 V12 M24 36 V42"/>',
				),
				text: 'A harder ball loses less between bodies. Each jump of Pinball strikes only {falloff} softer than the last.',
				on: {
					amplify({ hero, sim, event, numbers }) {
						if (!mine(event, hero, 'pinball')) return
						const hop = flightOn(sim, hero, event.target)?.data.hop ?? 0
						const base = hero.definition.abilities.slot3?.stats.falloff ?? tune.pinball.falloff
						event.factor *= ((1 - numbers.falloff) / (1 - base)) ** hop
					},
				},
			},
			{
				id: 'longServe',
				name: 'Long Serve',
				icon: svg(
					'<path class="ink-line" d="M4 40 L44 8" stroke-dasharray="4 4"/><circle class="gold" cx="40" cy="12" r="5"/>',
				),
				text: 'Carambola serves from the back of the court. Pinball reaches {range} farther and is ready {cooldown} sooner.',
				stats: {
					pinball: { range: (v, n) => v + n.range, cooldown: (v, n) => v - n.cooldown },
				},
			},
		],
		// Level 5: the paddle.
		[
			{
				id: 'sweetSpot',
				name: 'Sweet Spot',
				icon: svg(
					'<ellipse class="tone" cx="20" cy="18" rx="12" ry="14"/><path class="ink-line" d="M28 28 L42 44"/><circle class="gold" cx="20" cy="18" r="4"/>',
				),
				text: 'A foe still ringing from a trick shot is easy to find with the paddle. For {window} after Carambola’s Ricochet, Lob or Pinball strikes a foe, his paddle deals {factor} damage to it.',
				on: {
					hit({ hero, event, state, tick }) {
						if (event.source !== hero || event.shot?.talent || event.shot?.slot === 'primary')
							return
						state.marks ??= {}
						state.marks[event.target.id] = tick
					},
					amplify({ hero, event, numbers, state, tick, ticks }) {
						if (!paddle(event, hero)) return
						const at = state.marks?.[event.target.id]
						if (at != null && tick - at <= ticks(numbers.window)) event.factor *= numbers.factor
					},
				},
			},
			{
				id: 'backhand',
				name: 'Backhand',
				icon: svg(
					'<circle class="tone" cx="12" cy="24" r="6"/><circle class="tone" cx="38" cy="14" r="5"/><path class="ink-line" d="M18 24 Q30 30 36 20"/>',
				),
				text: 'Carambola never lets a ball die. Every {every} paddle strike, the ball jumps on to the nearest other foe within {range} and strikes it for {fraction} of the blow.',
				on: {
					hit({ hero, sim, event, numbers, state }) {
						if (!paddle(event, hero) || !(event.damage > 0)) return
						state.count = ((state.count ?? 0) + 1) % numbers.every
						if (state.count !== 0) return
						const from = event.target.body.position
						const next = foesNear(sim, hero, from, numbers.range)
							.filter((foe) => foe.unit !== event.target)
							.sort((a, b) => near(a, from) - near(b, from) || (a.id < b.id ? -1 : 1))[0]
						if (next)
							strike(sim, hero, next, {
								ability: 'pinball',
								slot: 'slot3',
								damage: event.damage * numbers.fraction,
								from,
								talent: true,
							})
					},
				},
			},
			{
				id: 'volley',
				name: 'Volley',
				icon: svg(
					'<path class="ink-line" d="M6 40 L20 20 L32 32 L44 10"/><circle class="gold" cx="44" cy="10" r="4"/>',
				),
				text: 'He keeps the ball in the air between serves. Each paddle strike takes {cut} off the wait for Pinball.',
				on: {
					hit({ hero, event, numbers, ticks }) {
						if (paddle(event, hero)) quicken(hero, 'pinball', numbers.cut, ticks)
					},
				},
			},
		],
		// Level 6: the stone beak.
		[
			{
				id: 'stoneBeak',
				name: 'Stone Beak',
				icon: svg(
					'<path class="tone" d="M8 16 L40 24 L8 32 Z"/><path class="ink-line" d="M14 20 L22 24 L14 28"/>',
				),
				text: 'There is more stone in his face than in a Warden’s fist. Carambola takes {fraction} less from a Warden’s blows.',
				on: {
					damage({ hero, event, numbers }) {
						if (event.target !== hero || !(event.damage > 0)) return
						if (wardenOf(event.source)) event.damage *= 1 - numbers.fraction
					},
				},
			},
			{
				id: 'cleanUp',
				name: 'Clean Up',
				icon: svg(
					'<path class="ink-line" d="M10 38 L38 10"/><path class="tone" d="M8 30 L18 40 L10 44 L4 38 Z"/><circle class="gold" cx="38" cy="10" r="4"/>',
				),
				text: 'Nothing restores a trick-shot man like the last blow. Whenever Carambola fells a foe, he is healed {heal}.',
				on: {
					hit({ hero, sim, event, numbers }) {
						if (event.source === hero && event.lethal && !hero.dead)
							sim.heal(hero, hero, numbers.heal, 'bank')
					},
				},
			},
			{
				id: 'rolledNet',
				name: 'Rolled Net',
				icon: svg(
					'<rect class="tone" x="10" y="14" width="28" height="20" rx="10"/><path class="ink-line" d="M16 14 V34 M24 14 V34 M32 14 V34"/>',
				),
				text: 'When a blow leaves Carambola below {health} of his health, he unrolls the net on his back and catches his breath, healing {fraction} of it. This happens once every {cooldown}.',
				on: {
					damaged({ hero, sim, event, numbers, state, tick, ticks }) {
						if (event.target !== hero || hero.dead || tick < (state.next ?? 0)) return
						if (hero.hp / hero.maxHp >= numbers.health) return
						sim.heal(hero, hero, hero.maxHp * numbers.fraction, 'bank')
						state.next = tick + ticks(numbers.cooldown)
					},
				},
			},
		],
		// Level 7: the trick.
		[
			{
				id: 'trickShot',
				name: 'Trick Shot',
				icon: svg(
					'<path class="ink-line" d="M4 30 L16 8 L28 30 L40 8"/><path class="tone" d="M34 30 L44 40 L34 44 Z"/><circle class="gold" cx="40" cy="10" r="4"/>',
				),
				text: 'The shot he learned against the walls, and the reason he never takes a straight one. A Ricochet that has banked deals {factor} damage.',
				on: {
					amplify({ hero, event, numbers }) {
						if (banked(event, hero)) event.factor *= numbers.factor
					},
				},
			},
			{
				id: 'multiball',
				name: 'Multiball',
				icon: svg(
					'<ellipse class="tone" cx="16" cy="38" rx="12" ry="4"/><circle class="gold" cx="16" cy="28" r="5"/><path class="ink-line" d="M20 24 Q30 8 40 22"/><circle class="gold" cx="40" cy="26" r="4"/>',
				),
				text: 'Lob never comes down quietly. Where it lands on a foe, a Pinball springs off it toward the nearest other foe and carries on through the crowd.',
				on: {
					hit({ hero, sim, event, state, tick, ticks }) {
						if (!landing(event, hero) || hero.dead || state.tick === tick) return
						const from = { x: event.target.body.position.x, z: event.target.body.position.z }
						const next = foesNear(sim, hero, from, tune.pinball.jumpRange)
							.filter((foe) => foe.unit !== event.target)
							.sort((a, b) => near(a, from) - near(b, from) || (a.id < b.id ? -1 : 1))[0]
						if (!next) return
						state.tick = tick
						const ball = sim.summon(hero, 'pinball', from)
						Object.assign(ball.data, {
							start: from,
							to: { x: next.x, z: next.z },
							target: next.id,
							slot: 'slot3',
							hit: { [event.target.id]: true },
							hop: 1,
							depart: tick,
							arrive: tick + Math.max(1, ticks(Math.max(STEP, tune.pinball.flight))),
						})
					},
				},
			},
			{
				id: 'longRally',
				name: 'Long Rally',
				icon: svg(
					'<path class="ink-line" d="M6 24 Q24 4 42 24 Q24 44 6 24"/><circle class="gold" cx="42" cy="24" r="4"/><circle class="gold" cx="6" cy="24" r="4"/>',
				),
				text: 'The rally never ends while Carambola holds the paddle. Every Pinball serve makes Ricochet ready at once.',
				on: {
					cast({ hero, event }) {
						const slot = slotOf(hero, 'bank')
						if (event.source === hero && event.ability?.id === 'pinball' && slot >= 0)
							hero.cd[slot] = 0
					},
				},
			},
		],
	],
}
