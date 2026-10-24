// E: a ball sent straight up. Its shadow grows on the mark until it lands; the ground stays hot.
export default {
	name: 'Lob',
	kind: 'zone', // delay, range and radius from tune, as Rain
	tell: 'circle',
	held: 'circle',
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><ellipse class="tone" cx="24" cy="39" rx="15" ry="5"/><path class="ink-line" d="M24 30 L24 16 M18 21 L24 15 L30 21"/><circle class="gold" cx="24" cy="8" r="5"/></svg>',
	effects: { cast: true, impact: true, shake: 'shakeRain' },
	card: {
		sentence: `Lobs a ball up to {range} that lands after {delay} for {damage:damage} in {radius}, then leaves hot ground for {fieldLife} that burns {burnDamage:damage} every {interval} and [[slows|slow]] by {fieldSlow}.`,
	},
	stages: {
		land: [
			{
				deliver: 'area',
				from: 'at',
				shape: 'circle',
				radius: 'radius',
				targets: 'enemies',
				hit: ['damage'],
			},
			{
				deliver: 'ground',
				radius: 'fieldRadius',
				lifetime: 'fieldLife',
				every: 'interval',
				enemies: [
					{ effect: 'damage', amount: 'burnDamage', periodic: true },
					{ effect: 'slow', magnitude: 'fieldSlow', while: 'inside', linger: 'interval' },
				],
			},
		],
	},
}
