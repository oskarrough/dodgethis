export default {
	// The tile room (tileroom-layout.js, tileroom-view.js): six floor swatches in two rows on
	// Overthrow's isle, the hero spawning in the middle. All of it applies on restart.
	tileroom: {
		halfX: 29,
		halfZ: 19,
		swatchHalfX: 8,
		swatchHalfZ: 7.5,
		border: 0.18, // a worn kerb of darker stone around each swatch
		wall: { x: 2.5, z: -4.2, halfX: 3, halfZ: 0.6 },
		pillar: { x: -4.5, z: 1.5, r: 0.8 },
		label: { z: 8.7, height: 1.1 }, // outside each swatch, toward the rim
		// Shared by every swatch: soft contact darkening at the foot of cover, the baked sun
		// shadow, and slow cloud shadows drifting over the floor.
		contact: { reach: 1.2, strength: 0.32 },
		shadow: 0.42,
		clouds: { scale: 22, speed: 0.6, strength: 0.07 },
		swatches: [
			{
				style: 'print',
				name: '1 Today: flat print',
				x: -18,
				z: -8.5,
				base: '#e9dcc4',
				joint: '#d8c8ad',
				accent: '#d8c8ad',
				size: 3,
				vary: 0.025,
			},
			{
				style: 'slabs',
				name: '2 Square slabs',
				x: 0,
				z: -8.5,
				base: '#ecdfc8',
				joint: '#cdbb9c',
				accent: '#e2d2b4',
				size: 1.6,
				vary: 0.06,
			},
			{
				style: 'flags',
				name: '3 Terracotta flagstones',
				x: 18,
				z: -8.5,
				base: '#dca37e',
				joint: '#b97d5c',
				accent: '#e5b493',
				size: 1.3,
				vary: 0.07,
			},
			{
				style: 'bricks',
				name: '4 Laid pavers',
				x: -18,
				z: 8.5,
				base: '#d9b9a3',
				joint: '#b8937c',
				accent: '#e4c8b4',
				size: 0.55,
				vary: 0.06,
			},
			{
				style: 'sand',
				name: '5 Drifted sand',
				x: 0,
				z: 8.5,
				base: '#efd9b4',
				joint: '#d9bd93',
				accent: '#f7e8cc',
				size: 0.9,
				vary: 0.05,
			},
			{
				style: 'dial',
				name: '6 Arena inlay: sundial',
				x: 18,
				z: 8.5,
				base: '#ebe0cb',
				joint: '#c9b799',
				accent: '#b8805e',
				size: 1.6,
				vary: 0.05,
			},
		],
	},
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	tileroom: 'm',
	'tileroom.contact.strength': 'fraction',
	'tileroom.shadow': 'fraction',
	'tileroom.clouds.speed': 'm/s',
	'tileroom.clouds.strength': 'fraction',
}
