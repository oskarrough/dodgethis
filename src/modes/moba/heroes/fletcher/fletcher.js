import { tune } from '../../tune.js'

export default {
	unit: {
		hp: 'hp',
		radius: 'radius',
		speed: 'speed',
		kit: { slot1: 'loose', slot2: 'rain', slot3: 'vault' },
		traits: {
			onHit({ source, shot, target, ticks }) {
				if (shot.traitProcs !== false && shot.ability === 'loose' && target.hero && !source.dead)
					source.cd[2] = Math.max(0, source.cd[2] - ticks(tune.momentum.reduction))
			},
		},
	},
	name: 'Fletcher',
	order: 1,
	color: 'seaTeal',
	silhouette: 'circle',
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="ink-line" d="M30 30 L40 6 M33 31 L44 10 M27 29 L34 4"/><circle class="tone" cx="22" cy="28" r="15"/><circle class="cream" cx="17" cy="24" r="4"/></svg>',
	trait: () => ({
		name: 'Momentum',
		icon: 'momentum',
		chip: `−{momentum.reduction}`,
		summary: `Each Loose that hits a hero takes {momentum.reduction} off Vault's cooldown, so you can leap again sooner.`,
	}),
}
