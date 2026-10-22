// E: a ball sent straight up. Its shadow grows on the mark until it lands; the ground stays hot.
export default {
	name: 'Lob',
	kind: 'zone', // delay, range and radius from tune, as Rain
	tell: 'circle',
	held: 'circle',
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><ellipse class="tone" cx="24" cy="39" rx="15" ry="5"/><path class="ink-line" d="M24 30 L24 16 M18 21 L24 15 L30 21"/><circle class="gold" cx="24" cy="8" r="5"/></svg>',
	// The impact names Rain's landing so your hit shakes the camera the same way.
	effects: { cast: true, impact: 'rain' },
	card: {
		summary:
			'Send a ball straight up. Its shadow marks the spot; after {delay} it lands for {damage:damage} in {radius}. The ground stays hot for {fieldLife}: {burnDamage:damage} every {interval} and slowed by {fieldSlow} inside.',
	},
	stages: {
		land: [
			{ deliver: 'area', from: 'at', shape: 'circle', targets: 'enemies', hit: ['damage'] },
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
