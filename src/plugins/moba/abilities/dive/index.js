// E: a dash that catches shots all around on the way, then leaves the diver prone.
export default {
	kind: 'dash',
	catchesShots: true,
	acceptBall: false,
	held: 'arrow',
	effects: { cast: 'dive', effect: 'dive', pose: 'dive' },
	card: {
		summary: () => 'Dive toward your aim, catching shots all around on the way, then lie prone.',
	},
	onRelease({ hero, sim, ability }) {
		sim.openCatch(hero, {
			ability: ability.id,
			duration: ability.stats.time + ability.stats.prone,
			radius: ability.stats.radius,
			angle: ability.stats.angle,
			acceptBall: false,
		})
	},
	onDashEnd({ hero, tick, ticks, ability }) {
		hero.proneUntil = tick + ticks(ability.stats.prone)
		if (hero.catchWindow) hero.catchWindow.until = hero.proneUntil
	},
}
