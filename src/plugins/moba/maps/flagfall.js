import { tune } from '../tune.js'

export function flagfallLayout() {
	const s = flagfallLayoutTune()
	const bounds = { id: 'flagfall', ...s.bounds }
	const boxes = [-1, 1].flatMap((side) => [
		{
			kind: 'wall',
			x: (side * (s.baseBlock.innerX + s.baseBlock.outerX)) / 2,
			z: 0,
			halfX: (s.baseBlock.outerX - s.baseBlock.innerX) / 2,
			halfZ: s.baseBlock.halfZ,
		},
		...[-1, 1].flatMap((flank) =>
			s.hedge.runs.map(([inner, outer]) => ({
				kind: 'hedge',
				x: (side * (inner + outer)) / 2,
				z: (flank * (s.hedge.innerZ + s.hedge.outerZ)) / 2,
				halfX: (outer - inner) / 2,
				halfZ: (s.hedge.outerZ - s.hedge.innerZ) / 2,
			})),
		),
	])
	const pillars = [-1, 1].flatMap((side) =>
		[-1, 1].flatMap((flank) => [
			{ x: side * s.yardPillars.x, z: flank * s.yardPillars.z, r: s.pillarRadius },
			{ x: side * s.towerPillars.x, z: flank * s.towerPillars.z, r: s.pillarRadius },
		]),
	)
	const structures = [-1, 1].flatMap((side) => [
		...['tower', 'fort'].flatMap((kind) =>
			[-1, 1].map((flank) => ({
				id: `${kind}-${side === -1 ? 'A' : 'B'}-${flank === -1 ? 'south' : 'north'}`,
				team: side === -1 ? 'A' : 'B',
				lane: flank === -1 ? 'south' : 'north',
				kind,
				x: side * s.structures[`${kind}X`],
				z: flank * s.lane.centreZ,
			})),
		),
		{
			id: `core-${side === -1 ? 'A' : 'B'}`,
			team: side === -1 ? 'A' : 'B',
			kind: 'core',
			x: side * s.structures.coreX,
			z: 0,
		},
	])
	return {
		name: s.name,
		preview: `<rect x="${-s.yard.halfX}" y="${-s.yard.halfZ}" width="${s.yard.halfX * 2}" height="${s.yard.halfZ * 2}"/>${[-1, 1].map((side) => `<path d="M${-bounds.halfX},${side * s.lane.innerZ} H${bounds.halfX}"/>`).join('')}`,
		settings: s,
		bounds,
		walkingBounds: bounds,
		boxes,
		pillars,
		obstacles: [...pillars, ...boxes],
		spawns: s.spawns,
		spawnSpacing: tune.map.spawnSpacing,
		lanes: [-1, 1].map((flank) => ({
			id: flank === -1 ? 'south' : 'north',
			path: [
				{ x: s.spawns.A.x, z: flank * s.lane.centreZ },
				{ x: s.spawns.B.x, z: flank * s.lane.centreZ },
			],
		})),
		structures,
		posts: s.posts,
		dummyPosts: s.dummyPosts,
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
			'yard',
			'baseBlock',
			'baseX',
			'hedge',
			'pillarRadius',
			'yardPillars',
			'towerPillars',
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
