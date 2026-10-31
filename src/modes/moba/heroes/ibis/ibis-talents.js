import { tune } from '../../tune.js'
import { foesNear, scaled, slotOf, statusOn, strike } from '../../talent-kit.js'

// Ibis's tree (talents.js): row n opens at level 2 + n. Numbers in ibis-tune.js under `talents`.
const loose = (event, hero) => event.source === hero && event.shot?.ability === 'loose'
const svg = (body) => `<svg viewBox="0 0 48 48" aria-hidden="true">${body}</svg>`

export default {
	// What a bot takes in each row: the reeds that pass through a pack, and the leaps that pay.
	bot: [0, 0, 2, 0, 2, 0],
	rows: [
		// Level 2: the draw.
		[
			{
				id: 'splitReed',
				name: 'Split Reed',
				icon: svg(
					'<path class="ink-line" d="M6 38 L42 10"/><circle class="tone" cx="18" cy="29" r="6"/><circle class="tone" cx="31" cy="19" r="6"/>',
				),
				text: 'Loose no longer stops at the first body. The reed passes through every foe in its line, though each takes only {factor} of the blow.',
				ability: { loose: { pierce: true } },
				on: {
					amplify({ hero, event, numbers }) {
						if (loose(event, hero)) event.factor *= numbers.factor
					},
				},
			},
			{
				id: 'quickNock',
				name: 'Quick Nock',
				icon: svg(
					'<path class="ink-line" d="M8 34 L30 12 M14 40 L36 18 M20 46 L42 24"/><circle class="cream" cx="38" cy="10" r="5"/>',
				),
				text: 'Ibis stops taking careful aim. Loose draws in {castPoint} and is ready again after {cooldown}, but a hasty reed strikes for only {factor} of its weight.',
				stats: {
					loose: { castPoint: (_, n) => n.castPoint, cooldown: (_, n) => n.cooldown },
				},
				on: {
					amplify({ hero, event, numbers }) {
						if (loose(event, hero)) event.factor *= numbers.factor
					},
				},
			},
			{
				id: 'farMark',
				name: 'Far Mark',
				icon: svg(
					'<circle class="cream" cx="34" cy="14" r="9"/><circle class="tone" cx="34" cy="14" r="4"/><path class="ink-line" d="M6 42 L26 22"/>',
				),
				text: 'A reed that has flown {far} or more before it strikes deals {factor} damage. Keep your distance and let the heron do the rest.',
				on: {
					amplify({ hero, event, numbers }) {
						if (loose(event, hero) && (event.shot.travelled ?? 0) >= numbers.far)
							event.factor *= numbers.factor
					},
				},
			},
		],
		// Level 3: the leap.
		[
			{
				id: 'kickOff',
				name: 'Kick Off',
				icon: svg(
					'<ellipse class="cream" cx="18" cy="36" rx="13" ry="5"/><path class="ink-line" d="M10 30 L18 20 L26 30 M18 20 L36 6"/>',
				),
				text: 'Ibis leaves the ground hard. Foes within {radius} of where she Vaults from take {damage:damage} and are slowed by {slow} for {duration}.',
				stages: {
					vault: {
						release({ hero, sim, numbers }) {
							for (const foe of foesNear(sim, hero, hero.body.position, numbers.radius)) {
								sim.apply(foe.unit, 'rain.slow', {
									source: hero.id,
									mag: 1 - numbers.slow,
									duration: numbers.duration,
								})
								strike(sim, hero, foe, {
									ability: 'vault',
									slot: 'slot3',
									damage: scaled(hero, numbers.damage),
								})
							}
						},
					},
				},
			},
			{
				id: 'secondLeap',
				name: 'Second Leap',
				icon: svg(
					'<path class="tone" d="M6 36 L16 26 L16 31 L24 31 L24 41 L16 41 L16 46 Z"/><path class="tone" d="M22 20 L32 10 L32 15 L40 15 L40 25 L32 25 L32 30 Z"/>',
				),
				text: 'Vault can be taken twice in a row, the second leap within {window} of the first. Only then does its cooldown begin, and it runs {cooldown} longer.',
				stats: { vault: { cooldown: (v, n) => v + n.cooldown } },
				on: {
					cast({ hero, event, numbers, state, tick, ticks }) {
						if (event.source !== hero || event.ability?.id !== 'vault') return
						const slot = slotOf(hero, 'vault')
						if (state.until != null && tick <= state.until) {
							state.until = null // the second leap: the full cooldown stands
							return
						}
						state.full = hero.cd[slot]
						state.from = tick
						state.until = tick + ticks(numbers.window)
						hero.cd[slot] = ticks(numbers.gap)
					},
					tick({ hero, state, tick }) {
						if (state.until == null || tick <= state.until) return
						// The second leap never came: the cooldown runs from the first.
						const slot = slotOf(hero, 'vault')
						hero.cd[slot] = Math.max(hero.cd[slot], state.full - (tick - state.from))
						state.until = null
					},
				},
			},
			{
				id: 'lightLanding',
				name: 'Light Landing',
				icon: svg(
					'<path class="ink-line" d="M10 8 Q24 30 38 40"/><ellipse class="cream" cx="34" cy="40" rx="10" ry="4"/><path class="tone" d="M30 10 L42 12 L36 22 Z"/>',
				),
				text: 'The first arrow Ibis shoots within {window} of landing a Vault deals {factor} damage. Leap, then loose.',
				stages: {
					vault: {
						dashEnd({ state, tick }) {
							state.landed = tick
						},
					},
				},
				on: {
					amplify({ hero, event, numbers, state, tick, ticks }) {
						if (event.source !== hero || event.shot?.slot !== 'primary' || state.landed == null)
							return
						if (tick - state.landed <= ticks(numbers.window)) event.factor *= numbers.factor
						state.landed = null
					},
				},
			},
		],
		// Level 4: the rain.
		[
			{
				id: 'cloudburst',
				name: 'Cloudburst',
				icon: svg(
					'<ellipse class="cream" cx="24" cy="36" rx="21" ry="8"/><path class="ink-line" d="M10 6 L12 30 M24 4 L24 32 M38 6 L36 30"/>',
				),
				text: 'Rain gathers longer and spreads wider. Its circle grows by {radius}, and the reeds take {delay} more to fall.',
				stats: { rain: { radius: (v, n) => v + n.radius, delay: (v, n) => v + n.delay } },
			},
			{
				id: 'pinned',
				name: 'Pinned',
				icon: svg(
					'<ellipse class="cream" cx="24" cy="36" rx="14" ry="6"/><path class="ink-line" d="M16 8 L20 36 M32 8 L28 36"/><circle class="tone" cx="24" cy="30" r="5"/>',
				),
				text: 'Rain pins rather than hinders. Foes it strikes are slowed by {slow}, but only for {duration}.',
				stats: { rain: { slow: (_, n) => n.slow, duration: (_, n) => n.duration } },
			},
			{
				id: 'markedGround',
				name: 'Marked Ground',
				icon: svg(
					'<ellipse class="cream" cx="20" cy="34" rx="15" ry="6"/><path class="ink-line" d="M20 34 L44 8"/><path class="tone" d="M36 6 L44 6 L44 14 Z"/>',
				),
				text: 'Foes still slowed by your Rain take {factor} damage from Loose. Rain first, then the reed.',
				on: {
					amplify({ hero, event, numbers, tick }) {
						if (loose(event, hero) && statusOn(event.target, 'rain.slow', tick, hero.id))
							event.factor *= numbers.factor
					},
				},
			},
		],
		// Level 5: momentum.
		[
			{
				id: 'anyQuarry',
				name: 'Any Quarry',
				icon: svg(
					'<circle class="tone" cx="14" cy="34" r="7"/><circle class="tone" cx="34" cy="34" r="7"/><circle class="tone" cx="24" cy="16" r="7"/><path class="ink-line" d="M4 8 L44 44"/>',
				),
				text: '[[Momentum]] answers to any quarry. A Loose that strikes a pack beast or a summoned thing shortens Vault as a hero would.',
				traits: {
					onHit({ source, shot, target, ticks }) {
						if (shot.traitProcs === false || shot.ability !== 'loose' || target.hero || source.dead)
							return
						const slot = slotOf(source, 'vault')
						source.cd[slot] = Math.max(0, source.cd[slot] - ticks(tune.momentum.reduction))
					},
				},
			},
			{
				id: 'heronsRhythm',
				name: "Heron's Rhythm",
				icon: svg(
					'<path class="ink-line" d="M6 30 Q16 12 24 30 T42 30"/><path class="ink-line" d="M14 10 L16 22 M30 10 L32 22"/>',
				),
				text: '[[Momentum]] carries into the sky. Each Loose that hits a hero also takes {reduction} off Rain.',
				traits: {
					onHit({ source, shot, target, ticks, numbers }) {
						if (
							shot.traitProcs === false ||
							shot.ability !== 'loose' ||
							!target.hero ||
							source.dead
						)
							return
						const slot = slotOf(source, 'rain')
						source.cd[slot] = Math.max(0, source.cd[slot] - ticks(numbers.reduction))
					},
				},
			},
			{
				id: 'overleap',
				name: 'Overleap',
				icon: svg(
					'<path class="ink-line" d="M6 40 Q24 -4 42 40"/><path class="tone" d="M36 30 L44 42 L32 40 Z"/>',
				),
				text: 'Every Vault nocks a fresh reed, so Loose is ready the moment you land. Vault itself takes {cooldown} longer to come back.',
				stats: { vault: { cooldown: (v, n) => v + n.cooldown } },
				stages: {
					vault: {
						release({ hero }) {
							hero.cd[slotOf(hero, 'loose')] = 0
						},
					},
				},
			},
		],
		// Level 6: the hunter's nerve.
		[
			{
				id: 'startle',
				name: 'Startle',
				icon: svg(
					'<path class="ink-line" d="M24 6 L24 20 M10 12 L16 22 M38 12 L32 22"/><circle class="tone" cx="24" cy="34" r="10"/>',
				),
				text: 'Ibis startles like her namesake. When a blow lands on her, Vault is ready at once; she can be startled once every {cooldown}.',
				on: {
					damaged({ hero, event, numbers, state, tick, ticks }) {
						if (event.target !== hero || !(event.damage > 0) || tick < (state.next ?? 0)) return
						hero.cd[slotOf(hero, 'vault')] = 0
						state.next = tick + ticks(numbers.cooldown)
					},
				},
			},
			{
				id: 'stillWater',
				name: 'Still Water',
				icon: svg(
					'<path class="ink-line" d="M4 34 H44 M10 40 H38"/><path class="tone" d="M24 6 L28 30 L20 30 Z"/>',
				),
				text: 'Stand still for {time} and the heron’s patience is paid: your next Loose deals {factor} damage.',
				on: {
					tick({ hero, event, state }) {
						const v = hero.body.velocity
						state.still = Math.hypot(v.x, v.z) < 0.1 ? (state.still ?? 0) + event.dt : 0
					},
					cast({ hero, event, numbers, state }) {
						if (event.source === hero && event.ability?.id === 'loose')
							state.aimed = (state.still ?? 0) >= numbers.time
					},
					amplify({ hero, event, numbers, state }) {
						if (!loose(event, hero) || !state.aimed) return
						event.factor *= numbers.factor
						state.aimed = false
					},
				},
			},
			{
				id: 'featherfall',
				name: 'Featherfall',
				icon: svg(
					'<path class="tone" d="M24 4 Q36 18 24 40 Q12 18 24 4 Z"/><path class="ink-line" d="M24 8 V44"/>',
				),
				text: 'Ibis lands as soft as down. Every Vault ends with a [[Shield]] of {amount:HP} that lasts {duration}.',
				stages: {
					vault: {
						dashEnd({ hero, sim, numbers }) {
							sim.apply(hero, 'swig.shield', {
								source: hero,
								amount: scaled(hero, numbers.amount),
								duration: numbers.duration,
							})
						},
					},
				},
			},
		],
		// Level 7: the whole quiver.
		[
			{
				id: 'threeReeds',
				name: 'Three Reeds',
				icon: svg(
					'<path class="ink-line" d="M8 40 L40 8 M8 40 L44 22 M8 40 L26 4"/><path class="tone" d="M34 6 L42 6 L42 14 Z"/>',
				),
				text: 'Ibis looses the whole quiver at once. Loose flies as a fan of three reeds, {spread} apart, and each strikes in full.',
				stages: {
					loose: {
						release({ hero, sim, dir, ability, numbers }) {
							const stats = ability.stats
							for (const sign of [-1, 1]) {
								const a = (sign * numbers.spread * Math.PI) / 180
								sim.launchShot(
									hero,
									{
										x: dir.x * Math.cos(a) - dir.z * Math.sin(a),
										z: dir.x * Math.sin(a) + dir.z * Math.cos(a),
									},
									{
										ability: 'loose',
										slot: 'slot1',
										pierce: ability.pierce,
										catchable: ability.catchable,
										isAbility: true,
										speed: stats.speed,
										radius: stats.radius,
										range: stats.range,
										damage: scaled(hero, stats.damage),
									},
								)
							}
						},
					},
				},
			},
			{
				id: 'secondVolley',
				name: 'Second Volley',
				icon: svg(
					'<ellipse class="cream" cx="24" cy="38" rx="18" ry="6"/><path class="ink-line" d="M12 6 L14 28 M22 4 L22 28 M30 10 L30 32 M38 8 L36 30"/>',
				),
				text: 'Rain falls twice. A second volley lands on the same circle {delay} after the first.',
				stages: {
					rain: {
						land({ hero, sim, event, numbers, state, tick, ticks, ability }) {
							state.echoes ??= []
							if (state.echoes.includes(tick)) {
								state.echoes = state.echoes.filter((t) => t !== tick)
								return
							}
							const left = ticks(numbers.delay)
							state.echoes.push(tick + left)
							sim.zones.push({
								id: sim.nextId(),
								owner: hero.id,
								team: hero.team,
								x: event.point.x,
								z: event.point.z,
								left,
								total: left,
								ability: 'rain',
								slot: `slot${slotOf(hero, 'rain') + 1}`,
								radius: ability.stats.radius,
							})
						},
					},
				},
			},
			{
				id: 'kingfisher',
				name: 'Kingfisher',
				icon: svg(
					'<path class="tone" d="M4 30 L18 20 L18 26 L36 26 L36 34 L18 34 L18 40 Z"/><circle class="cream" cx="40" cy="30" r="5"/><path class="ink-line" d="M22 14 L30 14 M24 46 L32 46"/>',
				),
				text: 'Vault carries Ibis through her foes like a kingfisher through water. Each foe within {radius} of her flight takes {damage:damage}.',
				on: {
					cast({ hero, event, state }) {
						if (event.source === hero && event.ability?.id === 'vault') state.struck = []
					},
					tick({ hero, sim, numbers, state }) {
						if (hero.dashAbility !== 'vault' || !hero.body.dashing) return
						state.struck ??= []
						for (const foe of foesNear(sim, hero, hero.body.position, numbers.radius)) {
							if (state.struck.includes(foe.id)) continue
							state.struck.push(foe.id)
							strike(sim, hero, foe, {
								ability: 'vault',
								slot: 'slot3',
								damage: scaled(hero, numbers.damage),
							})
						}
					},
				},
			},
		],
	],
}
