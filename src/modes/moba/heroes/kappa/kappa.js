export default {
	// Keywords this folder's cards may name with [[Term]] (glossary.js).
	terms: {
		pocket: [
			'Pocket',
			"Kappa's trait: a caught shot waits in the glove for {catching.pocketLife}, and Toss throws it back.",
		],
	},
	unit: {
		hp: 'hp',
		radius: 'radius',
		speed: 'speed',
		attack: 'gloveSlap',
		kit: { slot1: 'toss', slot2: 'catch', slot3: 'dive' },
		traits: {
			onDeath({ hero }) {
				hero.body.cancelDash()
				hero.dashAbility = null
			},
		},
	},
	name: 'Kappa',
	order: 2,
	color: 'terracotta',
	silhouette: 'square',
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect class="tone" x="9" y="13" width="30" height="27" rx="8"/><path class="cream" d="M30 9 Q34 6 37 9 L38 18 L31 19 Z M37 22 Q42 20 44 24 L40 31 L36 28 Z"/><circle class="cream" cx="18" cy="24" r="4"/></svg>',
	returnPose: 'toss',
	trait: () => ({
		name: 'Pocket',
		icon: 'pocket',
		chip: `{catching.pocketLife}`,
		summary: `A caught shot waits in your glove for {catching.pocketLife}; Toss throws it back.`,
	}),
}
