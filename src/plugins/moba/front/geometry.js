const ridge = [
	[0, 778],
	[195, 760],
	[374, 748],
	[533, 725],
	[660, 743],
	[797, 753],
	[952, 738],
	[1153, 732],
	[1440, 767],
]
export const ridgePath =
	`M${ridge[0].join(' ')} ` +
	Array.from(
		{ length: 4 },
		(_, i) => `Q${ridge[i * 2 + 1].join(' ')} ${ridge[i * 2 + 2].join(' ')}`,
	).join(' ')

export function projectRidge(width, height, screenX) {
	const shot = projectFrame(width, height)
	const x = Math.max(0, Math.min(1440, shot.worldX(screenX)))
	const index = [2, 4, 6, 8].find((index) => ridge[index][0] >= x)
	const [a, b, c] = ridge.slice(index - 2, index + 1)
	const coordinate = (t, k) => (1 - t) ** 2 * a[k] + 2 * (1 - t) * t * b[k] + t * t * c[k]
	let lo = 0,
		hi = 1
	for (let i = 0; i < 24; i++) {
		const t = (lo + hi) / 2
		if (coordinate(t, 0) < x) lo = t
		else hi = t
	}
	return shot.point(x, coordinate((lo + hi) / 2, 1))
}

// The same slice projection anchors the DOM sign and the four SVG planes.
export function projectFrame(width, height) {
	const scale = Math.max((width * 1.1) / 1440, (height * 1.1) / 900)
	return {
		scale,
		point: (x, y) => ({ x: width / 2 + (x - 720) * scale, y: height * 1.05 + (y - 900) * scale }),
		worldX: (x) => 720 + (x - width / 2) / scale,
		signX: width / 2 + (800 - 720) * scale,
		ground: -height * 0.05 + (900 - 750) * scale,
	}
}

export function easePointer(current, target, dt, response) {
	const blend = 1 - Math.exp(-Math.max(0, dt) / response)
	return current + (target - current) * blend
}
