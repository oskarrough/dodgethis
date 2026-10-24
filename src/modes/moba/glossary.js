import { fillCardTemplate } from './card-text.js'

// Keywords a card's sentence may name with [[Term]]: one sentence each, numbers read from tune.
// One source of truth; a card that names a term missing here fails the effect check.
// The terms are the statuses and mechanics the kits apply (statuses.js, ability-effects.js, the
// abilities' own `statuses`, the hero traits and the Ball).
const TERMS = {
	stun: [
		'Stun',
		"A stunned unit can't move, cast, catch or pick up the Ball; the Ball stuns for {ball.stun}.",
	],
	slow: ['Slow', 'Moves slower by the share shown; only the strongest slow on a unit counts.'],
	haste: ['Haste', 'Moves faster by the share shown, for as long as it lasts.'],
	freeze: ['Freeze', "A frozen hero can't move, cast, catch or pick up the Ball until it thaws."],
	prone: ['Prone', "Lying flat after Dive for {dive.prone}: you can't move or cast."],
	shield: ['Shield', 'Takes damage before your HP does, until it breaks or runs out.'],
	soak: ['Soak', 'Soaked enemies move {balloon.slow} slower for {balloon.duration}.'],
	bruise: [
		'Bruise',
		'Takes {slam.bruiseDamage:damage} every {slam.bruiseEvery} for {slam.bruiseDuration}.',
	],
	stagger: [
		'Stagger',
		'Damage taken in the stance is banked, then repaid evenly over {stagger.payout} after it ends.',
	],
	momentum: [
		'Momentum',
		"Fletcher's trait: each Loose that hits a hero takes {momentum.reduction} off Vault's cooldown.",
	],
	pocket: [
		'Pocket',
		"Mitts's trait: a caught shot waits in the glove for {catching.pocketLife}, and Toss throws it back.",
	],
	silence: ['Silence', 'A structure hit by the Ball stops shooting for {ball.silence}.'],
	knockback: ['Knockback', 'Pushed straight away from the hit; it cancels a dash.'],
	cleanse: ['Cleanse', 'Removes every Stun, Freeze and Slow on the unit.'],
	skillshot: [
		'Skillshot',
		'Flies where you aim and stops on the first unit it meets, so it can be dodged or caught.',
	],
}

export const glossaryTerms = () => Object.keys(TERMS)
export const hasTerm = (id) => Object.hasOwn(TERMS, id)

// { name, sentence } for a term, numbers filled from the live tune; null for an unknown term.
export function glossary(id) {
	if (!hasTerm(id)) return null
	const [name, template] = TERMS[id]
	return { name, sentence: fillCardTemplate(template, `glossary.${id}`) }
}
