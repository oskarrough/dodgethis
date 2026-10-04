// --- Tune GUI: moba's sections come and go with the run; the values live in tune.js and survive restarts. ---
// Each section maps a key to [min, max, step, label?, object?]. T is one clock step.
export const T = 'clock step'

const each = (keys, slider) => Object.fromEntries(keys.map((key) => [key, slider(key)]))
const structure = (x, hp, radius, damage) => ({
	hp: [100, hp, 100, 'HP (applies on restart)'],
	x: [...x, 1, 'position (applies on restart)'],
	radius: [0.5, radius, 0.1, 'radius (applies on restart)'],
	damage: [1, damage, 1],
	rate: [0.25, 3, 0.05],
	range: [1, 12, 0.25],
	speed: [1, 40, 1],
	tell: [0.3, 1, T],
})
const minion = {
	hp: [1, 5000, 1, 'HP (next spawn)'],
	damage: [1, 100, 1],
	rate: [0.1, 3, 0.05],
	range: [0.1, 8, 0.1],
	speed: [0, 8, 0.1],
	tell: [0.3, 1, T],
	xp: [0, 200, 1],
}
const bots = (preset) => ({
	...each(['reaction', 'dodgeReaction'], () => [T, 1, T]),
	...each(['jitter', 'leadError', 'dodge', 'aggression', 'catchRate'], () => [0, 1, 0.01]),
	...(preset === 'easy' && {
		focusUntil: [T, 600, T, 'early duel rule (s)'],
		humanAttackers: [1, 3, 1, 'early human duelists'],
	}),
})
const sound = {
	freq: [20, 2400, 10],
	slideTo: [20, 2400, 10],
	dur: [T, 0.6, T],
	gain: [0, 1, 0.01],
}

// [name, tune object, sliders] in GUI order.
export function sliderSections(tune, setup) {
	const sections = {
		tower: structure([10, 25], 6000, 2, 300),
		fort: structure([26, 43], 10000, 3, 400),
		core: structure([26, 43], 10000, 3, 400),
		levels: {
			...each(['cap', 'first', 'increment'], (key) => [
				1,
				key === 'cap' ? 10 : 2000,
				1,
				`${key} (applies on restart)`,
			]),
			growth: [0, 1, 0.01, 'growth (on next level)'],
			passive: [0, 100, 1],
			passiveStart: [T, 120, T],
			takedown: [0, 1000, 1],
			victimLevel: [0, 100, 1],
		},
		Ball: {
			...each(['carrySpeed', 'structureDamage'], () => [0, 1, 0.01]),
			first: [30, 600, T, 'first (applies on restart)'],
			...each(['interval', 'lateInterval'], (key) => [30, 600, T, `${key} (next scheduling)`]),
			warning: [T, 30, T, 'warning (next warning)'],
			life: [T, 45, T, 'life (next spawn)'],
			...each(['channel', 'stun', 'silence', 'lock'], (key) => [T, 30, T, `${key} (next action)`]),
			tell: [0.3, 1, T, 'tell (next throw)'],
			speed: [1, 40, 0.1, 'speed (next throw)'],
			range: [1, 12, 0.1, 'range (next throw)'],
			radius: [0.1, 1, 0.05, 'radius (next throw)'],
			pickup: [0.1, 2, 0.1],
			damage: [0, 1000, 10],
		},
		globes: { heal: [0, 1, 0.01], life: [T, 60, T, 'life (next drop)'], pickup: [0.1, 3, 0.1] },
		base: { x: [43, 48, 1], heal: [0, 1, 0.01] },
		'bots easy': bots('easy'),
		'bots normal': bots('normal'),
		'bots hard': bots('hard'),
		bots: {
			seed: [0, tune.testing.seedMax, 1, 'seed (applies on restart)', setup],
			thinkTicks: [1, 60, 1],
			rainHeroes: [1, 3, 1],
			bruteEscort: [1, 3, 1],
			siegeFile: [-4, 4, 1],
			...each(['retreatHp', 'recoverHp', 'ballHp', 'chaseHp'], () => [0, 1, 0.01]),
			fileSpacing: [0, 4, 0.1, 'files (applies on restart)'],
		},
		match: { late: [T, 1200, T], lateGunDamage: [0, 1, 0.01] },
		waves: {
			first: [T, 30, T, 'first wave (applies on restart)'],
			interval: [T, 60, T, 'interval (next scheduling)'],
			lateInterval: [T, 60, T, 'late interval (next scheduling)'],
			growth: [0, 1, 0.01, 'growth (next spawn)'],
			aggro: [1, 10, 0.25],
			helpHold: [T, 5, T],
			leash: [1, 12, 0.25],
			soak: [1, 20, 0.5],
		},
		melee: minion,
		ranged: minion,
		wizard: minion,
		brute: minion,
		hero: {
			hp: [200, 3000, 100, 'HP (applies on restart)'],
			speed: [1, 12, 0.1],
			accel: [1, 80, 1],
			friction: [0, 40, 0.5],
			stopFriction: [0, 60, 0.5, 'stop friction'],
			stopSpeed: [0, 6, 0.1, 'stop speed'],
			turnRate: [90, 3600, 30, 'turn rate (°/s)'],
		},
		attack: {
			damage: [10, 300, 5],
			rate: [0.25, 3, 0.05],
			windup: [T, 0.5, T],
			backswing: [T, 0.5, T],
			speed: [8, 60, 1],
			radius: [0.05, 0.5, 0.01],
			visualScale: [0.1, 1, 0.05],
		},
		respawn: { base: [T, 20, T], perLevel: [T, 5, T] },
		momentum: { reduction: [0, 4, 0.25, 'Vault recharge (s)'] },
		orders: {
			pick: [0, 2, 0.05, 'attack pick (m)'],
			carrot: [0.1, 3, 0.05, 'carrot (m)'],
			arrival: [0.01, 0.5, 0.01, 'arrival (m)'],
			rejoinDistance: [0.05, 1, 0.05, 'rejoin after displacement (m)'],
			stallProgress: [0, 1, 0.05, 'repath below ×'],
			stallTime: [0.05, 1, 0.05, 'repath after (s)'],
			clearance: [0, 0.5, 0.01, 'obstacle clearance'],
			attackRange: [1, 10, 0.25, 'attack range'],
		},
		loose: {
			damage: [10, 500, 10],
			speed: [6, 60, 0.5, 'speed (m/s)'],
			range: [3, 30, 0.5],
			radius: [0.05, 1.5, 0.05],
			castPoint: [T, 0.5, T, 'cast point (s)'],
			cooldown: [0.2, 10, 0.1, 'cooldown (s)'],
			nearMiss: [0, 2, 0.05, 'near miss (m)'],
		},
		rain: {
			damage: [10, 500, 10],
			castPoint: [0, 1, T],
			range: [1, 20, 0.25],
			radius: [0.1, 6, 0.1],
			delay: [T, 3, T],
			slow: [0, 1, 0.01],
			duration: [0.1, 5, 0.1],
			cooldown: [0.2, 15, 0.1],
		},
		vault: {
			castPoint: [0, 1, T],
			range: [0.5, 10, 0.25],
			time: [T, 1, T],
			cooldown: [0.2, 10, 0.1],
		},
		stickAim: {
			inMin: [0, 1, 0.01, 'stick from'],
			inMax: [0, 1, 0.01, 'stick to'],
			outMin: [0, 1, 0.01, 'reach from ×'],
			assistAngle: [0, 30, 0.5, 'assist (°)'],
			assistBend: [0, 1, 0.05, 'assist bend'],
		},
		follow: {
			pan: [5, 40, 0.5, 'pan (m/s)'],
			height: [5, 40, 0.5],
			back: [0, 30, 0.5],
			fov: [20, 70, 1],
			response: [0.02, 0.6, 0.01, 'pad response (s)'],
			edgeInset: [0.5, 0.95, 0.01, 'base framing ×'],
			lookAhead: [0, 0.6, 0.01, 'pad look ahead ×'],
			lookCap: [0, 8, 0.25, 'pad look cap (m)'],
		},
		dummies: {
			speed: [0, 8, 0.25],
			flipMin: [0.1, 3, 0.05, 'flip min (s)'],
			flipMax: [0.1, 4, 0.05, 'flip max (s)'],
			span: [0.5, 10, 0.5, 'span (m)'],
			hp: [200, 3000, 100, 'HP on respawn'],
			tell: [0.3, 1, T, 'Q warning (s)'],
			castEvery: [1, 10, 0.25, 'cast interval'],
			respawn: [0.2, 10, 0.1, 'respawn (s)'],
		},
		...Object.fromEntries(Object.keys(tune.sounds).map((name) => [`sound ${name}`, sound])),
		juice: {
			...each(['attackSquash', 'castSquash', 'vaultSquash', 'rainSquash'], () => [-0.3, 0.3, 0.01]),
			flash: [0, 0.3, 0.01, 'hit flash (s)'],
			hitstop: [0, 0.3, 0.005, 'hitstop (s)'],
			shakeTaken: [0, 1, 0.05, 'shake on you'],
			shakeTakedown: [0, 1, 0.05, 'shake takedown'],
		},
	}
	const object = (name) =>
		name === 'Ball'
			? tune.ball
			: name.startsWith('bots ')
				? tune.bots[name.slice(5)]
				: name.startsWith('sound ')
					? tune.sounds[name.slice(6)]
					: (tune.minions[name] ?? tune[name])
	return Object.entries(sections).map(([name, sliders]) => [name, object(name), sliders])
}

// One GUI folder per section; T resolves to the run's clock step.
export function addSliders(debug, sections, step) {
	const at = (v) => (v === T ? step : v)
	for (const [name, object, sliders] of sections)
		debug.tune(name, object, (f) => {
			for (const [key, [min, max, by, label, target = object]] of Object.entries(sliders)) {
				const slider = f.add(target, key, at(min), at(max), at(by))
				if (label) slider.name(label)
			}
		})
}
