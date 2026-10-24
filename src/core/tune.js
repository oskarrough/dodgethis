// Core's live values. Each plugin keeps its own tune module; the debug GUI shows them all.
export const tune = {
	physics: {
		gravity: -9.81,
		timeScale: 1,
		paused: false,
		separation: 3, // m/s: overlapping bodies ease apart this fast, sideways only
	},
	camera: {
		fovKick: 1, // degrees of fov punch per kickFov(1)
		shakeDecay: 7, // exponential shake decay rate (1/s)
		shakeAmount: 0.35, // camera displacement (m) per unit of shake
	},
	// Which feedback channels reach the player.
	output: {
		sound: true,
		volume: 0.6,
		shake: true,
		rumble: true,
	},
	// The mix bus (src/core/audio.js `onBus`): each sound plays on one bus with its own gain; a bus plays at most
	// `caps` sounds in any `capWindow` seconds, and a fight sound ducks the music to `duck` for `duckRelease` s.
	mix: {
		ui: 1,
		mine: 1, // your own hero: hero sounds whose fact names you
		others: 1,
		world: 1, // Ball, structures, minions
		music: 1,
		caps: { ui: 3, mine: 4, others: 6, world: 6 },
		capWindow: 0.15,
		duck: 0.6,
		duckRelease: 0.6,
	},
	debug: {
		showColliders: false,
		logLevel: 'info', // 'debug' | 'info' | 'warn' | 'error'
	},
}
