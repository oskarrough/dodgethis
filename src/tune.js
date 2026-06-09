// --- Tunables ----------------------------------------------------------------
// One place for every number worth fiddling with. The GUI (debug.js) binds
// straight to this object, and game code reads from it live — change a value,
// see it now. The gravity/damping/impulse triple here IS the game feel (see
// plan.md). This lives apart from debug.js so game logic (and tests) can read
// the numbers without dragging in lil-gui or the DOM.
export const tune = {
	physics: {
		gravity: -9.81,
		restitution: 0.4,
		timeScale: 1,
		paused: false,
	},
	player: {
		speed: 7,
		radius: 0.4,
		halfHeight: 0.6,
		pickupRadius: 1.1,
	},
	arrow: {
		impulse: 22, // fallback launch speed (m/s) when no aim distance is known
		maxSpeed: 34, // cap on the auto-solved launch speed (the reticle's reach limit)
		launchAngle: 20, // degrees above horizontal
		linearDamping: 0.05,
	},
	// Alternate "weapons" the human can switch to (1/2/3). The ammo is the same
	// scarce arrow pool — the weapon only changes how a held arrow is loosed.
	weapons: {
		// (2) Charge bow — hold to wind a ping-pong meter, release to fire.
		chargeTime: 0.9, // seconds for the meter to climb 0→1 (then it reverses)
		chargeMin: 14, // launch speed (m/s) at an empty meter
		chargeMax: 30, // launch speed (m/s) at a full meter
		perfectWindow: 0.1, // top fraction of the meter that scores a "perfect" release
		perfectMult: 1.5, // speed multiplier on a perfect release
		// (3) Bowl — a big, slow, heavy ball that rolls along the ground.
		bowlSpeed: 15, // launch speed (m/s) — slower than an arrow
		bowlRadius: 0.45, // collider + visual radius (big)
		bowlDensity: 4, // heavy, so it bowls through
		bowlStop: 2.5, // settle once its ground speed drops below this (m/s)
	},
	ai: {
		enabled: true,
		reaction: 0.7, // seconds an enemy lines up a shot before loosing
		jitter: 0.2, // aim error in radians (higher = worse shots)
	},
	fx: {
		sound: true,
		volume: 0.6,
		shake: true,
		trails: true,
		deathTime: 1, // multiplier on death-animation length (higher = slower, more dramatic)
	},
	cheats: {
		godmode: false, // the human can't be eliminated (toggle live with G)
	},
	debug: {
		showColliders: false,
		logLevel: 'info', // 'debug' | 'info' | 'warn' | 'error'
	},
}
