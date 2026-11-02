import { sandstone, carvedBlock, brokenArch, brokenColumn, ruinStair } from '../../carve.js'

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
	for (const p of layout.pillars.filter((p) => !p.ruin))
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
	// The side courts. A broken arch spans each door off the road, its jamb on the wall's end;
	// the columns stand broken inside their colliders, and Pozo's well is a ring of blocks.
	for (const d of s.doors) {
		// The carving faces the road; turned, the jamb stands on the door's other side.
		const size = d.width * 0.62
		const side = d.z < 0 ? -1 : 1
		put(
			brokenArch(size, s.walls),
			d.x + side * (d.width / 2 - size * 0.325),
			0,
			d.z,
			d.z < 0 ? 0 : Math.PI,
		)
	}
	for (const p of layout.pillars.filter((p) => p.ruin === 'column'))
		put(brokenColumn(p.r * 2, 3 + (Math.round(p.x * 7 + p.z) % 2), s.walls), p.x, 0, p.z, p.x + p.z)
	for (const p of layout.pillars.filter((p) => p.ruin === 'well')) {
		for (let i = 0; i < 10; i++) {
			const a = (i / 10) * Math.PI * 2
			const r = p.r - 0.25
			put(
				sandstone(0.78, 0.62, 0.42, 0.06),
				p.x + Math.cos(a) * r,
				0.31,
				p.z + Math.sin(a) * r,
				-a + Math.PI / 2,
				pale,
			)
		}
		put(carvedBlock(0.5, s.walls), p.x, 0.95, p.z - p.r + 0.2, Math.PI)
	}
	// Vigía looks north through a great broken arch on the rim; Solana's stair falls off the south.
	put(brokenArch(4.6, s.walls), -31, -0.8, -35.4, Math.PI)
	put(ruinStair(3.2), 43, -1.6, 35, 0)
	put(brokenColumn(1.6, 2, s.walls), 48.8, -0.5, 33.5, 0.7)
	print(red, material('courtShade'), 'altamesa-builders-remnants')
	print(pale, material('scenery'), 'altamesa-worn-capitals')
}
