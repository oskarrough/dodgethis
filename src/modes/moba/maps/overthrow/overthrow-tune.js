// Overthrow's tunables, assembled into tune.map and tune.overthrowTerrain by ../../tune.js.

// Match clock and static layout; geometry applies on mode restart.
export const overthrowMap = {
	name: 'Overthrow',
	late: 180, // late game from 3:00 on this map (Oskar, 2026-10-11)
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
}

// Shared match presentation, first built for Overthrow; applies on map restart.
export const overthrowTerrain = {
	margin: 1.6,
	jag: 0.8,
	step: 3,
	seed: 73,
	rockFlare: 1.4,
	groundY: 0.005,
	chalkY: 0.01,
	patchScale: 3,
	patchContrast: 0.025,
	chalkWidth: 0.11,
	courtInset: 1.4,
	chalkSegments: 96,
	// Overthrow by day (scenery.js): the court is the flat top of a stone isle over a sea of cloud.
	// Metres; everything applies on restart.
	cliff: {
		depth: 46, // the face falls out of frame into cloud
		levels: 9, // stacked ledges, finer near the rim
		flare: 0.32, // outward lean per metre of drop: wider at the bottom, so it reads from above
		ledge: 0.9, // the odd outward step between levels
		column: 0.55, // in-out jitter between neighbouring columns
		lipMin: 0.12, // the moss lip reaches this far onto the court's margin…
		lipMax: 0.7, // …to this, never past the margin into the walkable court
		mossMin: 0.2, // and hangs this far down the face…
		mossMax: 1.1, // …to this, broken along the rim
		strata: 1.7, // ink strata spacing on vertical faces
		strataInk: 0.4,
		rimInk: 0.035, // the thin ink line along the cliff top
	},
	haze: { top: 1.5, bottom: 55, power: 1.3, max: 0.84, near: 18, far: 150 },
	// The sea of cloud below the rim: printed bands, drifting slowly; pause freezes it.
	clouds: {
		y: -34,
		size: 900,
		scale: 34, // metres per cloud
		drift: [0.5, 0.18], // metres per second
		puffs: 48, // banks hugging the isle below the rim
		puffMin: 4,
		puffMax: 8,
		puffDepth: [11, 26],
		bob: 0.6,
	},
	// Far stone rising out of the cloud, lower and hazier with distance; never above the rim.
	spires: { count: 22, arches: 3, near: 10, far: 75, sides: 6, radius: [1.6, 4.2] },
	// Waterfalls draped down the cliff from the rim: x, z near the rim, width.
	falls: [
		{ x: 36, z: 15, width: 2.6 },
		{ x: -22, z: 15, width: 1.8 },
		{ x: -55, z: -7, width: 2.2 },
		{ x: 55, z: 6, width: 2 },
	],
	fallSpeed: 7,
	colors: {
		tarmac: '#d4cea9', // the court: pale sage stone
		chalk: '#c3bd99', // worn stone inlays, under 10% darker than the court
		moss: '#8f9444',
		mossShade: '#5c6031',
		stoneLit: '#7f7079',
		stone: '#5a5065',
		stoneShade: '#3b3550',
		ink: '#26445f',
		haze: '#ebcfb8',
		cloudLit: '#fcecdc',
		cloud: '#efd5c0',
		cloudShade: '#d4b5ab',
		cloudDeep: '#9d8899',
		water: '#f6f2f4',
		waterShade: '#a8a1bd',
	},
	// One low warm sun from the upper left: lit faces warm, shade violet.
	light: {
		dir: [-0.7, 0.62, -0.25], // toward the sun
		sun: 0xffdcb0, // lit band leans warm
		shade: 0x403965, // dark band and halftone lean violet, never black
		bandMix: [0.34, 0.4],
		shadow: '#655d8c', // printed cast shadows lean the court toward this violet…
		shadowStrength: 0.48, // …by this much
		shadowLength: 0.6, // fraction of the true projected length
		shadowPixelsPerMetre: 16,
	},
	// Cover, base walls and pillars as chipped stone on the unchanged collision shapes.
	stone: {
		wallCourses: 3,
		blockMin: 1.4,
		blockMax: 2.6,
		joint: 0.05, // the gap the ink reads as a joint
		bevel: 0.09, // chipped edges
		sag: 0.14, // top blocks sit up to this much low, never above the collider
		inset: 0.06,
		mossChance: 0.75,
		mossHeight: 0.1,
		sides: 8,
		drums: [
			[0.42, 1],
			[0.33, 0.93],
			[0.25, 0.86],
		], // share of pillar height, radius scale; wider at the bottom
		capScale: 0.98,
		capHeight: 0.16,
	},
	// Lavender-grey stone (walls, cover), pale stone (pillars, towers), moss.
	palette: { page: 0xebcfb8, courtShade: 0x968a9e, scenery: 0xc4b8aa, court: 0x86904a },
}

// Overthrow alone: the shared defaults above still belong to Flagfall and the lobby.
// Geometry applies on restart; colours, haze and the sun are live style values.
const overthrow = {
	...structuredClone(overthrowTerrain),
	scale: 1,
	carving: {
		blockWidth: 2.6,
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
		petalSides: 4,
		petalWidth: 0.28,
		flowerRadius: 0.48,
		flowerHeart: 0.2,
		mossChance: 0.38,
		mossLobes: 5,
		mossHeight: 0.1,
		mossReach: 0.5,
		mossEdge: 1,
		mossDrop: 0.5,
		mossDetail: 0,
	},
	pillarRelief: 0.2,
	sky: {
		cloudScale: 22,
		birds: { count: 18, near: 12, spread: 25, drop: 14, size: 0.18 },
		rows: 4,
		count: 11,
		near: 14,
		spacing: 11,
		drop: 18,
		dropStep: 16,
		haze: { top: 0, bottom: 65, power: 0.85, max: 0.9, near: 20, far: 160 },
		colors: { stoneLit: '#b1a6b1', stone: '#95889e', stoneShade: '#91879e' },
		waterfall: { width: 0.9, height: 1.15, mist: 2.4, lip: 0.12 },
		radius: [2, 3.6],
		height: [5, 8],
		sides: 7,
		levels: 2,
		taper: 0.15,
		gaps: 0.3,
		grass: 5,
		ivy: 1,
		lichen: { lobes: 3, squash: 0.6, sides: 6, rows: 3 },
	},
	rim: {
		density: 1,
		ruins: 0.62,
		trees: 0,
		bones: 0,
		reach: 0.5,
		depth: 3,
		ruinSize: 1.4,
		lichen: { lobes: 3, squash: 0.5, sides: 7, rows: 3 },
		pillars: {
			radius: [1.4, 2.5],
			height: [10, 16],
			drop: 2,
			sides: 10,
			levels: 3,
			taper: 0.25,
			gaps: 0.25,
			ivy: 3,
			grass: 8,
		},
	},
	lichen: { lobes: 5, squash: 0.18, sides: 5, rows: 3 },
	floor: {
		style: 'mapped',
		image: '/tiles/flags-drawn.webp',
		size: 5,
		base: '#e1e2c3',
		joint: '#bfc6a4',
		accent: '#d0d7b6',
		vary: 0.1,
	},
	decals: {
		image: '/art/overthrow-decals.webp',
		grid: 4,
		count: 110,
		size: [1.6, 3.6],
		strength: 0.9,
		mute: 0.2,
		seed: 9,
		clear: 0.5,
		skip: [],
	},
	look: {
		contact: { reach: 1.2, strength: 0.15 },
		shadow: 0.32,
		clouds: { scale: 32, speed: 0.25, strength: 0.025 },
		border: 0,
		joints: 0.025,
	},
	colors: {
		...overthrowTerrain.colors,
		tarmac: '#e1e2c3',
		chalk: '#c3bd99',
		moss: '#9eae68',
		mossShade: '#53654a',
		stoneLit: '#99909b',
		stone: '#74677e',
		stoneShade: '#4b445f',
		haze: '#dbe1cc',
		cloudLit: '#f4f0d7',
		cloud: '#dce0ca',
		cloudShade: '#b6c6bc',
		cloudDeep: '#91a9a7',
	},
	palette: {
		page: 0xdbe1cc,
		courtShade: 0x948a9f,
		scenery: 0xc2bca7,
		court: 0x77875a,
		leaf: 0x9cbd54,
		leafDeep: 0x608744,
	},
	light: {
		...overthrowTerrain.light,
		dir: [-0.65, 0.78, -0.32],
		sun: 0xffeed0,
		shade: 0x4d506b,
		bandMix: [0.23, 0.32],
		shadow: '#77768a',
		shadowStrength: 0.32,
		shadowLength: 0.65,
	},
	haze: { top: 12, bottom: 100, power: 1.5, max: 0.88, near: 30, far: 180 },
	cliff: { ...overthrowTerrain.cliff, flare: 0.26, ledge: 0.3, column: 0.75, strata: 3.2 },
	clouds: { ...overthrowTerrain.clouds, y: -58, puffs: 28, puffDepth: [22, 42] },
	spires: { ...overthrowTerrain.spires, count: 0, arches: 0 },
	falls: [],
}

export default { map: overthrowMap, overthrowTerrain, overthrow }

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	'overthrow.decals': 'm',
	'overthrow.decals.count': 'count',
	'overthrow.decals.grid': 'count',
	'overthrow.decals.seed': 'count',
	'overthrow.decals.skip': 'count',
	'overthrow.decals.strength': 'fraction',
	'overthrow.decals.mute': 'fraction',
	'overthrow.sky': 'm',
	'overthrow.sky.rows': 'count',
	'overthrow.sky.waterfall.width': 'fraction',
	'overthrow.sky.waterfall.height': 'multiplier',
	'overthrow.sky.birds.count': 'count',
	'overthrow.sky.haze.power': 'multiplier',
	'overthrow.sky.haze.max': 'fraction',
	'overthrow.sky.count': 'count',
	'overthrow.sky.sides': 'count',
	'overthrow.sky.levels': 'count',
	'overthrow.sky.taper': 'fraction',
	'overthrow.sky.gaps': 'fraction',
	'overthrow.sky.grass': 'count',
	'overthrow.sky.ivy': 'count',
	'overthrow.sky.lichen.lobes': 'count',
	'overthrow.sky.lichen.rows': 'count',
	'overthrow.sky.lichen.squash': 'fraction',
	'overthrow.rim': 'm',
	'overthrow.rim.density': 'count',
	'overthrow.rim.ruins': 'fraction',
	'overthrow.rim.trees': 'fraction',
	'overthrow.rim.bones': 'fraction',
	'overthrow.rim.lichen.lobes': 'count',
	'overthrow.rim.lichen.rows': 'count',
	'overthrow.rim.pillars.sides': 'count',
	'overthrow.rim.pillars.levels': 'count',
	'overthrow.rim.pillars.taper': 'fraction',
	'overthrow.rim.pillars.gaps': 'fraction',
	'overthrow.rim.pillars.ivy': 'count',
	'overthrow.rim.pillars.grass': 'count',
	'overthrow.carving': 'm',
	'overthrow.carving.petals': 'count',
	'overthrow.carving.petalSides': 'count',
	'overthrow.carving.petalWidth': 'fraction',
	'overthrow.carving.flowerRadius': 'fraction',
	'overthrow.carving.flowerHeart': 'fraction',
	'overthrow.carving.mossLobes': 'count',
	'overthrow.carving.mossChance': 'fraction',
	'overthrow.carving.mossEdge': 'fraction',
	'overthrow.carving.mossDetail': 'count',
	'overthrow.pillarRelief': 'fraction',
	'overthrow.lichen.lobes': 'count',
	'overthrow.lichen.rows': 'count',
	'overthrow.floor.vary': 'fraction',
	'overthrow.look': 'm',
	'overthrow.look.clouds.speed': 'm/s',
	'overthrow.look.clouds.strength': 'fraction',
	'overthrow.look.contact.strength': 'fraction',
	'overthrow.look.shadow': 'fraction',
	map: 'm',
	'spires.radius': 'm',
	printLayers: 'height m',
	markerLayers: 'height m',
	'stone.drums': 'multiplier',
	'overthrowTerrain.patchScale': 'm',
	'overthrow.patchScale': 'm',
}

// Camera spots for `bun run shot overthrow`: [x, z] where hero 0 stands and the camera looks.
export const shots = { tower: [-22, 2], rim: [0, -10], core: [-36, 0] }
