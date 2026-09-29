// The same slice projection anchors the DOM sign and the four SVG planes.
export function projectFrame(width, height) {
	const scale = Math.max((width * 1.1) / 1440, (height * 1.1) / 900)
	return {
		scale,
		signX: width / 2 + (800 - 720) * scale,
		ground: -height * 0.05 + (900 - 750) * scale,
	}
}

export function easePointer(current, target, dt, response) {
	const blend = 1 - Math.exp(-Math.max(0, dt) / response)
	return current + (target - current) * blend
}
