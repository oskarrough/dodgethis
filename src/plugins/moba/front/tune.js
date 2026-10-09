// Timing, motion and synth are live; authored world geometry stays in backdrop.js.
export const tune = {
	skyFade: 0.8,
	loading: {
		uiFadeEnd: 0.28,
		arcHeight: 50,
		riseEnd: 0.35,
		pitchEnd: 0.75,
		fitMargin: 1.18,
		minAspect: 0.1,
		farMargin: 100,
		duration: 2.4,
		reducedDuration: 1 / 60,
		// After shader readiness and the reveal, the fully visible lane holds for `preview` s.
		preview: 4,
		reveal: 0.7,
		orbit: {
			size: 96,
			radius: 30,
			flatten: 0.36,
			stroke: 1.3,
			mark: 2,
			opacity: 0.55,
			angles: [20, 150, 265],
			period: 8,
		},
		height: 22,
		back: 110,
		fov: 55,
		targetX: 0,
		targetY: 8,
		line: 0.65,
		pastel: 0.65,
		skip: { freq: 520, slideTo: 740, dur: 0.12, gain: 0.035, type: 'sine' },
		arrival: { freq: 110, slideTo: 55, dur: 0.4, gain: 0.06, type: 'sine' },
		// The crane takes shot.apex.time: the lobby camera rises `rise` m and tilts to `pitch`°
		// (negative looks up). The map name letters in from `nameAt` of the way, `letter` s apart.
		// The canvas fades no lower than `floor`.
		crane: { rise: 14, pitch: -12, nameAt: 0.3, letter: 0.03, letterTime: 0.35, floor: 0.02 },
		drop: { freq: 660, slideTo: 330, dur: 0.5, gain: 0.03, type: 'triangle' },
	},
	level: { growth: 0.04, cap: 10 },
	volley: {
		damage: 320,
		range: 30,
		speed: 30,
		radius: 0.8,
		castPoint: 0.5,
		cooldown: 60,
		unlock: 10,
	},
	// The Numbers sheet's reference distance, not an animated portrait.
	preview: { distance: 8 },
	parallax: { depth: 0.009, response: 0.18, settle: 0.05 },
	// Backdrop shots in the 1440 × 900 frame: `lift` raises it (negative tilts up to the sky),
	// `zoom` scales on Fletcher's ridge point and `time` is the move into the shot. `depth`
	// multiplies both per layer, far to near; `ease` is the in-out power every front move shares.
	shot: {
		ease: 3,
		depth: [0.8, 0.9, 1, 1.1],
		splash: { lift: 0, zoom: 1, time: 0.7 },
		lobby: { lift: 400, zoom: 1.15, time: 0.7 },
		apex: { lift: -480, zoom: 1, time: 0.6 },
	},
	// Dusk behind the lobby floor so the pale tarmac and its drop read: violet far ground,
	// teal-blue dunes, lilac sky. The backdrop blends to it as the lobby flies in, and back.
	dusk: {
		lilac: '#b8abcf',
		mint: '#a7a3c6',
		peach: '#c2aaca',
		planet: '#f1eaf3',
		'planet-line': '#d3c8de',
		cloud: '#e4dcef',
		far: '#6f6a8a',
		mesa: '#625f82',
		ridge: '#58607e',
		dune: '#4f5d70',
		shadow: '#3f4358',
	},
	// Leaving the lobby, its chrome slides `shift` px towards its own edge as it fades.
	unwind: { shift: 72 },
	back: { freq: 174.61, slideTo: 130.81, dur: 0.25, gain: 0.055 },
	// Menu tiles: the response is a spring, not a fade. `drop` is the fall under the lobby shot,
	// `pop` the spring back in as the splash shot lands.
	// The title sits still for `calm` ms (min, max), then one letter dodges or the Ball glints.
	title: { calm: [3500, 9000] },
	tile: {
		outlinePadding: 5,
		outlineWidth: 1.5,
		snap: 0.12,
		press: 0.06,
		scale: 1.06,
		lift: 8,
		tilt: 2.5,
		drop: 0.2,
		pop: 0.35,
	},
	move: { freq: 880, slideTo: 1175, dur: 0.045, gain: 0.03, type: 'square' },
	enter: { frequencies: [392, 587.33], gap: 0.06, dur: 0.3, gain: 0.05, type: 'triangle' },
	deny: { freq: 116.54, slideTo: 98, dur: 0.16, gain: 0.06, type: 'square', shake: 0.24 },
}
