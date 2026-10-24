import { oolongBot } from './oolong-bot.js'

export default {
	unit: {
		hp: 'hp',
		radius: 'radius',
		speed: 'speed',
		attack: 'palmStrike',
		kit: { slot1: 'flyingKick', slot2: 'stagger', slot3: 'swig' },
		brain: oolongBot,
	},
	name: 'Oolong',
	order: 5,
	color: 'driftwood',
	silhouette: 'hexagon',
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="tone" d="M12 7 H36 L45 24 L36 41 H12 L3 24 Z"/><path class="cream" d="M28 10 H36 V28 H28 Z"/></svg>',
	trait: () => ({
		name: 'Stagger',
		icon: 'pocket',
		summary:
			"[[Stagger]] banks the damage you take and repays it later; Swig's [[Shield]] soaks the repayment.",
	}),
}
