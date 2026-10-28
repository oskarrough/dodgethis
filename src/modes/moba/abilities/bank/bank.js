// Q: a line skillshot, first hit. It banks off cover and map edges (bounce is in the tune).
export default {
	name: 'Ricochet',
	kind: 'shot',
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="ink-line" d="M8 38 L24 10 L40 38"/><circle class="gold" cx="24" cy="10" r="5"/><path class="tone" d="M4 42 L44 42 L44 45 L4 45 Z"/></svg>',
	pierce: false,
	heal: false,
	catchable: true,
	aimAssist: true,
	tell: 'line',
	held: 'line',
	effects: { cast: true, projectile: true, hit: true, pose: 'bank' },
	card: {
		sentence: `Shoots a ball up to {range} that bounces off walls and cover up to {bank.bounce.max} times, hitting the first unit for {damage:damage} plus {bank.bounce.damagePerCushion:damage} per bounce.`,
	},
}
