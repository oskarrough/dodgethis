// The lobby's tunables, assembled into tune.lobby by ../tune.js.

// Lobby sim options apply on creation; map/match/training defaults do not read these.
export const lobby = {
	capacity: 6,
	partyCapacity: 5,
	// The portal lobby (portal-lobby.js): walk into the tear to go; it stands top centre, clear of both team columns.
	portal: {
		x: 0, // the tear's centre across the floor
		z: -4.6, // the tear's centre: far side, so you walk up from the spawn marks into its face
		// The training dummies move to the near side, out of the tear's way.
		dummies: [
			{ x: -1.5, z: 3.8 },
			{ x: 1.5, z: 3.8 },
		],
		width: 0.6, // walking through its plane within this share of tearRadius either side readies a human
		reach: 3, // metres past the plane that still count as in
		sink: 0.8, // metres past the plane over which a hero shrinks away
		// The tear's build-up: `hum` while someone waits inside, rising to full over the countdown,
		// easing toward it at `ease` per second.
		charge: { hum: 0.25, ease: 6, drain: 3, wait: 0.4 }, // `drain`: fill sunk back per second when someone steps out; `wait`: fill share while some are still outside
		countdown: 2, // seconds everyone stays ready before slipping in
		tearRadius: 2.6, // half-height of the open tear
		farChalkWidth: 0.7, // keep court markings legible through the small opening
		farWardenScale: 1.8, // the boss silhouette remains readable in the arena preview
		farBaseInset: 10, // look between the near core and its first tower
		farTarget: 3, // metres ahead of the exit to centre the near base or arena
		farHeight: 3, // low enough that the island fills the mouth rather than its hazy sky
		farScale: 0.16, // fit a match-camera footprint inside the small mouth
		lean: 0.85, // radians the mouth leans toward the lobby camera
		openTime: 1.5, // seconds to rip open after the first human joins
		slipTime: 0.65, // seconds heroes shrink into the mouth before loading
		sparks: 1200, // glitter grains around the rim
	},
	handoffFor: 3, // seconds of live lane simulation carrying the loading roster
	style: { line: 0.65, pastel: 0.65 },
	practice: { damage: 0, tell: 0.8, tellY: 0.23 },
	inspect: {
		range: 16,
		deadzone: 0.2,
		openSound: { freq: 710, slideTo: 1060, dur: 0.12, gain: 0.045, type: 'sine' },
		closeSound: { freq: 590, slideTo: 390, dur: 0.1, gain: 0.045, type: 'triangle' },
	},
	// The camera fits the whole floor between the team columns, `margin` px clear of them, the
	// HUD and the screen edges, and `top` px under the screen's top for the corner buttons; live.
	// height/back keep the lane's 58° pitch.
	camera: { height: 11, back: 6.875, fov: 40, margin: 16, top: 64, passes: 12 },
	// Picking a hero from the portal picker.
	pick: {
		// Authored points that pick intents name heroes by; nothing stands there.
		x: 5.2,
		z: 0,
		spacing: 2,
		radius: 0.7,
		sound: { freq: 620, slideTo: 980, dur: 0.14, gain: 0.08, type: 'triangle' },
		denySound: { freq: 120, slideTo: 70, dur: 0.18, gain: 0.1, type: 'square' },
	},
	ready: {
		// The seats: authored positions apply on restart; fill timing is live.
		x: 2.65,
		z: 0,
		spacing: 1.7,
		width: 1.5,
		depth: 1.3,
		fillTime: 1,
		fillY: 0.05,
		walkSound: { freq: 440, slideTo: 560, dur: 0.1, gain: 0.06, type: 'sine' },
		enterSound: { freq: 680, slideTo: 760, dur: 0.12, gain: 0.05, type: 'triangle' },
		fullSound: { freq: 880, slideTo: 1320, dur: 0.18, gain: 0.08, type: 'sine' },
		cancelSound: { freq: 330, slideTo: 220, dur: 0.1, gain: 0.07, type: 'triangle' },
		// Your groove starts filling: rising, like a bottle under a tap.
		grooveSound: { freq: 240, slideTo: 480, dur: 0.3, gain: 0.05, type: 'sine' },
	},
	// The difficulty picks (lobby-props.js): authored positions apply on restart; aim and settling are live.
	gallery: {
		x: 0,
		z: 5.7,
		spacing: 2.0,
		radius: 0.4,
		aimRadius: 2,
		settleTime: 0.35,
		overshoot: 0.12,
		shotSound: { freq: 790, slideTo: 350, dur: 0.09, gain: 0.07, type: 'sine' },
		pickSound: { freq: 140, slideTo: 420, dur: 0.2, gain: 0.1, type: 'sine' },
		// The old magnets' sounds, still in the sound table (sound-table.js).
		magnet: {
			clackSound: { freq: 1900, slideTo: 1300, dur: 0.045, gain: 0.09, type: 'square' },
			thudSound: { freq: 150, slideTo: 80, dur: 0.07, gain: 0.08, type: 'triangle' },
			leapSound: { freq: 300, slideTo: 900, dur: 0.12, gain: 0.05, type: 'sine' },
		},
	},
	// Where you can walk: a rectangle whose corners sit over 1 m inside the saucer's glaze ellipse
	// (floor.halfX/halfZ). Gallery, seats, dummies and marks all sit inside it.
	bounds: { halfX: 7, halfZ: 6.2 },
	// The lobby's training dummies strafe `dummies.span` either side of these; keep the gallery >2 m off.
	dummyPosts: [
		{ x: -1.5, z: -4.3 },
		{ x: 1.5, z: -4.3 },
	],
	// The lobby floor, floating in the splash sky: `style` picks the courtyard or the glazed saucer in magnetic cradles. Geometry, glaze and
	// colours apply on restart. The walkable glaze is an ellipse holding the walking bounds with over 1 m to spare
	// at their corners; the lip runs `rim.width` further out, with a solid cushion along the glaze's edge.
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
		style: 'flags', // 'saucer', or one of `grounds`; `?ground=` overrides
		// Architectural grounds share the saucer's ellipse: a painted floor ringed by stands, and terraces
		// stepping in underneath.
		grounds: {
			flags: {
				centre: 1.3, // m, the middle ring's radius: a few wedges meeting at the centre
				ring: 1.1,
				stone: 1.3,
				groutWidth: 0.018,
				unevenness: 0.09, // m each corner and joint strays off true
				waver: 0.18, // m the rings drift in and out
				jitter: 0.07,
				terraces: 4,
				drop: 0.32,
				step: 0.55,
				// The stands, lucha canaria style: the paving stops `inset` m inside the rim's outer edge at a
				// barrier, then `tiers` steps of `rise` × `tread` m climb outward to the back wall.
				wall: {
					inset: 0.2,
					barrier: { height: 0.3, width: 0.22 },
					tiers: 4,
					rise: 0.2,
					tread: 0.3,
				},

				colors: {
					stoneCentre: '#c98a52',
					stoneEdge: '#9a5038',
					grout: '#874632',
					speck: '#3b1f1c',
					stain: '#5e3a3a',
					sand: '#e8c28a',
					shadow: '#4a1e18', // pooled at the barrier's foot
					tread: '#c4473a',
					riser: '#9c2f27',
					face: '#5a4a58',
					under: '#4e3150',
				},
			},
		},
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
