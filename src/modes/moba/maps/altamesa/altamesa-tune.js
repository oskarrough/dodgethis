export default {
	// Altamesa (altamesa-layout.js): one open plateau, entrance in the west. The gate road
	// leads to the central court; the shade wing lies north (−z), the sun wing south (+z), and the
	// Gnomon's stair east, behind the kiln block. Every place here is a placeholder.
	altamesa: {
		halfX: 48,
		halfZ: 32,
		thickness: 1,
		spawnSpacing: 1.5,
		entrance: { x: -44, z: 0 },
		encounters: [
			{ id: 'manos', x: -26, z: 0, wing: 'gate' },
			{ id: 'tinajaBotijo', x: -6, z: 0, wing: 'court' },
			{ id: 'fornax', x: 4, z: -20, wing: 'shade' },
			{ id: 'barquero', x: 24, z: -24, wing: 'shade' },
			{ id: 'carillon', x: 4, z: 20, wing: 'sun' },
			{ id: 'espejo', x: 24, z: 24, wing: 'sun' },
			{ id: 'gnomon', x: 38, z: 0, last: true },
		],
		wings: ['shade', 'sun'],
		waystones: [
			{ x: -42, z: 3 },
			{ x: -36, z: 3 },
			{ x: -17, z: 3 },
			{ x: -6, z: -11 },
			{ x: 14, z: -27 },
			{ x: -6, z: 11 },
			{ x: 14, z: 27 },
			{ x: 28, z: 0 },
		],
		packs: [
			{ x: -36, z: -7, guards: ['melee', 'melee'] },
			{ x: -34, z: 8, guards: ['brute', 'ranged'] },
			{ x: -16, z: -6, guards: ['melee', 'ranged', 'ranged'] },
			{
				x: -14,
				z: 12,
				guards: ['brute', 'melee'],
				patrol: [
					{ x: -14, z: 12 },
					{ x: -14, z: -12 },
				],
			},
			{ x: -4, z: -26, guards: ['melee', 'melee', 'ranged'] },
			{ x: 14, z: -16, guards: ['brute', 'ranged'] },
			{ x: -4, z: 26, guards: ['melee', 'melee', 'ranged'] },
			{ x: 14, z: 16, guards: ['brute', 'ranged'] },
			{
				x: 32,
				z: -12,
				guards: ['brute', 'melee', 'melee'],
				patrol: [
					{ x: 32, z: -12 },
					{ x: 32, z: 12 },
				],
			},
		],
		// Walls (`kind: 'wall'`) and low hedges: the gate road's two sides, the kiln block between
		// the wings, and the gate wall.
		boxes: [
			{ kind: 'wall', x: -31, z: -14, halfX: 9, halfZ: 1 },
			{ kind: 'wall', x: -31, z: 14, halfX: 9, halfZ: 1 },
			{ kind: 'wall', x: 14, z: 0, halfX: 6, halfZ: 7 },
			// The gate wall from rim to rim; Manos keeps the door in its gap.
			{ kind: 'wall', x: -20, z: -18.1, halfX: 1, halfZ: 13.9 },
			{ kind: 'wall', x: -20, z: 18.1, halfX: 1, halfZ: 13.9 },
			{ kind: 'hedge', x: 4, z: -30, halfX: 8, halfZ: 0.6 },
		],
		pillars: [
			{ x: -12, z: -7, r: 1 },
			{ x: -12, z: 7, r: 1 },
			{ x: 0, z: -7, r: 1 },
			{ x: 0, z: 7, r: 1 },
		],
		view: { waystone: { top: 0.5, radius: 0.7, height: 1.4, sides: 8 } },
		// Painted images from public/art/altamesa/ (map-art.js): inlays on the court, a face over
		// every wall, a plate under the isle. Empty until Oskar's paintings land (applies on restart).
		art: {
			inlays: [], // { image, x, z, size, turn (deg), round, opacity }
			walls: null, // { image, size (m per repeat), strength, tint }
			plate: null, // { image, size (m), fade, haze }
		},
		// Dry growth over the walls (overgrowth.js): runs of clumps along the tops, fronds down
		// the faces, tufts at the foot. Never more than `spill` m past a wall (applies on restart).
		overgrowth: {
			seed: 3,
			cover: 0.7, // odds that a run along a wall's top is grown
			run: [2, 6], // metres per run
			step: [0.35, 0.7], // metres between clumps in a run
			clump: [0.4, 0.8], // clump radius in metres
			squash: 0.62,
			hang: 0.6, // odds that a clump drops fronds down its face
			drop: [0.3, 0.8], // how far down the face, as a share of the wall's height
			taper: 0.78, // each frond below is this much of the one above
			spill: 0.25,
			foot: [0.6, 1.6], // metres between tries for a tuft at the foot
			tufts: 0.35, // odds that a try grows one
		},
		// Sandstone cover and pale pillars instead of the green garden roles.
		palette: {
			courtShade: 0xc4865f,
			scenery: 0xcdbcae,
			court: 0xa59c62,
			leaf: 0x93a85c, // sage and olive: a dry mesa's growth, never lawn green
			leafDeep: 0x5e7446,
		},
		// The court is printed with a painted tile (floor-print.js, public/tiles/); the isle's
		// cliff and cloud take the desert's colours (applies on restart).
		floor: {
			// Mapped, not raw: the tile keeps its drawing but is lifted to pale terracotta, so
			// team-red telegraphs and navy ink stay the darkest, loudest marks on the court.
			style: 'mapped',
			image: '/tiles/flags-drawn.webp',
			size: 5, // metres per repeat of the tile
			base: '#f6e3d3',
			joint: '#d9b49c',
			accent: '#d9b49c',
			vary: 0.14, // how much of the drawing survives the lift
		},
		look: {
			contact: { reach: 1.2, strength: 0.3 },
			shadow: 0.42,
			clouds: { scale: 26, speed: 0.6, strength: 0.06 },
			border: 0,
			joints: 0.035,
		},
		isle: {
			tarmac: '#eccfba', // the margin past the tile, close to the flagstones' mean
			chalk: '#eccfba',
			moss: '#a39457',
			mossShade: '#6f6236',
			stoneLit: '#b0705f',
			stone: '#83505a',
			stoneShade: '#55384f',
			haze: '#f1d2b4',
			cloudLit: '#fff0de',
			cloud: '#f3d8c1',
			cloudShade: '#dcb7a8',
			cloudDeep: '#a98a98',
		},
		colors: {
			sand: '#efd9b4',
			stone: '#c65f3a',
			ink: '#26445f',
			sky: '#b7dbe8',
		},
	},
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	altamesa: 'm',
	'altamesa.look.contact.strength': 'fraction',
	'altamesa.look.shadow': 'fraction',
	'altamesa.look.clouds.speed': 'm/s',
	'altamesa.look.clouds.strength': 'fraction',
	'altamesa.floor.vary': 'fraction',
	'altamesa.overgrowth.seed': 'count',
	'altamesa.overgrowth.cover': 'fraction',
	'altamesa.overgrowth.squash': 'fraction',
	'altamesa.overgrowth.hang': 'fraction',
	'altamesa.overgrowth.drop': 'fraction',
	'altamesa.overgrowth.taper': 'fraction',
	'altamesa.overgrowth.tufts': 'fraction',
}
