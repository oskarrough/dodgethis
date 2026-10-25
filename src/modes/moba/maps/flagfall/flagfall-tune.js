// Flagfall's tunables, spread into tune.flagfall by ../../tune.js (all-tunes.js).

// Flagfall: two lanes on the shared court in the shallows. All geometry applies on restart.
const flagfall = {
	name: 'Flagfall',
	late: 360,
	scale: 1, // one multiplier for every layout metre; applies on restart
	// Flagfall by night: Overthrow's stone isle (isle.js) under a moon. These replace
	// overthrowTerrain's keys of the same name; the rest (cliff, spires, stone) are shared.
	// The surround is darkest, the court one clear step lighter, units and glows lightest.
	palette: {
		page: 0x1b1733,
		courtShade: 0x454b73,
		scenery: 0x777b9f,
		court: 0x183a44,
		leaf: 0x2c5660,
		leafDeep: 0x9b6657,
		bowl: 0xa473b8, // orchid petals; this map has no bowl props
	},
	carving: {
		blockWidth: 2.2,
		joint: 0.035,
		bevel: 0.09,
		chip: 0.12,
		footHeight: 0.28,
		capHeight: 0.34,
		capStep: 0.12,
		faceInset: 0.25,
		panelBorder: 0.09,
		panelGap: 0.06,
		relief: 0.18,
		petals: 8,
		petalSides: 8,
		petalWidth: 0.28,
		flowerRadius: 0.48,
		flowerHeart: 0.2,
		mossChance: 0.25,
		mossLobes: 5,
		mossHeight: 0.08,
		mossReach: 0.32,
		mossEdge: 0.9,
		mossDrop: 0.4,
	},
	lichen: { lobes: 4, squash: 0.16, chance: 0.6, radius: 0.14 },
	floor: {
		style: 'mapped',
		image: '/tiles/flags-drawn.webp',
		size: 5,
		base: '#8783a5',
		joint: '#716d92',
		accent: '#716d92',
		vary: 0.1,
	},
	// Painted decals on the court (floor-decals.js): moss, petals, cracks, moon inlays.
	decals: {
		image: '/art/flagfall-decals.webp',
		grid: 4,
		count: 160,
		size: [1.8, 4.2],
		strength: 0.75,
		mute: 0.35,
		seed: 7,
		clear: 0.5,
		skip: [12, 14], // the dotted ring and the tracks read as telegraphs and arrows
	},
	look: {
		contact: { reach: 1.2, strength: 0.2 },
		shadow: 0.45,
		clouds: { scale: 26, speed: 0.3, strength: 0.035 },
		border: 0,
		joints: 0.025,
	},

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
		cloudLit: '#64629b',
		cloud: '#424876',
		cloudShade: '#30365e',
		cloudDeep: '#222647',
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
		y: -90,
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
		size: 22,
		color: '#cbb9e8',
		seas: '#a18bc9',
		limb: '#f4e7ed',
		terminator: '#b39dd6',
		bloom: 0x352c50,
	},
	sky: {
		cloudScale: 20,
		stars: { at: [-82, -27, -34], spread: [26, 14] },
		galaxy: { at: [-82, -27, -34], size: [36, 10], roll: 0.5, color: '#b0a4d5', strength: 0.42 },
		isles: {
			anchors: [
				[-87, -52, -52.5, 1.65],
				[-103, -64, -76.5, 1.5],
				[-81, -64, -38.5, 1.65],
				[-79, -60, -18.5, 1.4],
				[-87, -80, -30.5, 1.7],
				[-121, -68, -88.5, 1.6],
			],
			count: 26,
			near: 50,
			far: 110,
			radius: [1, 2],
			drop: [45, 70],
			haze: '#363c60',
			shade: '#303952',
			stone: '#505982',
			lit: '#7279a1',
			windows: '#eee1c7',
			bloom: 0x6c5b39,
		},
	},
	rim: {
		density: 1,
		ruins: 0.7,
		trees: 0,
		bones: 0,
		reach: 0.4,
		depth: 5,
		ruinSize: 1.1,
		ruinCourses: 2,
		treeHeight: 1.8,
		strata: { height: [3.5, 7], depth: [0.5, 1], tilt: 0.12, gaps: 0.2 },
		tree: { lean: 0.65 },
		lichen: { lobes: 4, squash: 0.16 },
	},
	// The night garden: deep-teal leaf fans and orchid bells over the rim, glowing cream.
	garden: {
		density: 1, // fans per rim segment
		chance: 0.55,
		sink: 0.25, // m under the rim the clump roots
		leaves: 7,
		leaf: [0.9, 3.2], // length range, m
		width: 0.42,
		low: 0.35, // m the near rims' leaves may rise, so they never cover the court
		tall: 1.4, // the far rim's
		bells: 3,
		bell: 0.55,
		glow: '#fff2d6',
		bloom: 0x8a7448,
	},
	// Poured enamel in small basins below the rim, mirrored at both ends.
	ledgePools: {
		sites: [
			{ fraction: -0.55, drop: 5.5, radius: 2.2 },
			{ fraction: 0.05, drop: 6, radius: 2.5 },
			{ fraction: 0.62, drop: 5, radius: 2.1 },
		], // rim fraction, drop and radius
		reach: 5.2,
		squash: 0.72,
		depth: 4,
		fill: 0.85,
		segments: 40,
		line: 0.022,
		violet: '#363d65',
		teal: '#355c68',
		ripple: '#9cbfc7',
	},
	specks: { count: 90, near: 15, far: 80, y: [-30, -3], size: 0.18, color: '#f3ecff' },
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
	// Two 7 m lanes on the shores; between them a 25 m jungle of rooms, walls and brush, deep enough
	// that every camp stands over 3 m outside its nearest tower's range.
	bounds: { halfX: 52, halfZ: 19.5 },
	lane: { innerZ: 12.5, outerZ: 19.5, centreZ: 16, pathZ: 16 }, // waves and towers walk the shore side
	baseX: 46,
	plaza: { x: 30 }, // |x| past which each base opens onto both lanes
	clearing: { halfX: 10, halfZ: 10.5 }, // the open middle, where the flag will stand
	// The jungle's rim along each lane: hedge runs over |x|; the holes between are the ways in.
	hedge: {
		innerZ: 10.5,
		outerZ: 12.5,
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
		end: { x: [28, 30], z: [1.5, 10.5] },
		brush: [
			{ x: [12, 16], z: [7, 10.5] }, // inside each room's inner lane hole
			{ x: [22, 26], z: [7, 10.5] }, // and its outer one
		],
		midBrush: { halfX: 2, z: [7, 10.5] }, // the clearing's two lane holes
		camps: { x: 19, z: 4.25 }, // mercenary camps (`camps.js`): a lantern and a chalk square
		frontGate: 'laser', // one gate per lane, in front of the fort, so melee and straight shots can't reach it (Oskar, 2026-10-11)
		gatehouseX: 29, // where the front gate stands, in front of each fort (gates.js)
		laserX: 0, // a second laser gate between fort and core; 0 means none
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

export default { flagfall }

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	'flagfall.ledgePools': 'm',
	'flagfall.ledgePools.sites.0.fraction': 'fraction',
	'flagfall.ledgePools.sites.1.fraction': 'fraction',
	'flagfall.ledgePools.sites.2.fraction': 'fraction',
	'flagfall.ledgePools.segments': 'count',
	'flagfall.ledgePools.fill': 'fraction',
	'flagfall.ledgePools.squash': 'fraction',
	'flagfall.moon.bloom': 'color',
	'flagfall.sky': 'm',
	'flagfall.sky.galaxy.roll': 'rad',
	'flagfall.sky.galaxy.strength': 'fraction',
	'flagfall.sky.isles.count': 'count',
	'flagfall.sky.isles.bloom': 'color',

	'flagfall.rim': 'm',
	'flagfall.rim.density': 'count',
	'flagfall.rim.ruins': 'fraction',
	'flagfall.rim.trees': 'fraction',
	'flagfall.rim.bones': 'fraction',
	'flagfall.rim.ruinCourses': 'count',
	'flagfall.rim.lichen.lobes': 'count',
	'flagfall.garden.density': 'count',
	'flagfall.garden.bloom': 'color',

	'flagfall.carving': 'm',
	'flagfall.carving.petals': 'count',
	'flagfall.carving.petalSides': 'count',
	'flagfall.carving.petalWidth': 'fraction',
	'flagfall.carving.flowerRadius': 'fraction',
	'flagfall.carving.flowerHeart': 'fraction',
	'flagfall.carving.mossLobes': 'count',
	'flagfall.carving.mossChance': 'fraction',
	'flagfall.carving.mossEdge': 'fraction',
	'flagfall.lichen.lobes': 'count',
	'flagfall.floor.vary': 'fraction',
	'flagfall.decals.strength': 'fraction',
	'flagfall.decals.mute': 'fraction',
	'flagfall.decals.count': 'count',
	'flagfall.decals.grid': 'count',
	'flagfall.decals.seed': 'count',
	'flagfall.decals.skip': 'count',
	'flagfall.decals.size': 'm',
	'flagfall.decals.clear': 'm',
	'flagfall.look': 'm',
	'flagfall.look.clouds.speed': 'm/s',
	'flagfall.look.clouds.strength': 'fraction',
	'flagfall.look.contact.strength': 'fraction',
	'flagfall.look.shadow': 'fraction',
	jungle: 'm',
	'hedge.runs': 'm',
	'flagfall.gaps': 'm',
	'moon.at': 'm',
	leaf: 'm',
	'print.layers': 'height m',
	'print.radii': 'm',
	'flagfall.dunk.flight': 'm',
	'flagfall.dunk.sink': 's',
	'flagfall.garden.sink': 'm',
	'flagfall.garden.low': 'height m',
	'flagfall.garden.tall': 'height m',
	'flagfall.garden.bell': 'm',
	'flagfall.flag.every': 's',
	'flagfall.flag.silence': 's',
	'flagfall.flag.pole': 'height m',
	'flagfall.pool.strength': 'fraction',
	'flagfall.pool.spread': 'fraction',
	'flagfall.kerb.offset': 'multiplier',
	'flagfall.kerb.ends': 'm',
	'flagfall.glow.post': 'height m',
}
