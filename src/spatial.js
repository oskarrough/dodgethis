// Nearest item to a point on the XZ plane. The game keeps asking this — nearest
// enemy, nearest grounded arrow, nearest pickup — so it lives once here. `ok`
// filters candidates; callers range-gate afterward with the returned d2 (squared
// distance) so the loop stays a single pure scan.
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
