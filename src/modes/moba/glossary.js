import { fillCardTemplate } from './card-text.js'
import { HEROES } from './heroes.js' // before ability.js, which only loads after heroes.js
import { ABILITIES } from './ability.js'
import mechanics from './mechanics/all-mechanics.js'

// Keywords a card's sentence may name with [[Term]]: one sentence each, numbers read from tune.
// A card that names a term missing here fails the effect check. The shared statuses and mechanics
// (statuses.js, ability-effects.js) are listed below; a hero, ability or mechanic folder declares
// its own in `terms`, so removing the folder removes its keywords.
const SHARED = {
	stun: ['Stun', "A stunned unit can't move, cast, catch or pick up the Ball until it wears off."],
	slow: ['Slow', 'Moves slower by the share shown; only the strongest slow on a unit counts.'],
	haste: ['Haste', 'Moves faster by the share shown, for as long as it lasts.'],
	freeze: ['Freeze', "A frozen hero can't move, cast, catch or pick up the Ball until it thaws."],
	shield: ['Shield', 'Takes damage before your HP does, until it breaks or runs out.'],
	knockback: ['Knockback', 'Pushed straight away from the hit; it cancels a dash.'],
	cleanse: ['Cleanse', 'Removes every Stun, Freeze and Slow on the unit.'],
	skillshot: [
		'Skillshot',
		'Flies where you aim and stops on the first unit it meets, so it can be dodged or caught.',
	],
}
// Gathered on first use: the folders import code that imports this module back.
let terms = null
function TERMS() {
	if (terms) return terms
	terms = { ...SHARED }
	for (const [id, manifest] of [
		...Object.entries(ABILITIES),
		...Object.entries(HEROES),
		...Object.entries(mechanics),
	])
		for (const [term, entry] of Object.entries(manifest.terms ?? {})) {
			if (Object.hasOwn(terms, term)) throw new Error(`MOBA duplicate glossary term: ${id} ${term}`)
			terms[term] = entry
		}
	return terms
}

export const glossaryTerms = () => Object.keys(TERMS())
export const hasTerm = (id) => Object.hasOwn(TERMS(), id)

// { name, sentence } for a term, numbers filled from the live tune; null for an unknown term.
export function glossary(id) {
	if (!hasTerm(id)) return null
	const [name, template] = TERMS()[id]
	return { name, sentence: fillCardTemplate(template, `glossary.${id}`) }
}
