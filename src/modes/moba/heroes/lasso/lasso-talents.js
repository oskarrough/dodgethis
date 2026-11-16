import { foesNear, scaled, shove, slotOf, statusOn, strike } from '../../talent-kit.js'

// Lasso's tree (talents.js): row n opens at level 2 + n. Numbers in lasso-tune.js under `talents`.
// Around the world strikes only heroes, and nothing in Altamesa is one, so its row teaches the loop
// to take every foe or to do something useful without striking.
const flick = (event, hero) =>
	event.source === hero && event.shot?.slot === 'primary' && !event.shot.talent
const mine = (event, hero, ability) =>
	event.source === hero && event.shot?.ability === ability && !event.shot.talent
const svg = (body) => `<svg viewBox="0 0 48 48" aria-hidden="true">${body}</svg>`
const tangled = (unit, tick, hero) => statusOn(unit, 'tangle.slow', tick, hero?.id)
const wardenOf = (unit) => !!unit?.threat

// A second loop around Lasso: every foe within the loop's radius takes `fraction` of its blow.
function loop(sim, hero, fraction, knockback) {
	const stats = hero.definition.abilities.slot3?.stats
	if (!stats) return
	const at = hero.body.position
	for (const foe of foesNear(sim, hero, at, stats.radius)) {
		strike(sim, hero, foe, {
			ability: 'aroundTheWorld',
			slot: 'slot3',
			damage: scaled(hero, stats.damage) * fraction,
			from: at,
			talent: true,
		})
		if (knockback) shove(sim, foe.unit, at, stats.knockback, stats.time)
	}
}

export default {
	// What a bot takes in each row: the line that holds a foe, and the loop that reaches a Warden.
	bot: [2, 1, 0, 0, 0, 0],
	rows: [
		// Level 2: the flick.
		[
			{
				id: 'sinker',
				name: 'Sinker',
				icon: svg(
					'<path class="ink-line" d="M24 4 V24"/><path class="tone" d="M24 24 L32 34 Q32 44 24 44 Q16 44 16 34 Z"/>',
				),
				text: 'Lasso ties a lead weight to the end of his line. One Yo-yo flick in {every} lands with {factor} the weight.',
				on: {
					amplify({ hero, event, numbers, state }) {
						if (!flick(event, hero)) return
						state.count = ((state.count ?? 0) + 1) % numbers.every
						if (state.count === 0) event.factor *= numbers.factor
					},
				},
			},
			{
				id: 'snag',
				name: 'Snag',
				icon: svg(
					'<path class="ink-line" d="M6 38 L30 14"/><path class="ink-line" d="M30 14 Q42 14 40 26 Q38 32 32 30"/>',
				),
				text: 'The flick comes back with a little of its foe on the hook. Whatever it strikes is slowed by {slow} for {duration}.',
				on: {
					hit({ hero, sim, event, numbers }) {
						if (!flick(event, hero) || event.lethal) return
						sim.apply(event.target, 'tangle.slow', {
							source: hero.id,
							mag: 1 - numbers.slow,
							duration: numbers.duration,
						})
					},
				},
			},
			{
				id: 'patience',
				name: 'Patience',
				icon: svg(
					'<path class="ink-line" d="M8 40 Q8 10 38 8 L38 30"/><circle class="tone" cx="38" cy="34" r="5"/><path class="ink-line" d="M4 44 H44"/>',
				),
				text: 'A fisherman waits for the line to go tight. Yo-yo flick deals {factor} damage to a foe Lasso has slowed.',
				on: {
					amplify({ hero, event, numbers, tick }) {
						if (flick(event, hero) && tangled(event.target, tick, hero))
							event.factor *= numbers.factor
					},
				},
			},
		],
		// Level 3: the throw.
		[
			{
				id: 'longLine',
				name: 'Long Line',
				icon: svg(
					'<path class="ink-line" d="M4 30 H34"/><circle class="gold" cx="40" cy="30" r="6"/><path class="ink-line" d="M6 22 H14 M6 38 H14"/>',
				),
				text: 'Lasso pays out more line before he lets go. Throw reaches {range} farther and flies {speed} faster.',
				stats: { throw: { range: (v, n) => v + n.range, speed: (v, n) => v + n.speed } },
			},
			{
				id: 'barb',
				name: 'Barb',
				icon: svg(
					'<path class="ink-line" d="M8 40 L32 16 M32 16 L24 16 M32 16 L32 24"/><circle class="gold" cx="36" cy="12" r="5"/>',
				),
				text: 'The yo-yo carries a barb now. A foe reeled in by Throw arrives slowed by {slow} for {duration}, and in no state to leave.',
				on: {
					hit({ hero, sim, event, numbers }) {
						if (!mine(event, hero, 'throw') || event.lethal) return
						sim.apply(event.target, 'tangle.slow', {
							source: hero.id,
							mag: 1 - numbers.slow,
							duration: numbers.duration,
						})
					},
				},
			},
			{
				id: 'catchOfTheDay',
				name: 'Catch of the Day',
				icon: svg(
					'<path class="tone" d="M6 24 Q18 12 32 24 Q18 36 6 24 Z"/><path class="tone" d="M32 24 L42 16 V32 Z"/><circle class="cream" cx="14" cy="22" r="2"/>',
				),
				text: 'Every Throw that lands puts Lasso in a good mood, and the next comes {refund} sooner.',
				on: {
					hit({ hero, event, numbers, ticks }) {
						if (!mine(event, hero, 'throw')) return
						const slot = slotOf(hero, 'throw')
						if (slot >= 0) hero.cd[slot] = Math.max(0, hero.cd[slot] - ticks(numbers.refund))
					},
				},
			},
		],
		// Level 4: the snare.
		[
			{
				id: 'wideNet',
				name: 'Wide Net',
				icon: svg(
					'<path class="cream" d="M24 42 L2 12 A32 32 0 0 1 46 12 Z"/><path class="ink-line" d="M10 22 L38 22 M14 30 H34 M24 42 V8"/>',
				),
				text: 'Lasso casts Tangle like a net from the harbour wall. Its cone opens {angle} wider and reaches {range} farther.',
				stats: {
					tangle: {
						angle: (v, n) => v + n.angle,
						range: (v, n) => v + n.range,
						radius: (v, n) => v + n.range,
					},
				},
			},
			{
				id: 'doubleKnot',
				name: 'Double Knot',
				icon: svg(
					'<circle class="ink-line" cx="18" cy="24" r="8"/><circle class="ink-line" cx="30" cy="24" r="8"/>',
				),
				text: 'Tangle is tied twice. The [[Slow]] it leaves holds {duration} longer and bites {slow} deeper.',
				stats: {
					tangle: {
						duration: (v, n) => v + n.duration,
						slow: (v, n) => Math.min(0.9, v + n.slow),
					},
				},
			},
			{
				id: 'dragNet',
				name: 'Drag Net',
				icon: svg(
					'<path class="cream" d="M30 42 L8 12 A32 32 0 0 1 44 20 Z"/><path class="ink-line" d="M40 30 Q30 38 14 40"/><path class="tone" d="M14 34 L6 40 L14 46 Z"/>',
				),
				text: 'Lasso hauls on the net as it lands. Every foe Tangle strikes is drawn {distance} toward him.',
				on: {
					hit({ hero, sim, event, numbers }) {
						if (!mine(event, hero, 'tangle') || event.lethal) return
						shove(sim, event.target, hero.body.position, -numbers.distance, numbers.time)
					},
				},
			},
		],
		// Level 5: the loop.
		[
			{
				id: 'wideLoop',
				name: 'Wide Loop',
				icon: svg(
					'<circle class="ink-line" cx="24" cy="24" r="18"/><circle class="tone" cx="24" cy="24" r="6"/><circle class="gold" cx="42" cy="24" r="5"/>',
				),
				text: 'Around the world stops being particular. It strikes every foe in its circle, Wardens and their creatures too, not only heroes.',
				stages: {
					aroundTheWorld: {
						release({ hero, sim }) {
							const stats = hero.definition.abilities.slot3?.stats
							if (!stats) return
							const at = hero.body.position
							for (const foe of foesNear(sim, hero, at, stats.radius)) {
								if (foe.hero) continue
								strike(sim, hero, foe, {
									ability: 'aroundTheWorld',
									slot: 'slot3',
									damage: scaled(hero, stats.damage),
									from: at,
									talent: true,
								})
								shove(sim, foe.unit, at, stats.knockback, stats.time)
							}
						},
					},
				},
			},
			{
				id: 'haul',
				name: 'Haul',
				icon: svg(
					'<circle class="ink-line" cx="24" cy="24" r="18"/><path class="ink-line" d="M6 24 H16 M42 24 H32 M24 6 V16 M24 42 V32"/><circle class="tone" cx="24" cy="24" r="5"/>',
				),
				text: 'Lasso swings the loop wide and pulls it in. Every foe within {radius}, of whatever kind, is drawn {distance} toward him.',
				stages: {
					aroundTheWorld: {
						release({ hero, sim, numbers }) {
							const at = hero.body.position
							for (const foe of foesNear(sim, hero, at, numbers.radius))
								shove(sim, foe.unit, at, -numbers.distance, numbers.time)
						},
					},
				},
			},
			{
				id: 'coiled',
				name: 'Coiled',
				icon: svg(
					'<path class="ink-line" d="M24 24 m-4 0 a4 4 0 1 1 8 0 a8 8 0 1 1 -16 0 a12 12 0 1 1 24 0 a16 16 0 1 1 -32 0"/>',
				),
				text: 'The loop winds the line back onto the spool. Around the world makes Tangle ready again at once.',
				stages: {
					aroundTheWorld: {
						release({ hero }) {
							const slot = slotOf(hero, 'tangle')
							if (slot >= 0) hero.cd[slot] = 0
						},
					},
				},
			},
		],
		// Level 6: the fisherman's temper.
		[
			{
				id: 'seaLegs',
				name: 'Sea Legs',
				icon: svg(
					'<path class="ink-line" d="M4 36 Q14 28 24 36 Q34 44 44 36"/><path class="tone" d="M18 10 H30 V30 H18 Z"/>',
				),
				text: 'A foe tangled in Lasso’s line has no footing to strike from. He takes {fraction} less from anything he has slowed.',
				on: {
					damage({ hero, event, numbers, tick }) {
						if (event.target !== hero || !(event.damage > 0) || !event.source) return
						if (tangled(event.source, tick, hero)) event.damage *= 1 - numbers.fraction
					},
				},
			},
			{
				id: 'goodHaul',
				name: 'Good Haul',
				icon: svg(
					'<path class="tone" d="M8 20 H40 L34 40 H14 Z"/><path class="ink-line" d="M14 20 L18 12 M24 20 V10 M34 20 L30 12"/>',
				),
				text: 'Every foe Lasso fells goes into the basket, and the sight of it does him good. He heals {fraction} of his health for each.',
				on: {
					hit({ hero, sim, event, numbers }) {
						if (event.source !== hero || !event.lethal || hero.dead) return
						sim.heal(hero, hero, hero.maxHp * numbers.fraction, event.shot?.ability)
					},
				},
			},
			{
				id: 'mendedNet',
				name: 'Mended Net',
				icon: svg(
					'<path class="cream" d="M24 42 L4 12 A30 30 0 0 1 44 12 Z"/><path class="ink-line" d="M16 22 L22 28 L30 20"/>',
				),
				text: 'Lasso mends his net between casts without looking at it. Tangle is ready {cooldown} sooner.',
				stats: { tangle: { cooldown: (v, n) => v - n.cooldown } },
			},
		],
		// Level 7: the old fisherman's way.
		[
			{
				id: 'heavySinker',
				name: 'Heavy Sinker',
				icon: svg(
					'<path class="ink-line" d="M24 2 V18"/><path class="tone" d="M24 18 L36 32 Q36 46 24 46 Q12 46 12 32 Z"/>',
				),
				text: 'Lasso has fished the cloud for things larger than men. Throw deals {factor} damage to a Warden.',
				on: {
					amplify({ hero, event, numbers }) {
						if (mine(event, hero, 'throw') && wardenOf(event.target)) event.factor *= numbers.factor
					},
				},
			},
			{
				id: 'doubleHook',
				name: 'Double Hook',
				icon: svg(
					'<path class="ink-line" d="M4 40 L24 20 L44 40"/><circle class="gold" cx="24" cy="20" r="5"/><circle class="gold" cx="44" cy="40" r="4"/>',
				),
				text: 'Throw carries a second hook on the same line. The nearest other foe within {radius} of the first takes {fraction} of the blow and is reeled in too.',
				on: {
					hit({ hero, sim, event, numbers }) {
						if (!mine(event, hero, 'throw') || !(event.damage > 0)) return
						const at = event.target.body.position
						const next = foesNear(sim, hero, at, numbers.radius)
							.filter((foe) => foe.unit !== event.target)
							.sort(
								(a, b) => Math.hypot(a.x - at.x, a.z - at.z) - Math.hypot(b.x - at.x, b.z - at.z),
							)[0]
						if (!next) return
						strike(sim, hero, next, {
							ability: 'throw',
							slot: event.shot.slot,
							damage: event.damage * numbers.fraction,
							from: at,
							talent: true,
						})
						if (!next.unit.dead)
							shove(sim, next.unit, hero.body.position, -numbers.distance, numbers.time)
					},
				},
			},
			{
				id: 'whirlpool',
				name: 'Whirlpool',
				icon: svg(
					'<path class="ink-line" d="M24 24 m-3 0 a3 3 0 1 1 6 0 a7 7 0 1 1 -14 0 a11 11 0 1 1 22 0 a15 15 0 1 1 -30 0"/><circle class="gold" cx="40" cy="30" r="4"/>',
				),
				text: 'Around the world goes round twice. {delay} after the first loop, a second strikes every foe in the circle for {fraction} of the blow.',
				stages: {
					aroundTheWorld: {
						release({ state, numbers, tick, ticks }) {
							state.at = tick + ticks(numbers.delay)
						},
					},
				},
				on: {
					tick({ hero, sim, numbers, state, tick }) {
						if (!state.at || tick < state.at) return
						state.at = null
						if (!hero.dead) loop(sim, hero, numbers.fraction, false)
					},
				},
			},
		],
	],
}
