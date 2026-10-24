export default {
	// The Hollow Mesa (hollowMesa-layout.js): one open plateau, entrance in the west. The gate road
	// leads to the central court; the shade wing lies north (−z), the sun wing south (+z), and the
	// Sundial's stair east, behind the kiln block. Every place here is a placeholder.
	hollowMesa: {
		halfX: 48,
		halfZ: 32,
		thickness: 1,
		spawnSpacing: 1.5,
		entrance: { x: -44, z: 0 },
		encounters: [
			{ id: 'gateOfHands', x: -26, z: 0, wing: 'gate' },
			{ id: 'twinPotters', x: -6, z: 0, wing: 'court' },
			{ id: 'kilnGallery', x: 4, z: -20, wing: 'shade' },
			{ id: 'ferry', x: 24, z: -24, wing: 'shade' },
			{ id: 'bellChoir', x: 4, z: 20, wing: 'sun' },
			{ id: 'mirror', x: 24, z: 24, wing: 'sun' },
			{ id: 'sundial', x: 38, z: 0, last: true },
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
		// Walls (`kind: 'wall'`) and low hedges: the gate road's two sides and the kiln block
		// between the wings.
		boxes: [
			{ kind: 'wall', x: -31, z: -14, halfX: 9, halfZ: 1 },
			{ kind: 'wall', x: -31, z: 14, halfX: 9, halfZ: 1 },
			{ kind: 'wall', x: 14, z: 0, halfX: 6, halfZ: 7 },
			{ kind: 'hedge', x: 4, z: -30, halfX: 8, halfZ: 0.6 },
		],
		pillars: [
			{ x: -12, z: -7, r: 1 },
			{ x: -12, z: 7, r: 1 },
			{ x: 0, z: -7, r: 1 },
			{ x: 0, z: 7, r: 1 },
		],
		view: { waystone: { top: 0.5, radius: 0.7, height: 1.4, sides: 8 } },
		colors: {
			sand: '#efd9b4',
			stone: '#c65f3a',
			ink: '#26445f',
			sky: '#b7dbe8',
		},
	},
}
