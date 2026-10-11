import pieces from '../pieces/index.js'

// What maps/index.js exports beyond the map table: lists by kind and order, layouts and recipes.
// A recipe resolves its piece ids against pieces/index.js; each piece keeps its id for views.
export function mapRegistry(maps, fallback) {
	const pick = (id) => maps[id] ?? maps[fallback]
	const layoutOf = (map) => ({
		...map.layout(),
		get late() {
			return map.late
		},
	})
	const playableMaps = Object.keys(maps)
		.filter((id) => maps[id].kind !== 'lobby')
		.sort((a, b) => (maps[a].order ?? 100) - (maps[b].order ?? 100) || a.localeCompare(b))
	return {
		playableMaps,
		onlineMaps: playableMaps.filter((id) => maps[id].online),
		mapLayout: (id = fallback) => layoutOf(pick(id)),
		matchRecipe(id = fallback) {
			const map = pick(id)
			return {
				...map,
				layout: layoutOf(map),
				palette: map.palette(),
				pieces: map.pieces.map((piece) => ({ id: piece, ...pieces[piece] })),
			}
		},
	}
}
