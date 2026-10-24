export default {
	hp: 1500,
	speed: 5,
	bot: { saveHp: 0.6 },
	view: {
		width: 0.75,
		height: 0.7,
		depth: 0.65,
		neckRadius: 0.25,
		neckHeight: 0.28,
		neckY: 0.72,
		spoutLength: 0.65,
		spoutRadius: 0.19,
		spoutX: 0.65,
		spoutY: 0.52,
		handleRadius: 0.36,
		handleTube: 0.09,
		handleX: -0.65,
		handleY: 0.46,
		flickTilt: 0.25,
		balloonTilt: 0.5,
		sprinklerTilt: 0.3,
		slideTilt: 1.3,
		releaseSnap: 0.1,
		releaseRecover: 0.3,
	},
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	'heroes.undine.view.releaseSnap': 's',
	'heroes.undine.view.releaseRecover': 's',
}
