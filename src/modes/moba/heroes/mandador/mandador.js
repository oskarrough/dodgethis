import { tune } from '../../tune.js'
import { mandadorCutoutDeath, mandadorCutoutTick, mandadorCutoutFrame } from './mandador-cutout.js'
import { mandadorBotDead } from './mandador-bots.js'

export default {
	unit: {
		hp: 'hp',
		radius: 'radius',
		speed: 'speed',
		attack: 'tennisBall',
		kit: { slot1: 'pass', slot2: 'tagOut', slot3: 'rallyRing' },
		traits: {
			onDeath: mandadorCutoutDeath,
			onTick: mandadorCutoutTick,
			onHit({ hero, shot, target, tick, ticks }) {
				if (hero.dead && shot.ability === 'outThrow' && target.hero)
					hero.respawnTick = Math.max(tick, hero.respawnTick - ticks(tune.outThrow.deathRefund))
			},
		},
	},
	name: 'Mandador',
	order: 4,
	color: 'cream',
	silhouette: 'bar',
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="tone" d="M8 8 H40 V38 H8 Z"/><path class="cream" d="M18 24 L38 16 V36 L18 28 Z"/><path class="ink-line" d="M20 28 V38"/></svg>',
	trait: () => ({
		name: 'Out, not gone',
		icon: 'outThrow',
		chip: `{outThrow.deathRefund}`,
		summary: `While dead, walk the touchline and throw. Each hero hit takes {outThrow.deathRefund} off your death timer.`,
	}),
	botDead: mandadorBotDead,
	outOfPlay: mandadorCutoutFrame,
}
