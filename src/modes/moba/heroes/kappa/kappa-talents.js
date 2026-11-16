import { foesNear, scaled, shove, slotOf, statusOn, strike } from '../../talent-kit.js'

// Kappa's tree (talents.js): row n opens at level 2 + n. Numbers in kappa-tune.js under `talents`.
// Nothing in Altamesa throws a shot she can catch, so the tree leans on the slap, Toss, Catch as a
// brace against blows, and Dive.
const slap = (event, hero) =>
	event.source === hero && event.shot?.slot === 'primary' && !event.shot.talent
const toss = (event, hero) =>
	event.source === hero && event.shot?.ability === 'toss' && !event.shot.talent
const svg = (body) => `<svg viewBox="0 0 48 48" aria-hidden="true">${body}</svg>`
const catching = (hero, tick) => hero.stance?.ability === 'catch' && hero.stance.until > tick
const struck = (event, hero) =>
	event.target === hero && event.source?.body && event.source.team !== hero.team

export default {
	// What a bot takes in each row: the blows that hold a crowd still, and the shell that holds a Warden.
	bot: [1, 1, 0, 2, 0, 1],
	rows: [
		// Level 2: the slap.
		[
			{
				id: 'skippingStone',
				name: 'Skipping Stone',
				icon: svg(
					'<ellipse class="tone" cx="12" cy="34" rx="8" ry="4"/><path class="ink-line" d="M20 30 Q26 22 30 30 Q34 20 40 28"/>',
				),
				text: 'Every Glove Slap that lands takes {cut} off the wait for Toss. A keeper who stays close keeps her glove in the air.',
				on: {
					hit({ hero, event, numbers, ticks }) {
						if (!slap(event, hero)) return
						const slot = slotOf(hero, 'toss')
						if (slot >= 0) hero.cd[slot] = Math.max(0, hero.cd[slot] - ticks(numbers.cut))
					},
				},
			},
			{
				id: 'wetHand',
				name: 'Wet Hand',
				icon: svg(
					'<path class="tone" d="M10 30 V16 H16 V28 M16 14 H22 V28 M22 14 H28 V28 M28 18 H34 V34 Q34 42 26 42 H18 Q10 42 10 30 Z"/><path class="ink-line" d="M38 10 Q42 16 38 20 M44 18 Q46 22 44 26"/>',
				),
				text: 'Kappa slaps with a hand still wet from the river. Whatever she strikes is slowed by {slow} for {duration}, and has to wade after her.',
				on: {
					hit({ hero, sim, event, numbers }) {
						if (!slap(event, hero) || event.lethal) return
						sim.apply(event.target, 'rain.slow', {
							source: hero.id,
							mag: 1 - numbers.slow,
							duration: numbers.duration,
						})
					},
				},
			},
			{
				id: 'undertow',
				name: 'Undertow',
				icon: svg(
					'<path class="ink-line" d="M44 16 Q30 10 20 18 Q12 26 22 30 Q30 32 26 24"/><circle class="tone" cx="8" cy="36" r="6"/>',
				),
				text: 'One Glove Slap in {every} catches its foe by the scruff and drags it {distance} toward Kappa, off whoever it was chewing on.',
				on: {
					hit({ hero, sim, event, numbers, state }) {
						if (!slap(event, hero) || event.lethal) return
						state.count = ((state.count ?? 0) + 1) % numbers.every
						if (state.count === 0)
							shove(sim, event.target, hero.body.position, -numbers.distance, numbers.time)
					},
				},
			},
		],
		// Level 3: the throw.
		[
			{
				id: 'longArm',
				name: 'Long Arm',
				icon: svg(
					'<path class="ink-line" d="M4 30 H32"/><circle class="tone" cx="38" cy="30" r="7"/><path class="ink-line" d="M6 22 H14 M6 38 H14"/>',
				),
				text: 'Kappa learns to throw from the shoulder. Toss flies {range} farther and {speed} faster.',
				stats: { toss: { range: (v, n) => v + n.range, speed: (v, n) => v + n.speed } },
			},
			{
				id: 'splash',
				name: 'Splash',
				icon: svg(
					'<circle class="tone" cx="24" cy="30" r="7"/><path class="ink-line" d="M10 22 L4 14 M24 18 V8 M38 22 L44 14 M8 36 H2 M40 36 H46"/>',
				),
				text: 'Toss lands like a stone in a pond. Every other foe within {radius} of the one it strikes takes {fraction} of the blow.',
				on: {
					hit({ hero, sim, event, numbers }) {
						if (!toss(event, hero) || !(event.damage > 0)) return
						const at = event.target.body.position
						for (const foe of foesNear(sim, hero, at, numbers.radius))
							if (foe.unit !== event.target)
								strike(sim, hero, foe, {
									ability: 'toss',
									slot: event.shot.slot,
									damage: event.damage * numbers.fraction,
									from: at,
									talent: true,
								})
					},
				},
			},
			{
				id: 'fullSwing',
				name: 'Full Swing',
				icon: svg(
					'<path class="ink-line" d="M8 38 Q8 12 34 10"/><circle class="tone" cx="38" cy="12" r="6"/><path class="ink-line" d="M34 24 H46 M36 32 H46"/>',
				),
				text: 'Kappa puts her whole back into Toss. The foe it strikes is thrown {distance} away from her.',
				on: {
					hit({ hero, sim, event, numbers }) {
						if (!toss(event, hero) || event.lethal) return
						shove(sim, event.target, hero.body.position, numbers.distance, numbers.time)
					},
				},
			},
		],
		// Level 4: the brace.
		[
			{
				id: 'hardShell',
				name: 'Hard Shell',
				icon: svg(
					'<path class="tone" d="M6 34 Q6 12 24 12 Q42 12 42 34 Z"/><path class="ink-line" d="M14 34 L18 20 M24 34 V14 M34 34 L30 20"/>',
				),
				text: 'Kappa learns to tuck in behind her shell. Catch turns aside {damageReduction} more of every blow it does not catch.',
				stats: { catch: { damageReduction: (v, n) => v + n.damageReduction } },
			},
			{
				id: 'longHold',
				name: 'Long Hold',
				icon: svg(
					'<path class="cream" d="M24 40 L8 14 A26 26 0 0 1 40 14 Z"/><path class="ink-line" d="M24 40 V22 M24 22 L32 18"/>',
				),
				text: 'Catch stays open {duration} longer, but the glove takes {cooldown} longer to come back.',
				stats: {
					catch: { duration: (v, n) => v + n.duration, cooldown: (v, n) => v + n.cooldown },
				},
			},
			{
				id: 'biteBack',
				name: 'Bite Back',
				icon: svg(
					'<path class="tone" d="M8 16 H40 L34 24 L28 18 L22 24 L16 18 Z"/><path class="tone" d="M8 34 H40 L34 28 L28 34 L22 28 L16 34 Z"/>',
				),
				text: 'While Kappa holds Catch, whoever strikes her from within {range} takes {damage:damage} back. River things do not like being poked.',
				on: {
					damaged({ hero, sim, event, numbers, tick }) {
						if (!struck(event, hero) || !catching(hero, tick)) return
						const source = event.source
						const p = source.body.position
						const q = hero.body.position
						if (Math.hypot(p.x - q.x, p.z - q.z) > numbers.range + source.body.radius) return
						const foe = foesNear(sim, hero, p, 0).find((f) => f.unit === source)
						if (foe)
							strike(sim, hero, foe, {
								ability: 'catch',
								slot: 'slot2',
								damage: scaled(hero, numbers.damage),
								talent: true,
							})
					},
				},
			},
		],
		// Level 5: the dive.
		[
			{
				id: 'bellyFlop',
				name: 'Belly Flop',
				icon: svg(
					'<rect class="tone" x="10" y="20" width="28" height="12" rx="6"/><path class="ink-line" d="M4 40 H44 M8 14 L12 18 M40 14 L36 18"/>',
				),
				text: 'Kappa lands from Dive flat on her front, and the whole court hears it. Every foe within {radius} takes {damage:damage}.',
				stages: {
					dive: {
						dashEnd({ hero, sim, numbers }) {
							if (hero.dead) return
							for (const foe of foesNear(sim, hero, hero.body.position, numbers.radius))
								strike(sim, hero, foe, {
									ability: 'dive',
									slot: 'slot3',
									damage: scaled(hero, numbers.damage),
									talent: true,
								})
						},
					},
				},
			},
			{
				id: 'quickUp',
				name: 'Quick Up',
				icon: svg(
					'<path class="ink-line" d="M8 40 H40"/><rect class="tone" x="16" y="14" width="16" height="22" rx="5"/><path class="ink-line" d="M24 4 V10"/>',
				),
				text: 'Kappa has learned to push off the bottom. Dive carries her {range} farther and is ready {cooldown} sooner.',
				stats: {
					dive: { range: (v, n) => v + n.range, cooldown: (v, n) => v - n.cooldown },
				},
			},
			{
				id: 'shellUp',
				name: 'Shell Up',
				icon: svg(
					'<path class="tone" d="M6 36 Q6 14 24 14 Q42 14 42 36 Z"/><path class="ink-line" d="M4 40 H44"/>',
				),
				text: 'Lying [[Prone]] after Dive, Kappa is only shell. She takes {fraction} less from every blow until she gets up.',
				on: {
					damage({ hero, event, numbers, tick }) {
						if (event.target !== hero || !(event.damage > 0)) return
						if (statusOn(hero, 'dive.prone', tick)) event.damage *= 1 - numbers.fraction
					},
				},
			},
		],
		// Level 6: the keeper's temper.
		[
			{
				id: 'insult',
				name: 'Insult',
				icon: svg(
					'<circle class="tone" cx="18" cy="26" r="10"/><path class="ink-line" d="M30 18 L44 10 M30 26 H46 M30 34 L44 42"/>',
				),
				text: 'A Toss that strikes a Warden is taken personally. Kappa becomes the thing it hates most, by {threat} to spare.',
				on: {
					hit({ hero, sim, event, numbers }) {
						const threat = event.target?.threat
						if (!toss(event, hero) || !threat) return
						const top = Math.max(0, ...Object.values(threat))
						const gap = top - (threat[hero.id] ?? 0) + numbers.threat
						sim.dungeon?.addThreat(hero.id, gap, event.target)
					},
				},
			},
			{
				id: 'riverBlood',
				name: 'River Blood',
				icon: svg(
					'<path class="tone" d="M24 6 Q36 24 36 32 Q36 42 24 42 Q12 42 12 32 Q12 24 24 6 Z"/><path class="ink-line" d="M18 32 Q24 36 30 32"/>',
				),
				text: 'Blows that land on Kappa while she holds Catch only make her stronger. She heals {fraction} of every one of them.',
				on: {
					damaged({ hero, sim, event, numbers, tick }) {
						if (!struck(event, hero) || hero.dead || !catching(hero, tick)) return
						if (event.damage > 0) sim.heal(hero, hero, event.damage * numbers.fraction, 'catch')
					},
				},
			},
			{
				id: 'secondGlove',
				name: 'Second Glove',
				icon: svg(
					'<circle class="tone" cx="16" cy="24" r="8"/><circle class="tone" cx="34" cy="24" r="8"/><path class="ink-line" d="M16 38 H34"/>',
				),
				text: 'Kappa keeps a spare glove in her shell. Toss is ready {cooldown} sooner.',
				stats: { toss: { cooldown: (v, n) => v - n.cooldown } },
			},
		],
		// Level 7: the old river's way.
		[
			{
				id: 'ricochet',
				name: 'Ricochet',
				icon: svg(
					'<path class="ink-line" d="M4 36 L22 14 L44 32"/><circle class="tone" cx="22" cy="14" r="6"/><circle class="tone" cx="44" cy="32" r="4"/>',
				),
				text: 'Toss comes off its first foe still flying. It strikes the nearest other foe within {radius} for {fraction} of the blow.',
				on: {
					hit({ hero, sim, event, numbers }) {
						if (!toss(event, hero) || !(event.damage > 0)) return
						const at = event.target.body.position
						const next = foesNear(sim, hero, at, numbers.radius)
							.filter((foe) => foe.unit !== event.target)
							.sort(
								(a, b) => Math.hypot(a.x - at.x, a.z - at.z) - Math.hypot(b.x - at.x, b.z - at.z),
							)[0]
						if (next)
							strike(sim, hero, next, {
								ability: 'toss',
								slot: event.shot.slot,
								damage: event.damage * numbers.fraction,
								from: at,
								talent: true,
							})
					},
				},
			},
			{
				id: 'oldShell',
				name: 'Old Shell',
				icon: svg(
					'<path class="tone" d="M6 36 Q6 10 24 10 Q42 10 42 36 Z"/><path class="ink-line" d="M12 28 H36 M16 20 H32 M20 36 L24 10 L28 36"/>',
				),
				text: 'Kappa’s shell has seen worse than this. Below {health} of her health she takes {fraction} less from every blow.',
				on: {
					damage({ hero, event, numbers }) {
						if (event.target !== hero || !(event.damage > 0)) return
						if (hero.hp / hero.maxHp < numbers.health) event.damage *= 1 - numbers.fraction
					},
				},
			},
			{
				id: 'coldCurrent',
				name: 'Cold Current',
				icon: svg(
					'<path class="ink-line" d="M4 18 Q14 12 24 18 Q34 24 44 18 M4 30 Q14 24 24 30 Q34 36 44 30"/><circle class="tone" cx="24" cy="40" r="5"/>',
				),
				text: 'Kappa comes up out of a Dive cold and angry. Her next {count} Glove Slaps deal {factor} damage.',
				stages: {
					dive: {
						dashEnd({ state, numbers }) {
							state.left = numbers.count
						},
					},
				},
				on: {
					amplify({ hero, event, numbers, state }) {
						if (!slap(event, hero) || !(state.left > 0)) return
						event.factor *= numbers.factor
						state.left--
					},
				},
			},
		],
	],
}
