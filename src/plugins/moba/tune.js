// --- Tunables ----------------------------------------------------------------
// Moba's live values (docs/moba-plan.md, "Feel numbers"), shared by the debug GUI, the sim and DOM-free tests. Metres and seconds.
export const tune = {
	// The hero's movement profile (core/body.js). Obedience first: full speed in ~25 ms, a dead stop, no air.
	hero: {
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
	orders: {
		pick: 0.6, // an order this close to an enemy's silhouette attacks it
		carrot: 0.8, // the pursuit point runs this far ahead along the path
		arrival: 0.05, // done within this radius, with no easing
		stallProgress: 0.3, // repath when progress stays under this fraction of top speed…
		stallTime: 0.25, // …for this long
		grid: 0.5, // A* cell size
		clearance: 0.1, // extra room kept from pillars beyond the body's radius
		attackRange: 5.5, // an attack order walks until the target is this close
	},
	// Q, Loose: a line skillshot, first hit.
	loose: {
		castPoint: 0.133,
		range: 11,
		speed: 24, // tune this before anything else: the dodge window at 8 m is 8 / speed
		radius: 0.3,
		cooldown: 4,
		height: 1.1, // flight height, for presentation only
		nearMiss: 0.8, // a pass this close to a body's edge cues "close"
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
		height: 20,
		back: 12.5, // pitch = atan(height / back) ≈ 58°
		fov: 40,
		response: 0.12, // seconds for the spring to cover ~90% of a step
		lookAhead: 0.25, // fraction of the way toward the aim point
		lookCap: 3,
	},
	dummies: {
		speed: 3.5,
		flipMin: 0.5, // seconds between strafe reversals, drawn uniformly
		flipMax: 1.4,
		span: 4, // metres either side of the post
		hits: 3, // Q hits to take one down
		respawn: 2,
	},
	juice: {
		flash: 0.07,
		hitstop: 0.065, // your own takedowns only; ignored when shared
		shakeTaken: 0.15,
		shakeTakedown: 0.3,
	},
}

// The body's movement profile is the hero section; its extra keys are ignored by the body.
export const profile = tune.hero
