import { sandstone, carvedBlock, brokenArch, ruinStair } from '../../carve.js'

// All standing stone is inside existing cover or beyond the walking bounds. The old
// builders left capitals and tools on their walls, not invisible obstacles on the road.
export function remnants({ layout, m, print, material }, s) {
	const red = []
	const pale = []
	const put = (geometry, x, y, z, turn = 0, parts = red) => {
		parts.push(geometry.rotateY(turn).translate(x, y, z))
	}
	for (const b of layout.boxes.filter((b) => b.kind === 'wall')) {
		const alongX = b.halfX > b.halfZ
		const length = alongX ? b.halfX : b.halfZ
		for (let n = -length + 2; n < length - 1; n += 5.2) {
			const x = b.x + (alongX ? n : 0)
			const z = b.z + (alongX ? 0 : n)
			put(carvedBlock(0.46, s.walls), x, m.wallHeight + 0.3, z, n * 0.13)
			put(sandstone(0.6, 0.12, 0.36, 0.08), x + 0.5, m.wallHeight + 0.08, z, 0.4, pale)
		}
	}
	// The council's four pillars carry square, worn capitals, still within their footprint.
	for (const p of layout.pillars)
		put(sandstone(1.25, 0.22, 1.25, 0.07), p.x, m.pillarHeight + m.capHeight, p.z, 0, pale)
	// The southern wing catches the sun on low, broken stairs. The northern wing is
	// hemmed by taller arch fragments whose openings frame the cold cloud beyond.
	for (const x of [-8, 5, 20, 35]) {
		put(ruinStair(1.7), x, -0.7, 34.6, 0)
		put(brokenArch(2.1, s.walls), x, -0.6, -35.2, Math.PI)
	}
	// A pair of monumental, broken jambs beyond the eastern edge frame the last court.
	for (const side of [-1, 1]) {
		put(brokenArch(4.2, s.walls), 52, -0.7, side * 10.5, -Math.PI / 2)
		put(ruinStair(2.6), 51.5, -1.4, side * 19, Math.PI / 2)
	}
	print(red, material('courtShade'), 'altamesa-builders-remnants')
	print(pale, material('scenery'), 'altamesa-worn-capitals')
}
