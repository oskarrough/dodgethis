// Tune GUI: moba's sections come and go with the run; the values live in tune.js and survive restarts.
// Each section maps a key to [min, max, step, label?, object?]. T is one clock step.
import { ABILITIES } from './ability.js'
import { maps } from './maps/all-maps.js'
import { units } from '../../core/units.js'
import { resolveUnit, unitResolver } from './units.js'

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
// Undescribed slider bounds come from the declared dimension, never the number's spelling.
const numbers = (stats, path) =>
	Object.fromEntries(
		Object.entries(stats ?? {})
			.filter(([, v]) => typeof v === 'number')
			.map(([key, v]) => {
				const unit = units[resolveUnit(`${path}.${key}`)]
				const [min, max] = unit?.range ?? [0, 1]
				return [key, [Math.min(min, v), Math.max(max, v), unit?.step ?? 0.01]]
			}),
	)
const sound = {
	freq: [20, 2400, 10],
	slideTo: [20, 2400, 10],
	dur: [T, 0.6, T],
	gain: [0, 1, 0.01],
}

// [path, tune or look object, sliders] in GUI order; `bots/easy` is tune.bots.easy. `camera` is the run's follow tune.
export function sliderSections(tune, look, setup, mapId = setup.map, camera = tune.follow) {
	const sections = {
		tower: structure([10, 25], 6000, 2, 300),
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
		ball: {
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
		base: { x: [43, 48, 1], fullHealSeconds: [T, 12, T] },
		recall: { channel: [T, 8, T], open: [T, 10, T], cooldown: [0, 30, 1] },
		bots: {
			seed: [0, tune.testing.seedMax, 1, 'seed (applies on restart)', setup],
			thinkTicks: [1, 60, 1],
			rainHeroes: [1, 3, 1],
			bruteEscort: [1, 3, 1],
			siegeFile: [-4, 4, 1],
			...each(
				['retreatHp', 'meleeRetreatHp', 'recoverHp', 'ballHp', 'chaseHp', 'siegeLowHp'],
				() => [0, 1, 0.01],
			),
			openingX: [0, 17, 0.5],
			fileSpacing: [0, 4, 0.1, 'files (applies on restart)'],
		},
		'bots/easy': bots('easy'),
		'bots/normal': bots('normal'),
		'bots/hard': bots('hard'),
		match: {
			late: [T, 1200, T, 'late', maps[mapId]?.debugTune?.late ?? tune.match],
			lateGunDamage: [0, 1, 0.01],
		},
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
		'minions/melee': minion,
		'minions/ranged': minion,
		'minions/wizard': minion,
		'minions/brute': minion,
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
		catch: { damageReduction: [0, 1, 0.01, 'landed damage reduction'] },
		cast: {
			cancelLockout: [T, 2, T, 'cancel lockout (s)'],
			buffer: [T, 1, T, 'press buffer (s)'],
		},
		hud: { tipGrace: [0, 1, 0.05, 'card grace'] },
		orders: {
			pick: [0, 2, 0.05, 'attack pick (m)'],
			attackMovePick: [0, 8, 0.25, 'attack-move pick (m)'],
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
		},
		projectile: { nearMiss: [0.05, 2, 0.05, 'near miss (m)'] },
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
			lookAhead: [0, 0.6, 0.01, 'pad look ahead ×'],
			lookCap: [0, 8, 0.25, 'pad look cap (m)'],
			edgeBand: [8, 128, 1, 'edge pan band (px)', camera],
			edgeSpeed: [0, 1, 0.01, 'edge pan speed × pan', camera],
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
		...Object.fromEntries(Object.keys(look.sounds).map((name) => [`sounds/${name}`, sound])),
		out: {
			width: [1, 8, 0.1, 'stamp width (m)'],
			slam: [T, 0.5, T, 'slam (s)'],
			slamScale: [1, 3, 0.05, 'slam from ×'],
			squish: [0, 0.3, 0.01, 'land squish ×'],
			tilt: [0, 20, 1, 'tilt (°)'],
			opacity: [0.1, 1, 0.01],
			life: [1, 60, 1, 'print life (s)'],
			hold: [0, 1, 0.05, 'full strength ×'],
			streak: [1, 15, 0.5, 'streak window (s)'],
			tweet: [T, 0.3, T, 'tweet (s)'],
			warble: [0.01, 0.1, 0.005, 'warble (s)'],
			kick: [0, 5, 0.1, 'camera kick'],
		},
		card: {
			fall: [T, 1, T, 'fall (s)'],
			bounce: [T, 0.5, T, 'bounce (s)'],
			press: [T, 0.5, T, 'press (s)'],
			hold: [0, 3, 0.05, 'hold (s)'],
			fade: [T, 2, T, 'fade (s)'],
			flat: [0.05, 1, 0.01, 'pressed to ×'],
			rebound: [0, 0.3, 0.01, 'rebound ×'],
			tint: [0, 1, 0.01, 'ink tint'],
		},
		squeak: {
			turn: [60, 180, 5, 'turn (°)'],
			speed: [0, 1, 0.05, 'min speed ×'],
			window: [T, 1, T, 'run memory (s)'],
			cooldown: [0.1, 3, 0.05, 'cooldown (s)'],
			fatigue: [T, 10, 0.25, 'fatigue window (s)'],
			quieter: [0, 1, 0.05, 'fatigue gain ×'],
		},
		damageNumbers: {
			enabled: [0, 1, 1, 'on'],
			height: [0.2, 2, 0.05],
			y: [0, 5, 0.1],
			life: [0.2, 3, 0.05],
			fade: [0.05, 1, 0.05],
			rise: [0, 3, 0.05, 'rise (m)'],
			drift: [0, 1.5, 0.05, 'drift (m)'],
			popIn: [0.01, 0.5, 0.01, 'pop in (s)'],
			overshoot: [0, 5, 0.1],
			spread: [0, 2, 0.05],
			punch: [1, 3, 0.05, 'crit punch ×', look.damageNumbers.crit],
			tilt: [0, 0.5, 0.01, 'crit tilt (rad)', look.damageNumbers.crit],
			min: [0.2, 2, 0.05, 'smallest ×', look.damageNumbers.sizing],
			max: [0.2, 3, 0.05, 'largest ×', look.damageNumbers.sizing],
			growth: [0, 1, 0.01, 'growth per 10× damage', look.damageNumbers.sizing],
			crit: [1, 3, 0.05, 'crit ×', look.damageNumbers.sizing],
			xp: [0.1, 2, 0.05, 'XP ×', look.damageNumbers.sizing],
		},
		juice: {
			...each(['attackSquash', 'castSquash', 'vaultSquash', 'rainSquash'], () => [-0.3, 0.3, 0.01]),
			flash: [0, 0.3, 0.01, 'hit flash (s)'],
			hitstop: [0, 0.3, 0.005, 'hitstop (s)'],
			shakeTaken: [0, 1, 0.05, 'shake on you'],
			shakeTakedown: [0, 1, 0.05, 'shake when you die'],
		},
	}
	for (const id of Object.keys(ABILITIES)) sections[id] ??= numbers(tune[id], id)
	const dig = (root, path) => path.split('/').reduce((o, key) => o?.[key], root)
	const object = (path) => dig(tune, path) ?? dig(look, path)
	const unitAt = unitResolver({ ...look, ...tune })
	return Object.entries(sections).map(([path, sliders]) => [path, object(path), sliders, unitAt])
}

// What a fresh Tuner shows in a match, in players' words: section → [heading, { tune key: label }],
// headings in this order (Try Mode's game speed comes first).
const FEATURED = {
	hero: ['hero', { speed: 'Run speed' }],
	attack: ['hero', { damage: 'Attack damage', rate: 'Attack speed' }],
	respawn: ['hero', { base: 'Respawn time' }],
	ball: ['ball', { speed: 'Throw speed', carrySpeed: 'Carrier speed' }],
	follow: ['camera', { height: 'Height', fov: 'Lens' }],
	juice: ['feel', { hitstop: 'Hit pause', shakeTaken: 'Shake when hit' }],
}
const RANK = { hero: 1, ball: 2, camera: 3, feel: 4 }

// Top-level groups for sections that aren't already nested in tune. Abilities group as they do on disk.
const groups = {
	hero: ['levels', 'respawn', 'momentum', 'attack', 'cast', 'projectile'],
	controls: ['follow', 'stickAim', 'orders'],
	lane: ['match', 'tower', 'core', 'base', 'recall', 'ball', 'globes', 'waves', 'dummies'],
	feel: ['hud', 'out', 'card', 'squeak', 'damageNumbers', 'juice'],
}

// Where a tune section sits in the panel: `loose` is abilities/loose, `levels` is hero/levels, `bots/easy` stays.
export function debugPath(path) {
	if (ABILITIES[path]) return `abilities/${path}`
	const group = Object.keys(groups).find((name) => groups[name].includes(path))
	return group ? `${group}/${path}` : path
}

// One folder per section, sorted by panel path; T resolves to the run's clock step. `more[path](folder, object)` adds non-slider controls.
export function addSliders(debug, sections, step, more = {}) {
	const at = (v) => (v === T ? step : v)
	const placed = sections.map(([path, ...rest]) => [debugPath(path), path, ...rest])
	placed.sort(([a], [b]) => (a < b ? -1 : 1))
	for (const [where, path, object, sliders, unitAt] of placed) {
		const units = (o, key, dotted) =>
			unitAt?.(o, key) ?? resolveUnit(`${path.replaceAll('/', '.')}.${dotted}`)
		const build = (f) => {
			for (const [key, [min, max, by, label, target = object]] of Object.entries(sliders)) {
				const slider = f.add(target, key, at(min), at(max), at(by))
				if (label) slider.name(label)
			}
			more[path]?.(f, object)
			for (const controller of f.controllers)
				controller.unit =
					unitAt?.(controller.object, controller.property) ??
					resolveUnit(`${path.replaceAll('/', '.')}.${controller.property}`)
		}
		const [group, featured] = FEATURED[path] ?? []
		debug.tune(where, object, { units, featured, group, rank: RANK[group] }, build)
	}
}
