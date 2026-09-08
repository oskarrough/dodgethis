// --- Tunables ----------------------------------------------------------------
// Live game-feel values shared by the debug GUI, game logic, and DOM-free tests.
export const tune = {
	physics: {
		gravity: -9.81,
		restitution: 0.4,
		timeScale: 1,
		paused: false,
	},
	player: {
		// Q3-style acceleration and hard stop friction give committed strafes without bunny-hop runaway.
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
		jumpSpeed: 9.2, // ~1.8m high under gravityMul: clears bleacher risers and the gap from court
		gravityMul: 2.4, // snappier jump arcs than the arrows, which keep world gravity
		coyoteTime: 0.1, // seconds after walking off an edge during which a jump still succeeds
		// Dash is an edge-clamped committed air-or-ground burst with latched direction and cooldown.
		dashMul: 2.6, // speed multiplier during the burst
		dashTime: 0.12, // seconds the burst lasts
		dashCooldown: 0.7, // seconds (from dash start) before you can dash again
	},
	camera: {
		fovKick: 1, // degrees of fov punch per kickFov(1)
		shakeDecay: 7, // exponential shake decay rate (1/s)
		shakeAmount: 0.35, // camera displacement (m) per unit of shake
	},
	arrow: {
		impulse: 22, // fallback launch speed (m/s) when no aim distance is known
		maxSpeed: 34, // cap on the auto-solved launch speed (the reticle's reach limit)
		launchAngle: 12, // degrees above horizontal (flatter = faster, harder to dodge)
		linearDamping: 0.05,
		nearMiss: 1.2, // a whiff inside this radius (m) of an enemy earns a dodge/close cue
	},
	// Human weapons 1/2 share the scarce arrow pool and only change how held ammo is loosed.
	weapons: {
		// (1) Bow — hold to wind a ping-pong meter, release to fire.
		chargeTime: 0.45, // seconds for the meter to climb 0→1 (then it reverses) — quick so shots stay snappy
		chargeMin: 20, // launch speed (m/s) at an empty meter — even a tap-shot flies with intent
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
		hitFlash: 0.07, // seconds an eliminated unit prints cream before its corpse tint
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
