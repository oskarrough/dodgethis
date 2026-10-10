import { tune } from '../../tune.js'

// W: a stance that opens a catch window in a cone; catching itself is engine code.
export default {
	kind: 'stance',
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="cream" d="M24 40 L8 14 A26 26 0 0 1 40 14 Z"/><path class="tone" d="M14 40 Q10 30 16 26 L22 30 L22 18 Q22 14 25 14 Q28 14 28 18 L28 28 L34 24 Q38 28 34 40 Z"/></svg>',
	catchesShots: true,
	acceptBall: true,
	held: 'cone',
	effects: { cast: 'catch', effect: 'catch', pose: 'catch' },
	card: {
		summary: () =>
			`Catch the first skillshot or Ball entering your cone for no damage. Until caught or disabled, take ${Math.round(tune.catch.damageReduction * 100)}% less damage from hits that still land while Catch is active.`,
	},
	// The catch window's fan, for any catcher (skills-view.js); Dive's window sits at diveY.
	look: {
		segments: 48,
		arcInset: 0.94,
		edgeWidth: 0.15,
		timerWidth: 0.08,
		timerGap: 0.025,
		stipplePixels: 3,
		arcLift: 0.005,
		catchY: 0.11,
		catchFillY: 0.125,
		diveY: 0.14,
	},
	onStart({ hero, sim, ability, slot, dir }) {
		sim.openCatch(hero, {
			ability: ability.id,
			dir,
			duration: ability.stats.duration,
			radius: ability.stats.radius,
			angle: ability.stats.angle,
			acceptBall: true,
			resetSlot: slot,
			resetCooldown: ability.stats.resetCooldown,
		})
	},
}
