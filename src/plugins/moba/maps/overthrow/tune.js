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
	haze: { top: 1.5, bottom: 30, power: 0.85, max: 0.94, near: 18, far: 120 },
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
		tarmac: '#cacc98', // the court: butter-green
		chalk: '#babd89', // worn stone inlays, under 10% darker than the court
		moss: '#a3a35e',
		mossShade: '#76784e',
		stoneLit: '#a08c9c',
		stone: '#857a96',
		stoneShade: '#655b7f',
		ink: '#26445f',
		haze: '#f2cdbd',
		cloudLit: '#fdeee3',
		cloud: '#f7d9c9',
		cloudShade: '#efc6c4',
		cloudDeep: '#e6b9bf',
		water: '#fbf9ff',
		waterShade: '#c6bfe4',
	},
	// One low warm sun from the upper left: lit faces warm, shade violet.
	light: {
		dir: [-0.7, 0.62, -0.25], // toward the sun
		sun: 0xffe9c8, // lit band leans warm
		shade: 0x55488a, // dark band and halftone lean violet, never black
		bandMix: [0.36, 0.34],
		shadow: '#7a6fae', // printed cast shadows lean the court toward this violet…
		shadowStrength: 0.42, // …by this much
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
	palette: { page: 0xf2cdbd, courtShade: 0xa99db3, scenery: 0xc6bac6, court: 0x8e9c50 },
}

export default { map: overthrowMap, overthrowTerrain }
