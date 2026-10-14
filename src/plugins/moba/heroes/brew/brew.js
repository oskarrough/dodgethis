import { brewBot } from './brew-bot.js'

export default {
	name: 'Brew',
	order: 5,
	color: 'gold',
	silhouette: 'hexagon',
	basic: 'palmStrike',
	kit: { slot1: 'flyingKick', slot2: 'stagger', slot3: 'swig' },
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="tone" d="M12 7 H36 L45 24 L36 41 H12 L3 24 Z"/><path class="cream" d="M28 10 H36 V28 H28 Z"/></svg>',
	trait: () => ({
		name: 'Stagger',
		icon: 'pocket',
		summary: 'Stagger banks incoming damage. Swig shields the repayment.',
	}),
	bot: brewBot,
}
