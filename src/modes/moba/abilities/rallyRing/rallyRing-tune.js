export default {
	castPoint: 0.3, // the megaphone goes up; enemies see the ring fill where it will land
	range: 8,
	radius: 3.5,
	duration: 5,
	pulse: 0.25,
	haste: 0.25,
	slow: 0.3,
	linger: 0.5, // a step out of the ring keeps the effect this long
	cooldown: 14,
	bot: { reach: 1.5 }, // a teammate within this many ring radii of the mark
	sound: {
		cast: { freq: 880, slideTo: 1320, type: 'square', dur: 0.14, gain: 0.08 },
	},
	view: {
		chalkWidth: 0.16,
		dashes: 18, // chalk strokes around the rim
		dashFill: 0.7, // share of each stroke that is chalk
		draw: 0.25, // seconds for the chalk to go round
		spin: 0.25, // rad/s the rim creeps, the way a crowd circles
		dust: 10,
		dustSize: 0.12,
		dustRise: 0.6,
		dustLife: 0.9,
		fade: 0.5, // seconds the ring takes to rub out at the end
	},
}
