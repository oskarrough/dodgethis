// Core's live values. Each plugin keeps its own tune module; the debug GUI shows them all.
export const tune = {
	physics: {
		gravity: -9.81,
		timeScale: 1,
		paused: false,
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
	debug: {
		showColliders: false,
		logLevel: 'info', // 'debug' | 'info' | 'warn' | 'error'
	},
}
