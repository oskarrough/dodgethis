// Fletcher's abilities, spread into tune (tune.loose, tune.rain, tune.vault) by tune.js.

export const fletcher = {
	// Q, Loose: a line skillshot, first hit.
	loose: {
		damage: 230, // about 2.5 autos: worth the aim, the miss risk and Mitts's catch
		castPoint: 0.3,
		range: 11,
		speed: 20, // Ground line plus flight gives an 8 m dodge deadline of about 0.52 s.
		radius: 0.3,
		cooldown: 4,
	},
	rain: {
		damage: 180,
		castPoint: 0,
		range: 7,
		radius: 2.5,
		delay: 0.7,
		slow: 0.3,
		duration: 1.5,
		cooldown: 6,
	},
	vault: { castPoint: 0, range: 4, time: 0.18, cooldown: 3 },
}
