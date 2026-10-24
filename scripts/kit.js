// The registry includes drafts: the sheet describes everything implemented, not just the lobby strip.
import { HEROES } from '../src/modes/moba/heroes.js'
import { abilityName, formatCardValue, heroTrait, plainText } from '../src/modes/moba/tooltip.js'

function kitNumbers(stats, scope) {
	const numbers = []
	for (const [key, value] of Object.entries(stats)) {
		if (key === 'cooldown' || key === 'botEnemies' || key === 'visualScale') continue
		if (Number.isFinite(value)) numbers.push(`${key} ${formatCardValue(`${scope}.${key}`, value)}`)
	}
	// Ricochet's gameplay numbers are nested; other nested blocks are view, sound and bots.
	for (const [key, value] of Object.entries(stats.bounce ?? {}))
		if (Number.isFinite(value))
			numbers.push(`bounce.${key} ${formatCardValue(`${scope}.bounce.${key}`, value)}`)
	return numbers.join(' · ')
}

const heroes = Object.values(HEROES).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
console.log(`MOBA kits · ${heroes.length} heroes · level 1 · live tune`)
console.log('Hero | Slot | Ability | Cooldown | Key numbers')
for (const hero of heroes) {
	for (const [slot, ability] of [['basic', hero.basic], ...Object.entries(hero.abilities)]) {
		if (!ability) continue
		const stats = ability.stats ?? ability
		const scope = ability.id ?? 'attack'
		const cooldown =
			stats.cooldown === undefined ? '—' : formatCardValue(`${scope}.cooldown`, stats.cooldown)
		console.log(
			`${hero.name} | ${slot} | ${ability.id ? abilityName(ability) : 'Basic attack'} | ${cooldown} | ${kitNumbers(stats, scope)}`,
		)
	}
	const trait = heroTrait(hero.id)
	if (trait) console.log(`${hero.name} | trait | ${trait.name} | — | ${plainText(trait.summary)}`)
}
