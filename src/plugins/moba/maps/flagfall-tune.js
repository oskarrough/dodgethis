// Flagfall's tunables, assembled into tune.flagfall by ../tune.js.

// Flagfall: two lanes on the shared court in the shallows. All geometry applies on restart.
export const flagfall = {
	name: 'Flagfall',
	scale: 1, // one multiplier for every layout metre; applies on restart
	// Flagfall by night: Overthrow's stone isle (isle.js) under a moon. These replace
	// overthrowTerrain's keys of the same name; the rest (cliff, spires, stone) are shared.
	// The surround is darkest, the court one clear step lighter, units and glows lightest.
	palette: { page: 0x1b1733, courtShade: 0x6a6390, scenery: 0x8a83ab, court: 0x1d4541 },
	colors: {
		tarmac: '#6d6597', // the court: mid-violet, greyed so team blue stays its own hue
		chalk: '#635b8b', // worn stone inlays, under 10% darker than the court
		moss: '#3a7068',
		mossShade: '#264b4a',
		stoneLit: '#463e6e',
		stone: '#362f5a',
		stoneShade: '#272146',
		ink: '#1c2244',
		haze: '#1d1839',
		cloudLit: '#4c4280',
		cloud: '#372f65',
		cloudShade: '#2a2353',
		cloudDeep: '#1f1940',
		water: '#fbf9ff',
		waterShade: '#c6bfe4',
	},
	// One cool moon from the upper left: lit faces pale lilac, shade deep violet.
	light: {
		dir: [-0.6, 0.72, -0.35],
		sun: 0xdde2ff,
		shade: 0x2a2450,
		bandMix: [0.1, 0.45], // linear mixes: a strong lit band would lift the night's darks
		shadow: '#4a4277',
		shadowStrength: 0.38,
		shadowLength: 0.45,
		shadowPixelsPerMetre: 16,
	},
	// A soft pool of moonlight on the court, falling off toward the rim.
	pool: { strength: 0.16, spread: 0.95 },
	haze: { top: 1.2, bottom: 24, power: 0.8, max: 0.93, near: 14, far: 100 },
	clouds: {
		y: -34,
		size: 900,
		scale: 38,
		drift: [0.3, 0.1],
		puffs: 40,
		puffMin: 4,
		puffMax: 8,
		puffDepth: [12, 28],
		bob: 0.5,
	},
	falls: [],
	// A big lilac moon low in the void past Blue's end, rising out of the cloud.
	moon: {
		at: [-80, -24, -12],
		size: 24,
		color: '#d4cbf2',
		seas: '#bfb3e6',
		ink: '#1c2244',
		halo: '#b9a9ee',
		haloScale: 1.5, // never bloom past its source
		haloOpacity: 0.2,
	},
	// The night garden: deep-teal leaf fans and orchid bells over the rim, glowing cream.
	garden: {
		every: 1, // rim points between clumps
		chance: 0.6,
		sink: 0.25, // m under the rim the clump roots
		leaves: 5,
		leaf: [1.1, 2.1], // length range, m
		width: 0.42,
		low: 0.35, // m the near rims' leaves may rise, so they never cover the court
		tall: 1.4, // the far rim's
		bells: 2,
		bell: 0.32,
		flower: '#b98fe0', // orchid: never coral, never a team hue
		glow: '#fff2d6',
		glowSize: 0.55,
		glowHalo: 2,
		glowHaloOpacity: 0.22,
	},
	// Sparse cream specks drifting in the dark below the rim.
	specks: { count: 160, near: 2, far: 60, y: [-30, -3], size: 0.5, color: '#f3ecff' },
	// The shore kerb: low coursed stone on the safe rim, cut at the dunk gaps. Metres.
	kerb: { height: 0.55, depth: 0.55, offset: 0.45, ends: 0.3 }, // offset: share of the margin
	// Cream glows: lantern bulbs and halos. Small; never past their source.
	glow: {
		color: '#fff2d6',
		lantern: 0.2,
		halo: 3,
		haloOpacity: 0.45,
		post: 2.2,
		postRadius: 0.22,
	},
	// Presentation only: how far a dunked body falls, and the minimap's void.
	water: { drop: 3, color: '#2b2550' },
	// Two 7 m lanes on the shores; between them an 18 m jungle of rooms, walls and brush.
	bounds: { halfX: 52, halfZ: 16 },
	lane: { innerZ: 9, outerZ: 16, centreZ: 12.5, pathZ: 12.5 }, // waves and towers walk the shore side
	baseX: 46,
	plaza: { x: 30 }, // |x| past which each base opens onto both lanes
	clearing: { halfX: 10, halfZ: 7 }, // the open middle, where the flag will stand
	// The jungle's rim along each lane: hedge runs over |x|; the holes between are the ways in.
	hedge: {
		innerZ: 7,
		outerZ: 9,
		runs: [
			[4, 12],
			[16, 22],
			[26, 30],
		],
	},
	// Four rooms (each half, each flank): a stone spine splits north from south, an end wall
	// shuts the base side, so each room opens on two lane holes and the clearing. Metres, |x| and |z|.
	jungle: {
		spine: { x: [10, 30], halfZ: 1.5 },
		end: { x: [28, 30], z: [1.5, 7] },
		brush: [
			{ x: [12, 16], z: [3.5, 7] }, // inside each room's inner lane hole
			{ x: [22, 26], z: [3.5, 7] }, // and its outer one
		],
		midBrush: { halfX: 2, z: [3.5, 7] }, // the clearing's two lane holes
		camps: { x: 19, z: 4.25 }, // mercenary camps (`camps.js`): a lantern and a chalk square
		gatehouseX: 29, // the gatehouses in front of each fort (gates.js, tune.gatehouse)
		laserX: 37, // the laser gates between each fort and the core (gates.js, tune.laser)
	},
	// Dunk gaps in the shore fence: |x| ranges, mirrored to both halves of both shores.
	gaps: [[5, 11]],
	pillarRadius: 0.8,
	spawns: { A: { x: -49, z: 0 }, B: { x: 49, z: 0 } },
	structures: { towerX: 18, fortX: 32, coreX: 42 },
	waveSpawnX: 40,
	// Lanterns: one on each camp, one on the flag. Marks for now.
	posts: [
		{ x: 0, z: 0 },
		{ x: -19, z: 4.25 },
		{ x: -19, z: -4.25 },
		{ x: 19, z: 4.25 },
		{ x: 19, z: -4.25 },
	],
	// The centre flag (flag.js): hoisted on a fixed clock at the chalk cross, taken by holding
	// its ring with no enemy hero inside. Seconds unless noted; live.
	flag: {
		first: 90, // the first hoist
		every: 150, // then on this clock, whatever the last round did
		lateEvery: 90, // from `late` on
		late: 600,
		warn: 30, // the pole climbs this long before a hoist
		window: 60, // up this long; nobody's bar full by then, it lowers
		radius: 3.5, // m, the ring you stand in (layout scale applies)
		hold: 6, // s one hero alone fills the bar; an enemy in the ring freezes it
		extraHolder: 0.25, // each extra ally in the ring fills this much faster
		decay: 0.5, // an empty ring drains at this share of the fill rate
		xp: 300, // team XP to the taker
		silence: { tower: 20, fort: 30, core: 35 }, // the loser's frontmost structure per lane
		pole: 3.2, // m, presentation only
	},
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
		wet: '#9fe3d8', // the slick print: a pale teal glow, never a team hue
		wetOpacity: 0.3,
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
	},
}
