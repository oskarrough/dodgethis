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

// Hand-imported by maps/index.js until Overthrow gets its folder (docs/mods.md, step 7).
export const overthrow = {
	kind: 'lane',
	order: 1,
	late: 180, // late game (tune.match.late) from 3:00 on this map (Oskar, 2026-10-11)
	layout: overthrowLayout,
	pieces: ['structures', 'minions', 'ball', 'bots'],
	palette: () => ({ ...tune.overthrowTerrain.palette, light: tune.overthrowTerrain.light }),
	debugTune: {
		name: 'overthrow terrain (applies on restart)',
		values: tune.overthrowTerrain,
		add(f, s) {
			for (const [key, min, max, step] of [
				['margin', 0.5, 3, 0.1],
				['jag', 0, 1.5, 0.1],
				['step', 1, 6, 0.5],
				['chalkWidth', 0.04, 0.2, 0.01],
				['courtInset', 0.5, 3, 0.1],
			])
				f.add(s, key, min, max, step)
			for (const [key, min, max, step] of [
				['depth', 10, 80, 1],
				['flare', 0, 0.5, 0.01],
				['ledge', 0, 2, 0.05],
				['column', 0, 1.5, 0.05],
				['mossMax', 0.3, 3, 0.05],
			])
				f.add(s.cliff, key, min, max, step).name(`cliff ${key}`)
			for (const [key, min, max, step] of [
				['bottom', 5, 60, 1],
				['max', 0, 1, 0.01],
				['far', 30, 300, 5],
			])
				f.add(s.haze, key, min, max, step).name(`haze ${key}`)
			for (const key of Object.keys(s.colors)) f.addColor(s.colors, key)
			for (const key of Object.keys(s.palette)) f.addColor(s.palette, key)
		},
	},
	online: true,
}
