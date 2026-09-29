// Nearest item to a point on the XZ plane; `ok` filters candidates, callers range-gate with the returned squared distance. One pure scan.
export function nearest(items, x, z, ok) {
	let item = null
	let d2 = Infinity
	for (const it of items) {
		if (!ok(it)) continue
		const dx = it.position.x - x
		const dz = it.position.z - z
		const d = dx * dx + dz * dz
		if (d < d2) {
			d2 = d
			item = it
		}
	}
	return { item, d2 }
}
