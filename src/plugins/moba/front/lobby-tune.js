// The lobby's tunables, assembled into tune.lobby by ../tune.js.

// Lobby sim options apply on creation; map/match/training defaults do not read these.
export const lobby = {
	capacity: 6,
	handoffFor: 3, // seconds of live lane simulation carrying the loading roster
	style: { line: 0.65, pastel: 0.65 },
	practice: { damage: 0, tell: 0.8, tellY: 0.23 },
	hud: { margin: 16 },
	inspect: {
		range: 16,
		scrollSpeed: 480,
		deadzone: 0.2,
		openSound: { freq: 710, slideTo: 1060, dur: 0.12, gain: 0.045, type: 'sine' },
		closeSound: { freq: 590, slideTo: 390, dur: 0.1, gain: 0.045, type: 'triangle' },
	},
	// The camera fits the whole saucer, cradles and bowl beside the hero strip, `margin` px clear of it, the
	// HUD and the screen edges, and `top` px under the screen's top for the corner buttons; live.
	// height/back keep the lane's 58° pitch.
	camera: { height: 11, back: 6.875, fov: 40, margin: 16, top: 64, passes: 12 },
	// Picking from the hero row: the new body comes round edge-on, like a cutout turned on a pin.
	pick: {
		// Authored points that pick intents name heroes by; nothing stands there.
		x: 5.2,
		z: 0,
		spacing: 2,
		radius: 0.7,
		nameHeight: 1.9,
		flipTime: 0.25,
		flipEdge: 0.06,
		flipOvershoot: 0.12,
		sound: { freq: 620, slideTo: 980, dur: 0.14, gain: 0.08, type: 'triangle' },
		denySound: { freq: 120, slideTo: 70, dur: 0.18, gain: 0.1, type: 'square' },
	},
	ready: {
		// Authored ground prints and cardboard apply on restart; fill/activation timing is live.
		x: 2.65,
		z: 0,
		spacing: 1.7,
		width: 1.5,
		depth: 1.3,
		fillTime: 1,
		// Plates inlaid in the glaze: an ink groove `borderWidth` wide, a band of team glaze `band` wide
		// (team colour `tint` of the way to cream), a cream `well` the ready fill glazes over.
		borderWidth: 0.035,
		band: 0.11,
		corner: 0.22,
		tint: 0.18,
		well: '#fbf6ea',
		fillY: 0.05, // holograms and labels stand on the plate here
		label: 'Ready', // printed beside your plate until you stand in it
		labelGap: 0.12,
		badge: { keyboard: 'Enter', mouse: 'Enter', gamepad: 'Start', touch: '' },
		// A bot's hero floats over its seat as a hologram.
		hologram: {
			float: 0.32,
			bob: 0.06,
			bobRate: 1.1,
			sway: 0.5,
			swayRate: 0.35,
			opacity: 0.85,
			lines: 14,
			face: 0.75, // eyes wear the picked difficulty's mood, sized to the head
			faceGap: 0.03,
		},
		promptRadius: 1.5,
		walkSound: { freq: 440, slideTo: 560, dur: 0.1, gain: 0.06, type: 'sine' },
		enterSound: { freq: 680, slideTo: 760, dur: 0.12, gain: 0.05, type: 'triangle' },
		fullSound: { freq: 880, slideTo: 1320, dur: 0.18, gain: 0.08, type: 'sine' },
		cancelSound: { freq: 330, slideTo: 220, dur: 0.1, gain: 0.07, type: 'triangle' },
	},
	gallery: {
		// Authored props apply on restart; aim/contact tests and settling are live.
		x: 0,
		z: 5.7,
		spacing: 2.0,
		radius: 0.4,
		aimRadius: 2,
		clickPad: 0.02, // right-clicks this far outside a magnet's screen box (in clip space) still pick it
		// The invisible box that hover and right-click read; the magnet floats inside it.
		width: 1.15,
		height: 1.7,
		labelY: 0.1,
		settleTime: 0.35,
		overshoot: 0.12,
		ringY: 0.18,
		ringWidth: 0.06,
		firingMark: { x: 0, z: 4.5 },
		shot: { speed: 20, range: 18, radius: 0.2, damage: 0 },
		shotSound: { freq: 790, slideTo: 350, dur: 0.09, gain: 0.07, type: 'sine' },
		pickSound: { freq: 140, slideTo: 420, dur: 0.2, gain: 0.1, type: 'sine' },
		// Each difficulty is a floating horseshoe magnet; ball count, orbit and face say how hard.
		// Shapes apply on restart; motion, timing and sound are live.
		magnet: {
			hover: 1.2, // arch centre above the floor
			tilt: 0.35, // leans back toward the camera
			lean: 0.45, // each ball's orbit plane tips this far off flat
			arch: 0.38,
			tube: 0.14,
			leg: 0.36,
			tip: 0.16,
			ball: 0.13,
			face: 0.2,
			sag: 0.18, // an unpicked magnet droops this far and dims its pull
			pullRate: 6,
			slamTime: 0.14,
			leapTime: 0.42,
			leapHeight: 0.8,
			stagger: 0.06,
			stickFor: 0.8,
			releaseTime: 0.45,
			punch: 0.22,
			punchTime: 0.35,
			gravity: 16,
			bounce: 0.45,
			fling: 0.6, // share of orbit speed a dropped ball keeps
			roll: 2.2, // floor friction per second
			roam: 0.85, // dropped balls stay this close to their magnet
			rest: 0.55, // where idle balls lie, around the magnet's foot
			moods: {
				easy: { balls: 1, orbit: 0.92, spin: 1.1, bob: 0.07, bobRate: 0.9, buzz: 0, crackle: 0 },
				normal: {
					balls: 2,
					orbit: 0.8,
					spin: 3.2,
					bob: 0.04,
					bobRate: 1.6,
					buzz: 0,
					crackle: 0,
				},
				hard: {
					balls: 3,
					orbit: 0.66,
					spin: 7.5,
					bob: 0.02,
					bobRate: 3,
					buzz: 0.025,
					crackle: 0.35,
				},
			},
			clackSound: { freq: 1900, slideTo: 1300, dur: 0.045, gain: 0.09, type: 'square' },
			thudSound: { freq: 150, slideTo: 80, dur: 0.07, gain: 0.08, type: 'triangle' },
			leapSound: { freq: 300, slideTo: 900, dur: 0.12, gain: 0.05, type: 'sine' },
		},
	},
	// The lobby's camera starts `distance`× back along its view ray; the canvas fades in from `fadeFrom` of the move.
	intro: { distance: 4, fadeFrom: 0.6 },
	// Where you can walk: a rectangle whose corners sit over 1 m inside the saucer's glaze ellipse
	// (floor.halfX/halfZ). Gallery, seats, dummies and marks all sit inside it.
	bounds: { halfX: 7, halfZ: 6.2 },
	// The lobby's training dummies strafe `dummies.span` either side of these; keep the gallery >2 m off.
	dummyPosts: [
		{ x: -1.5, z: -4.3 },
		{ x: 1.5, z: -4.3 },
	],
	// The lobby floor: a huge glazed saucer in magnetic cradles, floating in the splash sky. Geometry, glaze and
	// colours apply on restart. The walkable glaze is an ellipse holding the walking bounds with over 1 m to spare
	// at their corners; the lip and its collider run `rim.width` further out.
	floor: {
		halfX: 11,
		halfZ: 9.8,
		segments: 160,
		seed: 7,
		pixelsPerMeter: 44,
		well: 0.45, // the glaze pools darker this far in from the lip
		rim: { width: 0.9, height: 0.17, glazeLine: 0.14 },
		depth: 1.5, // the unglazed body under the lip
		gloss: 0.12,
		speckles: 1800,
		crazing: { cell: 0.5, jitter: 0.9, width: 0.018, alpha: 0.085, gaps: 0.35 },
		wear: { patches: 26, chips: 5, lip: 0.015 },
		// Each cradle is a horseshoe magnet stood round the rim at `angles` (degrees, 0 = +x, 90 = near edge),
		// its jaws `reach` m clear of the saucer's edge, open `open`° either side of the saucer's middle.
		cradle: {
			angles: [215, 25, 140],
			radius: 1.9,
			tube: 0.56,
			reach: 0.35,
			y: -0.7,
			open: 38,
			pole: 0.36,
			steps: 14,
		},
		colors: {
			glaze: '#f1e9d6',
			pool: '#cfc2a6',
			wear: '#fbf7ec',
			speck: '#76695a',
			craze: '#8f8068',
			biscuit: '#cdb38c',
			chipEdge: '#8d7458',
			rim: '#f4eddc',
			band: '#3f3a6e', // the painted line round the lip
			body: '#8d82a8',
			bodyDark: '#4a4468',
			iron: '#424a66',
			pole: '#efe6d2',
		},
	},
	// The weather bowl on the saucer's far right holds the next map in miniature, turning `turn` rad/s under a
	// painted sky cap. Shapes and colours apply on restart; turning and the label are live. Each map's `look` is
	// its light in miniature: Overthrow by day, Flagfall by night. Lengths in `maps` are that map's metres.
	bowl: {
		x: 9.3,
		z: -3.8,
		radius: 2,
		height: 1.05,
		wall: 0.16,
		floor: 0.14,
		segments: 48,
		capRadius: 1.5, // the sky arch's half-width; keep it inside radius
		capHeight: 1.4, // and its height behind the middle of the rim
		skyPixels: 256,
		island: 1.45, // the miniature's half-diagonal; keep it inside the cloud bed
		relief: 2.4, // dioramas exaggerate height
		lift: 0.16,
		turn: 0.12,
		rest: 0.5, // the angle it starts from
		bob: 0.025,
		bobRate: 0.8,
		// Printed on the saucer under the bowl, flush-left from `from` of its radius left of centre.
		label: { caption: 'Next map', name: '{map}', from: 0.6 },
		colors: { glaze: '#f4eddc', inside: '#e6dcc6', foot: '#8d82a8' },
		maps: {
			overthrow: {
				court: '#d8dc9a',
				stone: '#a49cb4',
				under: '#6f6888',
				hedge: '#8faa6a',
				cap: '#b9c98c',
				cloud: '#f4c8bc',
				sky: ['#b99ac2', '#efab8e', '#fae0c6'], // zenith to horizon
				moon: [0.55, 0.32, 0.14],
				moonColor: '#fff3dc',
				crescent: false,
				stars: 0,
				star: '#ffffff',
				isles: 7,
				isle: '#9d8fb0',
				wisps: 6,
				margin: 1.5,
				slab: 2.5,
				rock: 6,
				laneWidth: 3,
				hedgeHeight: 1.6,
				wallHeight: 2.4,
				pillarHeight: 3.4,
			},
			flagfall: {
				court: '#9c88c4',
				stone: '#5b4870',
				under: '#3a2c4e',
				hedge: '#2f6b66',
				cap: '#6e5a8e',
				cloud: '#4a3d6b',
				sky: ['#191533', '#4a3a74'],
				moon: [0.75, 0.32, 0.13],
				moonColor: '#d9c8f5',
				crescent: true,
				stars: 40,
				star: '#f3ead2',
				isles: 6,
				isle: '#2c2448',
				wisps: 0,
				margin: 1.5,
				slab: 2.5,
				rock: 6,
				laneWidth: 3,
				hedgeHeight: 1.6,
				wallHeight: 2.4,
				pillarHeight: 3.4,
			},
		},
	},
	// Flagfall's shore fence builds from these (map.js); the lobby has none. All apply on restart;
	// coordinates are fractions of the safe rim rectangle.
	fence: {
		edgeMargin: 0.3,
		height: 1.35,
		bottom: 0.12,
		sag: 0.32,
		bow: 0.12,
		postRadius: 0.12,
		postExtra: 0.22,
		capRadius: 0.16,
		capHeight: 0.1,
		railRadius: 0.025,
		panelWidth: 2.4,
		diamond: 0.65,
		curveSteps: 12,
		radialSegments: 8,
		bollardRadius: 0.23,
		bollardHeight: 0.8,
		bollardCapHeight: 0.14,
		colors: { posts: '#716b80', wire: '#89989a', bollards: '#8caaa3', caps: '#646779' },
		runs: [
			{ from: [-0.9, -1], to: [-0.42, -1] },
			{ from: [0.35, -1], to: [0.88, -1] },
			{ from: [-1, -0.7], to: [-1, -0.18] },
			{ from: [1, 0.05], to: [1, 0.55] },
		],
		bollards: [
			[-0.16, -1],
			[0.1, -1],
			[-1, 0.72],
			[1, -0.72],
		],
	},
	// The saucer has open edges: orders reach `reach` metres past its glaze, so walk off over the lip, fall `depth` metres, then
	// drop back in from `height` over a random spot inside the walking bounds.
	fall: { reach: 2, depth: 6, height: 7 },
	onlineNotice: 'The online lobby is not ready yet. Play local practice.',
	replica: { delay: 0.1, size: 6, depth: 12, precision: 100 },
	respawn: 0.5,
	// Where you spawn and recover: index 0 for team A, 3 for team B. Not drawn.
	marks: [
		{ x: -1.4, z: -1.25 },
		{ x: -1.4, z: 0 },
		{ x: -1.4, z: 1.25 },
		{ x: 1.4, z: -1.25 },
		{ x: 1.4, z: 0 },
		{ x: 1.4, z: 1.25 },
	],
}
