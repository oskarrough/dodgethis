import { wataBot } from './wata-bot.js'

export default {
	unit: {
		hp: 'hp',
		radius: 'radius',
		speed: 'speed',
		attack: 'waterFlick',
		kit: { slot1: 'balloon', slot2: 'sprinkler', slot3: 'slide' },
		brain: wataBot,
	},
	name: 'Wata',
	order: 6,
	color: 'seaTeal',
	silhouette: 'circle',
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><ellipse class="tone" cx="21" cy="29" rx="17" ry="15"/><path class="cream" d="M14 8 H28 V19 H14 Z M34 22 L45 12 V27 L35 32 Z"/><path class="ink-line" d="M11 13 Q2 7 4 26"/></svg>',
}
