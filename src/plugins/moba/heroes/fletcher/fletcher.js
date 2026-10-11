import { tune } from '../../tune.js'

const n = (v) => Number(v.toFixed(2))

export default {
	kit: { slot1: 'loose', slot2: 'rain', slot3: 'vault' },
	name: 'Fletcher',
	order: 1,
	color: 'blue',
	silhouette: 'circle',
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="ink-line" d="M30 30 L40 6 M33 31 L44 10 M27 29 L34 4"/><circle class="tone" cx="22" cy="28" r="15"/><circle class="cream" cx="17" cy="24" r="4"/></svg>',
	trait: () => ({
		name: 'Momentum',
		icon: 'momentum',
		chip: `−${n(tune.momentum.reduction)}s`,
		summary: `Loose hitting a hero cuts Vault's cooldown by ${n(tune.momentum.reduction)} s.`,
	}),
	traits: {
		onHit({ source, shot, target, ticks }) {
			if (shot.traitProcs !== false && shot.ability === 'loose' && target.hero && !source.dead)
				source.cd[1] = Math.max(0, source.cd[1] - ticks(tune.momentum.reduction))
		},
	},
}
