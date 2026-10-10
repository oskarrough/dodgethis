// --- Tunables ----------------------------------------------------------------
// Moba's live values (docs/moba-plan.md, "Feel numbers"), shared by the debug GUI, the sim and DOM-free tests. Metres and seconds.
import { overthrowMap, overthrowTerrain } from './maps/overthrow-tune.js'
import { lobby } from './front/lobby-tune.js'
import * as tunes from './tunes.js'

export const tune = {
	testing: {
		speed: 1,
		speedMin: 0.25,
		speedMax: 16,
		speedStep: 0.25,
		seedMax: 0xffffffff,
		rosterMax: 24,
	},
	// Static layout and dressing: applies on mode restart.
	map: overthrowMap,
	overthrowTerrain,
	lobby,
	collision: { epsilon: 1e-6, separation: 1e-3, clampPasses: 8 },
	// The hero's movement profile (core/body.js). Obedience first: full speed in ~25 ms, a dead stop, no air.
	tower: {
		x: 18,
		hp: 1400,
		damage: 165,
		rate: 1,
		range: 7.75,
		radius: 1.5,
		speed: 16,
		tell: 0.3,
		ringNear: 3,
		height: 5,
	},
	fort: {
		hp: 1400,
		damage: 165,
		rate: 1,
		range: 7.75,
		radius: 1.5,
		speed: 16,
		tell: 0.3,
		ringNear: 3,
		height: 5,
	},
	// Flagfall's gatehouses (gates.js): no gun, low HP so a wave and a hero break one in ~10 s.
	// The radius spans the lane, so every enemy shot across it lands; depth is the wall's thickness.
	gatehouse: {
		hp: 1500,
		xp: 0, // a speed bump, not a prize: tower XP here snowballed matches shorter
		damage: 0,
		rate: 1,
		range: 0,
		radius: 3.5,
		depth: 1,
		speed: 16,
		tell: 0.3,
		ringNear: 3,
		height: 1.2,
	},
	// Flagfall's laser gates (gates.js), the second line between fort and core: same deal, a bit
	// tougher. Height is the posts'; the beam fills between them.
	laser: {
		hp: 2000,
		xp: 0,
		damage: 0,
		rate: 1,
		range: 0,
		radius: 3.5,
		depth: 0.6,
		speed: 16,
		tell: 0.3,
		ringNear: 3,
		height: 2.4,
	},
	core: {
		x: 40,
		hp: 6000,
		damage: 270,
		rate: 1,
		range: 9,
		radius: 3.5,
		speed: 16,
		tell: 0.3,
		ringNear: 3,
		height: 8.5,
	},
	levels: {
		cap: 10,
		first: 600,
		increment: 100,
		growth: 0.04,
		passive: 8,
		passiveStart: 30,
		takedown: 200,
		victimLevel: 40,
	},
	globes: { heal: 0.15, life: 15, pickup: 1, radius: 0.35, height: 0.6, spin: 2 },
	ball: {
		first: 60,
		interval: 150,
		lateInterval: 30,
		warning: 30,
		life: 45,
		channel: 0.75,
		pickup: 1,
		still: 0.15,
		carrySpeed: 0.85,
		range: 5,
		speed: 14,
		radius: 0.7,
		structureDamage: 0.2,
		damage: 300,
		stun: 0.75,
		silence: 6,
		lock: 1,
		tell: 0.3,
	},
	ballView: {
		radius: 0.7,
		height: 0.9,
		carryHeight: 3.4,
		segments: 48,
		ringWidth: 0.35,
		ringBorder: 0.05,
		ringY: 0.09,
		fillY: 0.105,
		channelRadius: 1.3,
		seamWidth: 0.035,
		flightEase: 0.1,
		teamRingRadius: 0.95,
		teamRingWidth: 0.09,
		shadowY: 0.12,
		aimY: 0.135,
		aimFillY: 0.15,
		aimBorder: 0.05,
		gagWidth: 2.4,
		gagHeight: 0.22,
		gagAngle: 0.4,
		throwSquash: -0.22,
		pickupSquash: 0.16,
	},
	base: { x: 44, heal: 0.1 },
	bots: {
		// Logic experiments: bot code may read `tune.bots.exp.<flag>` (truthy or a number) to switch a
		// behaviour variant; `bun run simulate --set bots.exp.<flag>=0,1` sweeps it. Empty on main: land the
		// winner as real code and delete its flag.
		exp: {},
		seed: 2,
		thinkTicks: 6,
		history: 2,
		fileSpacing: 3,
		retreatHp: 0.35,
		meleeRetreatHp: 0.5,
		recoverHp: 0.9,
		retreatDisadvantage: 1,
		supportRange: 12,
		fightRange: 9,
		hold: 0.5,
		sticky: 1,
		laneBehind: 3,
		goalTolerance: 1,
		globeRange: 6,
		burstWindow: 1.5,
		towerExposure: 2,
		stutter: 1,
		chaseHp: 0.25,
		chaseRange: 7,
		dodgeClearance: 0.6,
		zoneClearance: 0.5,
		ballPrepare: 10,
		// Flagfall's centre flag (tune.flagfall.flag): the team's this-many nearest heroes go for it
		// when it's up (or this many seconds before), unless below this share of HP.
		flagGo: 2,
		flagPrepare: 8,
		flagHp: 0.4,
		ballHp: 0.5,
		ballContestHp: 0.5,
		shadowRange: 8,
		escortAhead: 2,
		carrierFlank: 10,
		carrierDanger: 10,
		throwHeroRange: 4,
		throwMargin: 0.5,
		rainHeroes: 2,
		clearMinions: 2,
		siegeFile: 0,
		bruteEscort: 2,
		siegeMinions: 2,
		siegeBackoff: 1,
		siegeLowHp: 0.35,
		openingX: 8,
		// Flagfall's slick (tune.flagfall.dunk): step off it with an enemy hero this close; aim Rain this
		// far inland of a hero standing on it, so the shove goes out to sea.
		rotateRange: 28, // two-lane maps: join a teammate's fight this close, through the yard
		rotateQuiet: 14, // ... when no enemy hero is this close to you
		laneClaim: 6, // two-lane maps: a human this close to a lane claims it; bots take the others
		slickWary: 12,
		slickMargin: 0.5,
		dunkRain: 1.6,
		easy: {
			focusUntil: 300,
			humanAttackers: 1,
			reaction: 0.45,
			dodgeReaction: 0.3,
			jitter: 0.14,
			leadError: 0.35,
			dodge: 0.2,
			aggression: 0.3,
			slickCare: 0, // chance a bot minds the slick at all
			catchRate: 0.1,
		},
		normal: {
			reaction: 0.3,
			dodgeReaction: 0.2,
			jitter: 0.08,
			leadError: 0.2,
			dodge: 0.5,
			aggression: 0.6,
			slickCare: 0.5, // chance a bot minds the slick at all
			catchRate: 0.3,
		},
		hard: {
			reaction: 0.18,
			dodgeReaction: 0.12,
			jitter: 0.04,
			leadError: 0.1,
			dodge: 0.75,
			aggression: 0.9,
			slickCare: 0.75, // chance a bot minds the slick at all
			catchRate: 0.5,
		},
	},
	// Agent protocol settings apply on match start; not debug sliders.
	agents: {
		decision: 0.5,
		maxWait: 30,
		interruptDamage: 0.1,
		nearby: 12,
		observationBytes: 1000,
		precision: 10,
		maxSeconds: 900,
	},
	scripted: { think: 0.1, tell: 0.3, retreat: 0.35, recover: 0.9, file: 2, hold: 3 },
	proof: { batch: 3600, trace: 128 },
	hud: {
		bannerLife: 2.5,
		ending: 1.5,
		recapSources: 3,
		hoverDelay: 0.25, // a world unit's nameplate opens after the cursor rests this long
		longPress: 0.4, // touch hold that opens a HUD card
		inspectHold: 0.35, // pad Y hold that opens a card
		hpTick: 200, // HP per tick on the portrait bar
		warn: 5, // timers pulse in their last seconds
	},
	match: { objective: 180, late: 360, lateGunDamage: 0.05 }, // late is set per map (maps/index.js)
	// Fog of war (on unless ?fog=0): sight radii (m) per viewer, and the dim laid over unseen ground (rgb, alpha, px per m).
	fog: {
		sight: { hero: 10, minion: 7, structure: 10 },
		brush: 3, // m: a unit in brush shows only to a viewer this close
		color: '20, 18, 30',
		dim: 0.6,
		resolution: 2,
		height: 0.08,
	},
	waves: {
		first: 15,
		interval: 30,
		lateInterval: 20, // from match.late; shortens by lateStep each minute down to minInterval
		lateStep: 0.5,
		minInterval: 15,
		growth: 0.04,
		growthPeriod: 60,
		spawnX: 32,
		structureStandoff: 1,
		fileSpacing: 2,
		rowSpacing: 1.2,
		radius: 0.27,
		aggro: 6,
		leash: 8,
		laneZ: 5.5,
		helpHold: 2,
		soak: 12,
		structureXp: 300,
		abilityStructure: 0.25,
		reinforcement: 'melee', // one more per wave in a lane for each enemy fort taken in that lane
	},
	// Mercenary camps (Flagfall's jungle, `camps.js`): guards wait at the camp marks, fight back
	// within `leash` m of the mark, and heal after `calm` s alone. The last hit's team gets
	// `mercs` down the nearest lane; the camp returns `respawn` s later. `damage` scales the kind's.
	camps: {
		first: 45,
		respawn: 90,
		leash: 9,
		calm: 3,
		spread: 1.2,
		guards: [
			{ kind: 'brute', hp: 1100, damage: 0.5 },
			{ kind: 'melee', hp: 450, damage: 1 },
			{ kind: 'melee', hp: 450, damage: 1 },
		],
		mercs: [
			{ kind: 'brute', hp: 2400, damage: 1 },
			{ kind: 'melee', hp: 500, damage: 1.2 },
			{ kind: 'melee', hp: 500, damage: 1.2 },
		],
		// Bots: within `reach` m, above `hp` health and no enemy hero near, every `every`th
		// `period` s window (offset per bot) they clear the nearest camp.
		bots: { reach: 20, hp: 0.6, period: 20, every: 3 },
	},
	minions: {
		brute: {
			count: 1,
			hp: 3500,
			damage: 50,
			structureDamage: 2,
			rate: 0.67,
			range: 1.2,
			speed: 3,
			xp: 120,
			tell: 0.3,
		},
		melee: { count: 3, hp: 400, damage: 18, rate: 0.67, range: 0.9, speed: 3.5, xp: 40, tell: 0.3 },
		ranged: {
			count: 2,
			hp: 280,
			damage: 30,
			rate: 0.67,
			range: 5,
			speed: 3.5,
			xp: 40,
			tell: 0.3,
			shotSpeed: 16,
		},
		wizard: {
			count: 1,
			hp: 220,
			damage: 15,
			rate: 0.67,
			range: 3,
			speed: 3.5,
			xp: 40,
			tell: 0.3,
			shotSpeed: 14,
		},
	},
	hero: {
		hp: 1400,
		level: 1,
		speed: 5, // HotS 4.84; mounted 6.5
		accel: 40,
		friction: 14, // if it feels weightless, lower this first
		stopFriction: 30,
		stopSpeed: 2,
		airAccel: 40, // a flat lane: air behaves like ground
		airSpeedMul: 1,
		radius: 0.45,
		halfHeight: 0.6,
		jumpSpeed: 0,
		gravityMul: 1,
		coyoteTime: 0,
		turnRate: 1080, // degrees per second; facing is cosmetic and nothing waits on it
	},
	heroes: {},
	orders: {
		pick: 0.6, // an order this close to an enemy's silhouette attacks it
		attackMovePick: 3, // an attack-move click this close to an enemy's edge attacks the nearest one instead of walking
		carrot: 0.8, // the pursuit point runs this far ahead along the path
		arrival: 0.05, // done within this radius, with no easing
		stallProgress: 0.3, // repath when progress stays under this fraction of top speed…
		stallTime: 0.25, // …for this long
		grid: 0.5, // A* cell size
		replanDistance: 0.75, // target movement that invalidates an attack path
		rejoinDistance: 0.3, // a duplicate click replans if the hero was displaced this far from its path
		clearance: 0.1, // extra room kept from pillars beyond the body's radius
		attackRange: 5.5, // an attack order walks until the target is this close
		repeatPing: 0.1, // a held RMB re-aims every step; its small rings still drop at most this often
	},
	attack: {
		damage: 90,
		rate: 1,
		windup: 0.15,
		backswing: 0.25,
		speed: 24,
		radius: 0.12,
		visualScale: 0.65,
		critEvery: 5,
		critMultiplier: 1.2,
	},
	respawn: { base: 8, perLevel: 2 },
	momentum: { reduction: 2 },
	cast: { cancelLockout: 0.75, buffer: 0.4 }, // buffer: how early (s) a skill press may land and still fire on its first legal tick
	catching: { returnTell: 0.5, pocketLife: 6, bagLimit: 6 },
	// Every shot's flight, whoever throws it.
	projectile: {
		height: 1.1, // flight height, for presentation only
		nearMiss: 0.8, // a pass this close to a body's edge cues "close"
		cushionGap: 0.01, // m a bounced shot steps off the surface, so it can't touch it again at once
	},
	// The pad's right stick: hero + dir × range × remap(magnitude).
	stickAim: {
		inMin: 0.25,
		inMax: 0.9,
		outMin: 0.3,
		assistAngle: 10, // degrees: within this of an enemy hero, Q's aim bends toward it…
		assistBend: 0.6, // …by this fraction of the gap
	},
	follow: {
		viewPadding: 1.25,
		minHeight: 1,
		minFov: 0.01,
		fitIterations: 24,
		maxStep: 1 / 60, // camera/FOV spring integration, independent of render frequency
		pan: 20, // metres per second; free camera stays inside the floor
		edgePan: true,
		edgeBand: 32, // CSS pixels; capped to half the viewport on tiny windows
		edgeSpeed: 1, // fraction of pan speed; smoothstep from the band's inner boundary
		height: 20,
		back: 12.5, // pitch = atan(height / back) ≈ 58°
		fov: 40, // one lens on every map, close like HotS; the camera pans to the rims rather than zooming out
		rimShow: 10, // metres past each long walkable edge the view may reach, every map: enough to centre a hero in either shore lane
		response: 0.12, // seconds for the spring to cover ~90% of a step
		lookAhead: 0.25, // fraction of the way toward the aim point
		lookCap: 3,
	},
	dummies: {
		speed: 3.5,
		flipMin: 0.5, // seconds between strafe reversals, drawn uniformly
		flipMax: 1.4,
		span: 4, // metres either side of the post
		hp: 1400,
		tell: 0.4, // an enemy-visible line before the sparring dummy releases Q
		castEvery: 4, // one sparring dummy casts Loose back while in range
		respawn: 2,
	},
}

// The body's movement profile is the hero section; its extra keys are ignored by the body.
// Folder tunes (tunes.js): an ability's at tune[id], a hero's at tune.heroes[id], a map's keys at
// the top. An ability or hero id that is already a top-level key would shadow it, so it throws.
const claim = (key, owner) => {
	if (Object.hasOwn(tune, key)) throw new Error(`MOBA ${owner} collides with tune.${key}`)
}
for (const [id, numbers] of Object.entries(tunes.abilities)) {
	claim(id, `ability ${id}`)
	tune[id] = numbers
}
for (const [id, numbers] of Object.entries(tunes.heroes)) {
	claim(id, `hero ${id}`)
	if (Object.hasOwn(tune.heroes, id)) throw new Error(`MOBA hero ${id} has two tunes`)
	tune.heroes[id] = numbers
}
for (const [id, keys] of Object.entries(tunes.maps))
	for (const [key, numbers] of Object.entries(keys)) {
		claim(key, `map ${id}`)
		tune[key] = numbers
	}

export const profile = tune.hero
