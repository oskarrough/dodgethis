import { foesNear, scaled, shove, slotOf, statusOn, strike } from '../../talent-kit.js'

// Undine's tree (talents.js): row n opens at level 2 + n. Numbers in undine-tune.js under `talents`.
// Balloon and Sprinkler are summons that read the shared numbers, so talents that touch them watch
// her own summons from a tick hook rather than restating their stats.
const flick = (event, hero) =>
	event.source === hero && event.shot?.slot === 'primary' && !event.shot.talent
const svg = (body) => `<svg viewBox="0 0 48 48" aria-hidden="true">${body}</svg>`
const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const serial = (unit) => Number(String(unit.id).split('-').pop()) || 0
const soaked = (unit, tick) => statusOn(unit, 'balloon.soak', tick)
const mine = (sim, hero, key) =>
	sim.summons.filter((u) => u.owner === hero.id && u.key === key && !u.dead)
// Her balloons that burst since this talent last looked, oldest first.
function burst(sim, hero, state) {
	const out = mine(sim, hero, 'balloon')
		.filter((u) => u.data.phase === 'puddle' && serial(u) > (state.last ?? 0))
		.sort((a, b) => serial(a) - serial(b))
	if (out.length) state.last = serial(out.at(-1))
	return out
}
const alliesAround = (sim, hero, point, radius) =>
	sim.heroes.filter(
		(u) =>
			!u.dead && u.team === hero.team && near(u.body.position, point) <= radius + u.body.radius,
	)
function hitFoes(sim, hero, point, radius, damage, ability, slot) {
	for (const foe of foesNear(sim, hero, point, radius))
		strike(sim, hero, foe, { ability, slot, damage, from: point, talent: true })
}
const BALLOON_RADIUS = (hero) => hero.definition.abilities.slot1?.stats.radius ?? 2

export default {
	// What a bot takes in each row: the heals that keep a party on its feet.
	bot: [1, 0, 1, 2, 1, 1],
	rows: [
		// Level 2: the flick.
		[
			{
				id: 'coldSplash',
				name: 'Cold Splash',
				icon: svg(
					'<circle class="tone" cx="16" cy="28" r="8"/><path class="ink-line" d="M28 18 Q36 12 42 18 M30 28 H44 M28 38 Q36 44 42 38"/>',
				),
				text: 'Undine flicks water cold enough to make a Warden flinch. Whatever her Water flick strikes is [[Soaked|soak]].',
				on: {
					hit({ hero, sim, event }) {
						if (flick(event, hero) && !event.lethal)
							sim.apply(event.target, 'balloon.soak', { source: hero.id })
					},
				},
			},
			{
				id: 'refill',
				name: 'Refill',
				icon: svg(
					'<path class="tone" d="M14 18 H34 L30 42 H18 Z"/><path class="ink-line" d="M24 4 V14 M18 10 L24 14 L30 10"/>',
				),
				text: 'Every Water flick that lands is a little water back in the jug, and takes {cut} off the wait for Balloon.',
				on: {
					hit({ hero, event, numbers, ticks }) {
						if (!flick(event, hero)) return
						const slot = slotOf(hero, 'balloon')
						if (slot >= 0) hero.cd[slot] = Math.max(0, hero.cd[slot] - ticks(numbers.cut))
					},
				},
			},
			{
				id: 'undercurrent',
				name: 'Undercurrent',
				icon: svg(
					'<path class="ink-line" d="M4 18 Q14 12 24 18 Q34 24 44 18"/><path class="tone" d="M8 30 Q24 22 40 30 Q24 44 8 30 Z"/>',
				),
				text: 'Wet things are easier to knock over. Water flick deals {factor} damage to a [[Soaked|soak]] foe.',
				on: {
					amplify({ hero, event, numbers, tick }) {
						if (flick(event, hero) && soaked(event.target, tick)) event.factor *= numbers.factor
					},
				},
			},
		],
		// Level 3: the balloon.
		[
			{
				id: 'bigBalloon',
				name: 'Big Balloon',
				icon: svg(
					'<circle class="tone" cx="24" cy="20" r="18"/><path class="cream" d="M20 37 L28 37 L24 44 Z"/>',
				),
				text: 'Undine fills the balloon to bursting. When it bursts, every ally under it is healed {heal} more.',
				on: {
					tick({ hero, sim, numbers, state }) {
						for (const balloon of burst(sim, hero, state))
							for (const friend of alliesAround(
								sim,
								hero,
								balloon.body.position,
								BALLOON_RADIUS(hero),
							))
								sim.heal(hero, friend, numbers.heal, 'balloon')
					},
				},
			},
			{
				id: 'hardWater',
				name: 'Hard Water',
				icon: svg(
					'<circle class="tone" cx="24" cy="22" r="14"/><path class="ink-line" d="M16 22 L24 14 L32 22 L24 30 Z"/>',
				),
				text: 'There is grit in the jug. Balloon deals {factor} damage to the foes it bursts over.',
				on: {
					amplify({ hero, event, numbers }) {
						if (event.source === hero && event.shot?.ability === 'balloon' && !event.shot.talent)
							event.factor *= numbers.factor
					},
				},
			},
			{
				id: 'longThrow',
				name: 'Long Throw',
				icon: svg(
					'<path class="ink-line" d="M4 40 Q20 4 40 20"/><circle class="tone" cx="40" cy="22" r="6"/>',
				),
				text: 'Undine learns to lob from the hip. Balloon reaches {range} farther.',
				stats: { balloon: { range: (v, n) => v + n.range } },
			},
		],
		// Level 4: the sprinkler.
		[
			{
				id: 'deepRoots',
				name: 'Deep Roots',
				icon: svg(
					'<path class="tone" d="M18 26 V8 H30 V26 Z"/><path class="ink-line" d="M24 26 V36 M24 36 L14 44 M24 36 L34 44 M24 32 L18 40"/>',
				),
				text: 'Undine is steadier on wet ground. While she stands in her own Sprinkler’s spray, she takes {fraction} less from every blow.',
				on: {
					damage({ hero, sim, event, numbers }) {
						if (event.target !== hero || !(event.damage > 0)) return
						const reach = hero.definition.abilities.slot2?.stats.radius ?? 0
						if (
							mine(sim, hero, 'sprinkler').some(
								(s) => near(s.body.position, hero.body.position) <= reach,
							)
						)
							event.damage *= 1 - numbers.fraction
					},
				},
			},
			{
				id: 'spray',
				name: 'Spray',
				icon: svg(
					'<path class="tone" d="M18 42 V20 H30 V42 Z"/><path class="ink-line" d="M6 18 L14 10 M24 14 V2 M42 18 L34 10"/>',
				),
				text: 'The Sprinkler is turned up to full. Once every {every}, every foe within its spray takes {damage:damage}.',
				on: {
					tick({ hero, sim, numbers, state, tick, ticks }) {
						if (tick < (state.next ?? 0)) return
						const sprinklers = mine(sim, hero, 'sprinkler')
						if (!sprinklers.length) return
						state.next = tick + ticks(numbers.every)
						const reach = hero.definition.abilities.slot2?.stats.radius ?? 0
						for (const s of sprinklers)
							hitFoes(
								sim,
								hero,
								s.body.position,
								reach,
								scaled(hero, numbers.damage),
								'sprinkler',
								'slot2',
							)
					},
				},
			},
			{
				id: 'longHose',
				name: 'Long Hose',
				icon: svg(
					'<path class="ink-line" d="M4 40 Q4 20 20 24 Q36 28 36 10"/><path class="tone" d="M30 4 H42 V12 H30 Z"/>',
				),
				text: 'Undine plants the Sprinkler from farther off, and it is ready {cooldown} sooner.',
				stats: {
					sprinkler: { range: (v, n) => v + n.range, cooldown: (v, n) => v - n.cooldown },
				},
			},
		],
		// Level 5: the slide.
		[
			{
				id: 'slick',
				name: 'Slick',
				icon: svg(
					'<path class="tone" d="M5 28 H32 V19 L45 32 L32 44 V36 H5 Z"/><path class="ink-line" d="M8 12 H40"/>',
				),
				text: 'The jug leaves the floor slick behind her. Slide is ready {cooldown} sooner.',
				stats: { slide: { cooldown: (v, n) => v - n.cooldown } },
			},
			{
				id: 'wake',
				name: 'Wake',
				icon: svg(
					'<path class="tone" d="M20 24 H44 L36 32 H20 Z"/><path class="ink-line" d="M4 18 Q12 24 4 30 M12 14 Q20 24 12 34"/>',
				),
				text: 'Undine’s belly-slide throws up a wave. Each foe within {radius} of her as she slides takes {damage:damage} and is [[Soaked|soak]].',
				on: {
					tick({ hero, sim, numbers, state }) {
						if (hero.dashAbility !== 'slide' || !hero.body.dashing) {
							state.struck = null
							return
						}
						state.struck ??= []
						for (const foe of foesNear(sim, hero, hero.body.position, numbers.radius)) {
							if (state.struck.includes(foe.id)) continue
							state.struck.push(foe.id)
							strike(sim, hero, foe, {
								ability: 'slide',
								slot: 'slot3',
								damage: scaled(hero, numbers.damage),
								talent: true,
							})
							if (!foe.unit.dead) sim.apply(foe.unit, 'balloon.soak', { source: hero.id })
						}
					},
				},
			},
			{
				id: 'splashdown',
				name: 'Splashdown',
				icon: svg(
					'<ellipse class="tone" cx="24" cy="36" rx="18" ry="6"/><path class="ink-line" d="M10 28 L6 18 M24 26 V12 M38 28 L42 18"/>',
				),
				text: 'Where Slide stops, the jug slops over. Every ally within {radius} of Undine is healed {heal}.',
				on: {
					tick({ hero, sim, numbers, state }) {
						const sliding = hero.dashAbility === 'slide' && hero.body.dashing
						if (state.sliding && !sliding && !hero.dead)
							for (const friend of alliesAround(sim, hero, hero.body.position, numbers.radius))
								sim.heal(hero, friend, numbers.heal, 'slide')
						state.sliding = sliding
					},
				},
			},
		],
		// Level 6: the spring's temper.
		[
			{
				id: 'stillWater',
				name: 'Still Water',
				icon: svg(
					'<path class="ink-line" d="M4 24 H44 M8 32 H40 M12 40 H36"/><circle class="tone" cx="24" cy="12" r="6"/>',
				),
				text: 'A [[Soaked|soak]] foe cannot put its weight behind a blow. Undine takes {fraction} less from anything soaked.',
				on: {
					damage({ hero, event, numbers, tick }) {
						if (event.target !== hero || !(event.damage > 0) || !event.source) return
						if (soaked(event.source, tick)) event.damage *= 1 - numbers.fraction
					},
				},
			},
			{
				id: 'wellspring',
				name: 'Wellspring',
				icon: svg(
					'<path class="tone" d="M24 6 Q36 24 36 32 Q36 42 24 42 Q12 42 12 32 Q12 24 24 6 Z"/><path class="ink-line" d="M24 18 V34 M16 26 H32"/>',
				),
				text: 'When a blow leaves Undine below {health} of her health, the spring in her rises and heals her {fraction} of it. This happens once every {cooldown}.',
				on: {
					damaged({ hero, sim, event, numbers, state, tick, ticks }) {
						if (event.target !== hero || hero.dead || tick < (state.next ?? 0)) return
						if (hero.hp / hero.maxHp >= numbers.health) return
						sim.heal(hero, hero, hero.maxHp * numbers.fraction, 'balloon')
						state.next = tick + ticks(numbers.cooldown)
					},
				},
			},
			{
				id: 'quickFill',
				name: 'Quick Fill',
				icon: svg(
					'<circle class="tone" cx="24" cy="22" r="14"/><path class="ink-line" d="M24 22 V12 M24 22 L32 26"/>',
				),
				text: 'Undine ties a balloon off without looking. Balloon is ready {cooldown} sooner.',
				stats: { balloon: { cooldown: (v, n) => v - n.cooldown } },
			},
		],
		// Level 7: the flood.
		[
			{
				id: 'flood',
				name: 'Flood',
				icon: svg(
					'<path class="ink-line" d="M4 30 Q14 20 24 30 Q34 40 44 30"/><path class="tone" d="M20 30 L4 44 M28 30 L44 44"/><circle class="tone" cx="24" cy="16" r="8"/>',
				),
				text: 'Balloon bursts like a dam. Every foe under it is thrown {distance} away from the splash.',
				on: {
					tick({ hero, sim, numbers, state }) {
						for (const balloon of burst(sim, hero, state)) {
							const at = balloon.body.position
							for (const foe of foesNear(sim, hero, at, BALLOON_RADIUS(hero)))
								shove(sim, foe.unit, at, numbers.distance, numbers.time)
						}
					},
				},
			},
			{
				id: 'monsoon',
				name: 'Monsoon',
				icon: svg(
					'<circle class="tone" cx="16" cy="18" r="10"/><circle class="tone" cx="32" cy="22" r="10"/><path class="ink-line" d="M12 34 L10 42 M22 36 L20 44 M32 36 L30 44"/>',
				),
				text: 'A balloon never bursts alone. {delay} after one bursts, a second wave falls on the same spot, healing allies and striking foes for {fraction} of the first.',
				on: {
					tick({ hero, sim, numbers, state, tick, ticks }) {
						state.waves ??= []
						for (const balloon of burst(sim, hero, state))
							state.waves.push({
								at: tick + ticks(numbers.delay),
								x: balloon.body.position.x,
								z: balloon.body.position.z,
							})
						if (!state.waves.length || hero.dead) return
						const stats = hero.definition.abilities.slot1?.stats
						if (!stats) return
						state.waves = state.waves.filter((wave) => {
							if (tick < wave.at) return true
							for (const friend of alliesAround(sim, hero, wave, stats.radius))
								sim.heal(hero, friend, stats.healAmount * numbers.fraction, 'balloon')
							hitFoes(
								sim,
								hero,
								wave,
								stats.radius,
								scaled(hero, stats.damage) * numbers.fraction,
								'balloon',
								'slot1',
							)
							return false
						})
					},
				},
			},
			{
				id: 'bottomlessJug',
				name: 'Bottomless Jug',
				icon: svg(
					'<path class="tone" d="M16 6 H32 V14 Q42 20 40 34 Q38 44 24 44 Q10 44 8 34 Q6 20 16 14 Z"/><path class="ink-line" d="M4 40 H44"/>',
				),
				text: 'Every Slide sloshes the jug full again. Slide makes Balloon ready at once.',
				after: {
					slide: {
						onRelease({ hero }) {
							const slot = slotOf(hero, 'balloon')
							if (slot >= 0) hero.cd[slot] = 0
						},
					},
				},
			},
		],
	],
}
