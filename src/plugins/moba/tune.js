// --- Tunables ----------------------------------------------------------------
// Moba's live values (docs/moba-plan.md, "Feel numbers"), shared by the debug GUI, the sim and DOM-free tests. Metres and seconds.
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
	map: {
		name: 'Overthrow',
		halfX: 52,
		halfZ: 13,
		thickness: 1,
		baseWallX: 28,
		throat: 8,
		spawnX: 48,
		spawnSpacing: 1.5,
		hedgeInnerX: 12,
		hedgeOuterX: 24,
		hedgeInnerZ: 6,
		hedgeOuterZ: 8,
		hedgeHeight: 1.2,
		scallopRadius: 0.5,
		scallopSpacing: 0.8,
		plazaRadius: 9,
		pillarX: 4.5,
		pillarZ: 4,
		guardX: 13,
		guardZ: 3,
		pillarRadius: 0.7,
		pillarHeight: 1.8,
		pillarSegments: 24,
		capScale: 0.8,
		capHeight: 0.04,
		printLayers: { road: 0.015, dots: 0.03, lobby: 0.045, marks: 0.06, seams: 0.075 },
		// Ground markers (pings, hover, aim line) must sit above every print layer
		markerLayers: { aim: 0.09, aimTip: 0.092, hover: 0.095, reticle: 0.097, ping: 0.1 },
		reticle: { inner: 0.3, outer: 0.42 }, // the drawn aim point while a key aims
		lineWidth: 0.06,
		dashLength: 1,
		dashSpacing: 2,
		wallHeight: 2.4,
		boundaryThickness: 0.5,
		dummyPosts: [
			{ x: -3, z: -7 },
			{ x: 5, z: -10 },
		],
	},
	// Shared match presentation, first built for Overthrow; applies on map restart.
	overthrowTerrain: {
		margin: 1.6,
		jag: 0.8,
		step: 3,
		seed: 73,
		rockDepth: 5,
		rockFlare: 1.4,
		rockBands: 3,
		groundY: 0.005,
		chalkY: 0.01,
		patchScale: 3,
		patchContrast: 0.025,
		chalkWidth: 0.11,
		courtInset: 1.4,
		chalkSegments: 96,
		surroundSize: 600,
		surroundDrop: 12,
		mesaSpacing: 22,
		mesaRows: 3,
		mesaRadius: 7,
		mesaHeight: 5,
		mesaVariation: 0.2,
		mesaTaper: 1.3,
		mesaSegments: 7,
		colors: {
			tarmac: '#e4dfcf',
			chalk: '#f5f1e5',
			rock: '#aaa49b',
			rockDark: '#656575',
			surround: '#555669',
			mesa: '#536c6b',
		},
		palette: { page: 0x555669, courtShade: 0x708883, scenery: 0x899b9b },
	},
	// Flagfall: two lanes on the shared court in the shallows. All geometry applies on restart.
	flagfall: {
		name: 'Flagfall',
		scale: 1, // one multiplier for every layout metre; applies on restart
		palette: { page: 0x536e79 },
		rockDepth: 1.8,
		// Flagfall scenery only; metres before map scale, all apply on restart.
		finish: {
			anisotropy: 8,
			courtAsset: '/scenery/flagfall-court.webp',
			courtMetres: 8,
			courtTexture: 3, // grit contrast gain; 1 is the tile as painted
			courtRange: 0.07, // grit never moves the floor more than ±7%
			courtMean: 0.731, // linear luminance mean; modulate without lowering the pale floor
			hedgeAsset: '/scenery/flagfall-hedge.webp',
			hedgeMetres: 5,
			hedgeTexture: 0.35,
			warm: '#f2e5c9',
			cool: '#c7cdd0',
			lightStrength: 0.2,
			lightSpread: 0.85,
			contactPixelsPerMetre: 12,
			contactWidth: 1.2,
			contactStrength: 0.3,
			edgeWidth: 1.3,
			edgeStrength: 0.1,
			rock: '#b3a28c',
			rockDark: '#617175',
			rockGrain: 0.045,
			rockGrainMetres: 0.04,
			rockStrata: 0.22,
			wetHeight: 0.5,
			wetStrength: 0.28,
			cover: '#70877a',
			wall: '#a69680', // base blocks are sandstone walls, not hedges
			wallBlock: [1.5, 0.5], // block length, course height
			wallFlag: 3, // square paving on the wall tops
			pillar: '#b0a690',
			pillarCourse: 0.6, // stacked drums
			pillarFlutes: 14,
			fluteDepth: 0.07,
			mortar: 0.14, // joint darkening, never ink
			mortarWidth: 0.04,
			mottle: 0.07, // tone drift between blocks
			footHeight: 0.4,
			footShade: 0.16,
			coverShade: 0.23,
		},
		water: {
			asset: '/scenery/flagfall-water.webp', // generated shallows; flat fallback if unavailable
			width: 165, // image width in metres; height follows its native aspect
			fallbackSize: 600,
			drop: 1.7,
			layerGap: 0.015,
			color: '#536e79',
			foamColor: '#b3c8c2',
			padColor: '#618b7e',
			detailAsset: '/scenery/flagfall-ripple.webp',
			detailMetres: 7,
			detailStrength: 3, // caustic contrast gain; 1 is the tile as painted
			detailMean: 0.461, // grey tile's linear luminance mean, so ripples don't turn the plate muddy
			detailSpeed: 0.035,
			hazeDistance: 28,
			hazeStrength: 0.32,
			shoreWidth: 0.5,
			shoreOpacity: 0.75,
			shoreBreak: 1, // 0 a soft glow, 1 a crisp broken foam line
			reflectionWidth: 2.2,
			reflectionOpacity: 0.14,
			padNotch: 0.16,
			padRim: 0.025,
			padRimColor: '#90ab92',
			padVeinColor: '#7da18d',
			padVeinWidth: 0.018,
			padVeinReach: 0.75,
			padVeinAngles: [-0.8, 0, 0.8],
			padAspect: 0.82,
			flowerEvery: 3,
			flowerRadius: 0.12,
			flowerColor: '#d3c4ce',
			flowerPetals: 5,
			reedCount: 12,
			reedBlades: 7,
			reedHeight: 0.9,
			reedWidth: 0.06,
			reedSpread: 0.35,
			reedOffset: 6,
			reedColor: '#607c72',
			lightCount: 8,
			lightRadius: 0.08,
			lightHalo: 0.35,
			lightHeight: 0.7,
			lightColor: '#c2d5c2',
			lightOpacity: 0.55,
			lightTravel: 0.6,
			lightTime: 18,
			cloudColor: '#b9b8c9',
			feather: 0.1, // soften the finite plate into the flat sea; UV fraction
			shimmer: 0.045,
			rippleLength: 2.8,
			rippleTime: 9,
			foamCount: 24,
			foamLength: 6,
			foamWidth: 0.12,
			foamOffset: 2.5,
			foamTravel: 2,
			foamTime: 12,
			foamOpacity: 0.24,
			ringCount: 16,
			ringRadius: 0.8,
			ringWidth: 0.04,
			ringGrow: 0.8,
			ringTime: 7,
			ringOpacity: 0.18,
			padCount: 12,
			padRadius: 0.65,
			padOffset: 1.5,
			padSpread: 3,
			padBob: 0.035,
			padTime: 6,
			clouds: true, // first effect to drop if the frame budget is threatened
			cloudCount: 4,
			cloudLength: 15,
			cloudWidth: 5,
			cloudOffset: 9,
			cloudTravel: 4,
			cloudTime: 45,
			cloudOpacity: 0.09,
			segments: 32,
		},
		// Fence on the safe rim, not colliders. The long shores' runs are cut wherever `gaps` open
		// (map.js), so the drawn gaps are exactly the sim's; these are the end runs behind the bases.
		fence: {
			runs: [
				{ from: [-1, -0.28], to: [-1, 0.28] },
				{ from: [1, -0.28], to: [1, 0.28] },
			],
			bollards: [
				[-0.5, -1],
				[0.5, -1],
				[-0.5, 1],
				[0.5, 1],
			],
		},
		// Squeezed: the lanes sit close enough to hear each other across an 8 m yard.
		bounds: { halfX: 52, halfZ: 16 },
		lane: { innerZ: 6, outerZ: 16, centreZ: 11, pathZ: 12.5 }, // waves and towers walk the shore side
		yard: { halfX: 28, halfZ: 4 },
		baseBlock: { innerX: 28, outerX: 38, halfZ: 6 },
		baseX: 46,
		hedge: {
			innerZ: 4,
			outerZ: 6,
			runs: [
				[3, 8],
				[12, 16],
				[20, 28],
			],
		},
		// Dunk gaps in the shore fence: |x| ranges, mirrored to both halves of both shores.
		gaps: [[5, 11]],
		pillarRadius: 0.8,
		yardPillars: { x: 6, z: 2 },
		spawns: { A: { x: -49, z: 0 }, B: { x: 49, z: 0 } },
		structures: { towerX: 18, fortX: 32, coreX: 42 },
		waveSpawnX: 40,
		posts: [
			{ x: -16, z: 3 },
			{ x: 16, z: -3 },
		],
		dummyPosts: [
			{ x: -2, z: -2 },
			{ x: 2, z: -2 },
		],
		// A skillshot hitting a hero on the slick strip at a fence gap shoves them along the shot;
		// a shove that leaves the court through the gap dunks them. Seconds unless noted; live.
		dunk: {
			slick: 3.5, // m of wet court inside each gap
			push: 3, // m a shove carries
			time: 0.2, // the shove's slide
			immunity: 1, // no second shove this soon after one ends
			swim: 4, // out of play, then back at base on the HP you had
			abilities: ['loose', 'toss', 'rain'], // Rain shoves away from its centre
			// Presentation
			flight: 3.6, // m out from the court's edge where the body lands in the water
			hop: 1.1, // m of lift on the way out
			fly: 0.45, // s in the air
			sink: 0.6, // s under the surface before it's gone
			wet: '#7f9fa3', // the slick print
			wetOpacity: 0.55,
			wetStripe: 0.6, // m between the hazard stripes on the slick
			splash: { count: 28, speed: 2.2, life: 0.7, lifeStep: 0.1, size: 0.14, sizeStep: 0.05 },
			spray: { count: 10, speed: 4, life: 0.45, lifeStep: 0.05, size: 0.09, sizeStep: 0.03 },
			scuff: { count: 6, speed: 1.2, streak: true },
		},
		print: {
			layers: { marks: 0.06, chalk: 0.075, wet: 0.052 },
			kerbWidth: 0.08,
			footprintWidth: 0.12,
			radii: { tower: 1.4, fort: 2, core: 2.6, post: 0.6 },
			poleRadius: 0.08,
			poleHeight: 6,
		},
	},
	// Lobby sim options apply on creation; map/match/training defaults do not read these.
	lobby: {
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
		// Full playable lobby, live; height/back retain the lane's 58° pitch.
		camera: {
			x: 0,
			z: 2.65,
			height: 11,
			back: 6.875,
			fov: 66,
			fitAspect: 0.9,
			minAspect: 0.4,
			fitPasses: 6,
			fitGrowth: 1.2,
		},
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
			borderWidth: 0.045,
			boxY: 0.19,
			borderY: 0.185,
			fillY: 0.195,
			// A bot's hero floats over its seat as a hologram.
			hologram: {
				float: 0.22,
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
		// Where you can walk: a rectangle kept over 1 m inside the floor's torn outline
		// (floor.halfX/halfZ minus floor.jag, minus the 1 m). Gallery, seats, dummies and marks all sit inside it.
		bounds: { halfX: 9, halfZ: 6.5 },
		// The props the camera frames; it slides to follow once you leave `followX` or this depth.
		frame: { halfZ: 6.2, followX: 5, followEase: 6 },
		// The lobby's training dummies strafe `dummies.span` either side of these; keep the gallery >2 m off.
		dummyPosts: [
			{ x: -1.5, z: -4.3 },
			{ x: 1.5, z: -4.3 },
		],
		// The lobby floor: finite pale tarmac over a torn rock rim, floating over the desert. Geometry, texture and
		// colours apply on restart. The outline only ever pulls in from the halfX/halfZ rectangle by up to `jag`.
		floor: {
			halfX: 11,
			halfZ: 8.1,
			jag: 0.6,
			seed: 7,
			step: 0.9, // metres between outline vertices
			rockDepth: 3,
			courses: 3,
			courseInset: 0.3, // each rock course juts out this much further than the one above (the camera only sees outward steps), give or take half
			courseJitter: 0.3,
			pixelsPerMeter: 40,
			colors: {
				tarmac: '#f4ecda',
				blotch: '#e4d9c3',
				speck: '#9c8f7a',
				crack: '#a39682',
				chalk: '#ffffff',
				ledge: '#e0c79e',
				rock: '#c4a57c',
				rockDark: '#6a6088',
			},
			speckles: 5200,
			cracks: 13,
			chalkWidth: 0.1,
			seatPad: 0.12,
			circle: { x: 0, z: -3.4, radius: 1.5 },
			hopscotch: { x: -7.4, z: 0.2, cell: 0.95 },
			arcRadius: 9, // gallery arc: a shallow curve 0.9 m behind the cards
		},
		// Schoolyard scenery only; all fence settings apply on restart. Coordinates are fractions
		// of the safe rim rectangle, outside walking bounds even at the smallest supported floor.
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
		// The floor has open edges: orders reach `reach` metres past it, so walk off, fall `depth` metres, then
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
	},
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
	match: { objective: 180, late: 360, lateGunDamage: 0.05 },
	waves: {
		first: 15,
		interval: 30,
		lateInterval: 15,
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
		reinforcement: 'melee', // one more per wave for each enemy tower taken
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
	heroes: {
		mitts: { hp: 2200, speed: 5.6 },
		carom: { hp: 1300, speed: 5 },
		skip: { hp: 1450, speed: 5 },
	},
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
	gloveSlap: {
		damage: 130,
		rate: 1,
		windup: 0.2,
		backswing: 0.25,
		range: 3.5,
		radius: 0.35,
		critEvery: 3,
		critMultiplier: 1.5,
	},
	toss: { damage: 120, castPoint: 0.35, range: 7, speed: 20, radius: 0.35, cooldown: 5 },
	catch: {
		damageReduction: 0.25, // playtest starting value, not a balance claim
		castPoint: 0,
		duration: 1,
		radius: 2,
		angle: 100,
		speedFactor: 0.5,
		cooldown: 10,
		resetCooldown: 3,
	},
	dive: { castPoint: 0, range: 4, time: 0.25, prone: 0.4, radius: 2, angle: 360, cooldown: 12 },

	// Q, Loose: a line skillshot, first hit.
	loose: {
		damage: 230, // about 2.5 autos: worth the aim, the miss risk and Mitts's catch
		castPoint: 0.3,
		range: 11,
		speed: 20, // Ground line plus flight gives an 8 m dodge deadline of about 0.52 s.
		radius: 0.3,
		cooldown: 4,
		height: 1.1, // flight height, for presentation only
		nearMiss: 0.8, // a pass this close to a body's edge cues "close"
	},
	rain: {
		damage: 180,
		castPoint: 0,
		range: 7,
		radius: 2.5,
		delay: 0.7,
		slow: 0.3,
		duration: 1.5,
		cooldown: 6,
	},
	vault: { castPoint: 0, range: 4, time: 0.18, cooldown: 3 },
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
		hp: 1400,
		tell: 0.4, // an enemy-visible line before the sparring dummy releases Q
		castEvery: 4, // one sparring dummy casts Loose back while in range
		respawn: 2,
	},
}

// The body's movement profile is the hero section; its extra keys are ignored by the body.
export const profile = tune.hero
