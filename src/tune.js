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
		// Horizontal move (Q3 spirit): high accel + hard stop friction, not
		// instant dir*speed. See src/move.js. Tuned for a tennis-court arena —
		// snappy strafe commitment without bunny-hop runaway.
		speed: 6.5, // max ground wishspeed (m/s)
		accel: 14, // ground accel (≈1/accel seconds to full from rest)
		friction: 8, // ground friction while steering
		stopFriction: 16, // ground friction with no wish (snappy stop)
		stopSpeed: 2, // Quake stop-speed floor for low-speed friction
		airAccel: 6, // air control — enough to aim a strafe off the rim
		airSpeedMul: 1.15, // soft air speed cap as a multiple of speed
		radius: 0.4,
		halfHeight: 0.6,
		pickupRadius: 1.1,
		jumpSpeed: 6, // ~1.8m high: clears bleacher risers and the gap from court
		// Dash: a short, committed horizontal burst (also works in air). Latches a
		// direction and overrides normal steering for dashTime, then locks out for
		// dashCooldown. Edge-clamped so a dash can't fling you into the lava.
		dashMul: 2.6, // speed multiplier during the burst
		dashTime: 0.12, // seconds the burst lasts
		dashCooldown: 0.7, // seconds (from dash start) before you can dash again
	},
	arrow: {
		impulse: 22, // fallback launch speed (m/s) when no aim distance is known
		maxSpeed: 34, // cap on the auto-solved launch speed (the reticle's reach limit)
		launchAngle: 20, // degrees above horizontal
		linearDamping: 0.05,
	},
	// Alternate "weapons" the human can switch to (1/2). The ammo is the same
	// scarce arrow pool — the weapon only changes how a held arrow is loosed.
	weapons: {
		// (1) Bow — hold to wind a ping-pong meter, release to fire.
		chargeTime: 0.9, // seconds for the meter to climb 0→1 (then it reverses)
		chargeMin: 14, // launch speed (m/s) at an empty meter
		chargeMax: 30, // launch speed (m/s) at a full meter
		perfectWindow: 0.1, // top fraction of the meter that scores a "perfect" release
		perfectMult: 1.5, // speed multiplier on a perfect release
		// (2) Bowl — a big, slow, heavy ball that rolls along the ground.
		bowlSpeed: 15, // launch speed (m/s) — slower than an arrow
		bowlRadius: 0.45, // collider + visual radius (big)
		bowlDensity: 4, // heavy, so it bowls through
		bowlStop: 2.5, // settle once its ground speed drops below this (m/s)
	},
	ai: {
		enabled: true,
		reaction: 0.7, // seconds an enemy lines up a shot before loosing
		jitter: 0.2, // aim error in radians (higher = worse shots)
		standoff: 10, // preferred range (m) an armed bot circle-strafes the target at
	},
	fx: {
		impact: true,
		rumble: true,
		sound: true,
		volume: 0.6,
		shake: true,
		trails: true,
		deathTime: 1, // multiplier on death-animation length (higher = slower, more dramatic)
	},
	cheats: {
		godmode: false, // the human can't be eliminated (toggle live with G)
		infiniteAmmo: false, // the human never runs out of arrows (toggle live with H)
	},
	debug: {
		showColliders: false,
		logLevel: 'info', // 'debug' | 'info' | 'warn' | 'error'
	},
}
