import { tune } from '../tune.js'

export function flagfallLayout() {
	const s = flagfallLayoutTune()
	const bounds = { id: 'flagfall', ...s.bounds }
	const j = s.jungle
	const quarters = (fn) => [-1, 1].flatMap((side) => [-1, 1].map((flank) => fn(side, flank)))
	const rect = (kind, x0, x1, z0, z1) => ({
		kind,
		x: (x0 + x1) / 2,
		z: (z0 + z1) / 2,
		halfX: Math.abs(x1 - x0) / 2,
		halfZ: Math.abs(z1 - z0) / 2,
	})
	const boxes = [
		...[-1, 1].map((side) =>
			rect('wall', side * j.spine.x[0], side * j.spine.x[1], -j.spine.halfZ, j.spine.halfZ),
		),
		...quarters((side, flank) =>
			rect('wall', side * j.end.x[0], side * j.end.x[1], flank * j.end.z[0], flank * j.end.z[1]),
		),
		...quarters((side, flank) =>
			s.hedge.runs.map(([inner, outer]) =>
				rect('hedge', side * inner, side * outer, flank * s.hedge.innerZ, flank * s.hedge.outerZ),
			),
		).flat(),
	]
	// Brush: low cover at the jungle's crossings. Fog hides whoever stands in it.
	const brush = [
		...quarters((side, flank) =>
			j.brush.map((b) =>
				rect('brush', side * b.x[0], side * b.x[1], flank * b.z[0], flank * b.z[1]),
			),
		).flat(),
		...[-1, 1].map((flank) =>
			rect(
				'brush',
				-j.midBrush.halfX,
				j.midBrush.halfX,
				flank * j.midBrush.z[0],
				flank * j.midBrush.z[1],
			),
		),
	]
	const pillars = []
	const lanes = [-1, 1].map((flank) => ({
		id: flank === -1 ? 'south' : 'north',
		path: [
			{ x: -s.waveSpawnX, z: flank * s.lane.pathZ },
			{ x: s.waveSpawnX, z: flank * s.lane.pathZ },
		],
	}))
	const structures = ['A', 'B'].flatMap((team) => [
		...['tower', 'fort'].flatMap((kind) =>
			lanes.map((lane) => ({
				id: `${kind}-${team}-${lane.id}`,
				team,
				lane: lane.id,
				kind,
				after: kind === 'fort' ? [`tower-${team}-${lane.id}`] : [],
				x: (team === 'A' ? -1 : 1) * s.structures[`${kind}X`],
				z: lane.path[0].z,
			})),
		),
		{
			id: `core-${team}`,
			team,
			kind: 'core',
			after: {
				all: lanes.map((lane) => `tower-${team}-${lane.id}`),
				any: lanes.map((lane) => `fort-${team}-${lane.id}`),
			},
			x: (team === 'A' ? -1 : 1) * s.structures.coreX,
			z: 0,
		},
	])
	// Each gap is an x range on one shore (flank −1 south, 1 north); the court's edge is bounds.halfZ.
	const gaps = [-1, 1].flatMap((flank) =>
		[-1, 1].flatMap((side) =>
			s.gaps.map(([inner, outer]) => ({
				flank,
				x0: Math.min(side * inner, side * outer),
				x1: Math.max(side * inner, side * outer),
			})),
		),
	)
	return {
		name: s.name,
		preview: `<rect x="${-s.clearing.halfX}" y="${-s.clearing.halfZ}" width="${s.clearing.halfX * 2}" height="${s.clearing.halfZ * 2}"/>${[-1, 1].map((side) => `<path d="M${-bounds.halfX},${side * s.lane.innerZ} H${bounds.halfX}"/>`).join('')}`,
		settings: s,
		structureStyle: 'stone',
		light: s.light,
		bounds,
		walkingBounds: bounds,
		boxes,
		pillars,
		obstacles: [...pillars, ...boxes],
		brush,
		spawns: s.spawns,
		spawnSpacing: tune.map.spawnSpacing,
		bases: { A: { x: -s.baseX }, B: { x: s.baseX } },
		lanes,
		structures,
		posts: s.posts,
		dummyPosts: s.dummyPosts,
		gaps,
	}
}

// Capture metres once per restart, for both collision and presentation. Fence runs are
// normalised fractions; colours, counts and animation times are deliberately not scaled.
export function flagfallLayoutTune() {
	const source = tune.flagfall
	const scale = Math.max(0.75, Math.min(1, source.scale))
	const metres = (value) =>
		typeof value === 'number'
			? value * scale
			: Array.isArray(value)
				? value.map(metres)
				: Object.fromEntries(Object.entries(value).map(([key, v]) => [key, metres(v)]))
	const scaled = Object.fromEntries(
		[
			'bounds',
			'lane',
			'plaza',
			'clearing',
			'jungle',
			'baseX',
			'waveSpawnX',
			'hedge',
			'gaps',
			'pillarRadius',
			'spawns',
			'structures',
			'posts',
			'dummyPosts',
			'print',
		].map((key) => [key, metres(source[key])]),
	)
	// Print layers are depth slots shared with every other ground print, not layout metres.
	scaled.print.layers = source.print.layers
	return { ...source, scale, water: { ...source.water }, ...scaled }
}
