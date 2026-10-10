import { tune } from '../tune.js'

export function overthrowLayout() {
	const m = tune.map
	const pillars = [-1, 1].flatMap((side) => [
		...[-1, 1].map((flank) => ({ x: side * m.pillarX, z: flank * m.pillarZ, r: m.pillarRadius })),
		{ x: side * m.guardX, z: side * m.guardZ, r: m.pillarRadius },
	])
	const boxes = [-1, 1].flatMap((side) =>
		[-1, 1].flatMap((flank) => [
			{
				kind: 'hedge',
				x: (side * (m.hedgeInnerX + m.hedgeOuterX)) / 2,
				z: (flank * (m.hedgeInnerZ + m.hedgeOuterZ)) / 2,
				halfX: (m.hedgeOuterX - m.hedgeInnerX) / 2,
				halfZ: (m.hedgeOuterZ - m.hedgeInnerZ) / 2,
			},
			{
				kind: 'wall',
				x: (side * (m.baseWallX + m.halfX)) / 2,
				z: (flank * (m.throat + m.halfZ)) / 2,
				halfX: (m.halfX - m.baseWallX) / 2,
				halfZ: (m.halfZ - m.throat) / 2,
			},
		]),
	)
	const obstacles = [...pillars, ...boxes]

	return {
		name: m.name,
		preview: `<path d="M${-m.halfX},0 H${m.halfX}"/>${[-1, 1].map((side) => `<path d="M${side * m.baseWallX},${-m.halfZ} V${-m.throat / 2} M${side * m.baseWallX},${m.throat / 2} V${m.halfZ}"/>`).join('')}`,
		bounds: { id: 'overthrow', halfX: m.halfX, halfZ: m.halfZ, thickness: m.thickness },
		structureStyle: 'stone',
		obstacles,
		boxes,
		pillars,
		spawns: { A: { x: -m.spawnX, z: 0 }, B: { x: m.spawnX, z: 0 } },
		spawnSpacing: m.spawnSpacing,
		bases: { A: { x: -tune.base.x }, B: { x: tune.base.x } },
		lanes: [
			{
				id: 'mid',
				halfWidth: tune.waves.laneZ,
				path: [
					{ x: -tune.waves.spawnX, z: 0 },
					{ x: tune.waves.spawnX, z: 0 },
				],
			},
		],
		structures: ['tower', 'core'].flatMap((kind) =>
			['A', 'B'].map((team) => ({
				id: `${kind}-${team}`,
				team,
				kind,
				after: kind === 'core' ? [`tower-${team}`] : [],
				x: (team === 'A' ? -1 : 1) * tune[kind].x,
				z: 0,
			})),
		),
		dummyPosts: m.dummyPosts,
	}
}
