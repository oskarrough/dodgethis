import { createLaneView } from './lane-view.js'
import mechanicViews from './mechanics/all-mechanic-views.js'
import { tune } from './tune.js'

// Where map mechanics plug into the sim, in two passes. The ground comes before any body: the lane's
// view, tower obstacles and their colliders, and the cover abilities place.
export function layMechanicGround({
	mechanics,
	scene,
	smooth,
	layout,
	mapObstacles,
	world,
	RAPIER,
	replan,
}) {
	const laneMechanic = mechanics.find((mechanic) => mechanic.lane)?.lane
	const laneView = laneMechanic ? createLaneView(scene, smooth, layout) : null
	const towerObstacles = mechanics.flatMap((mechanic) => mechanic.obstacles?.(layout) ?? [])
	const obstacles = [...mapObstacles, ...towerObstacles]
	const towerColliders = new Map(
		towerObstacles.map((o) => [
			o.id,
			world.createCollider(
				RAPIER.ColliderDesc.cylinder(tune[o.kind].height / 2, o.r).setTranslation(
					o.x,
					tune[o.kind].height / 2,
					o.z,
				),
			),
		]),
	)
	// Cover an ability places (Cushion): shots sweep it, bodies collide with it. Paths are not replanned.
	const coverColliders = new Map()
	function addCover(o) {
		obstacles.push(o)
		coverColliders.set(
			o,
			world.createCollider(RAPIER.ColliderDesc.cylinder(1, o.r).setTranslation(o.x, 1, o.z)),
		)
	}
	function removeCover(o) {
		const index = obstacles.indexOf(o)
		if (index >= 0) obstacles.splice(index, 1)
		const collider = coverColliders.get(o)
		if (collider) world.removeCollider(collider, true)
		coverColliders.delete(o)
	}
	function removeTower(unit) {
		const obstacle = towerObstacles.find((o) => o.id === unit.id)
		const index = obstacles.indexOf(obstacle)
		if (index >= 0) obstacles.splice(index, 1)
		const collider = towerColliders.get(unit.id)
		if (collider) world.removeCollider(collider, true)
		towerColliders.delete(unit.id)
		replan()
	}
	function dispose() {
		laneView?.dispose()
		for (const collider of towerColliders.values()) world.removeCollider(collider, true)
		for (const o of coverColliders.keys()) removeCover(o)
	}
	return { laneMechanic, laneView, obstacles, addCover, removeCover, removeTower, dispose }
}

// Then, once heroes stand, the mechanics that act: the lane, neutral camps, and each mechanic's population
// (Ball, dummies, flag). `systems()` reaches the sim's combat, wired after the mechanics.
export function plugMechanics({
	mechanics,
	ground,
	layout,
	heroes,
	posts,
	training,
	present,
	bodyAt,
	systems,
}) {
	const { laneMechanic, laneView, obstacles, removeTower } = ground
	const lane = laneView
		? laneMechanic.create({
				layout,
				structures: mechanics.some((mechanic) => mechanic.structures),
				heroes,
				wavesEnabled: () => mechanics.some((mechanic) => mechanic.waves) && training.waves,
				present,
				makeBody: laneView.makeBody,
				obstacles,
				removeTower,
				damage(source, target, damage) {
					systems().hit(
						{
							owner: source.id,
							team: source.team,
							slot: source.kind,
							damage,
							dx: 0,
							dz: 0,
							id: ++systems().shotIds,
						},
						{ id: target.id, unit: target, hero: !target.kind },
						target.body.position,
					)
				},
				projectile: (...args) => systems().towerShot(...args),
			})
		: null

	// Neutral camps ride the lane's minion list; the map's recipe switches them on.
	const campsMechanic = mechanics.find((mechanic) => mechanic.camps)?.camps
	const camps =
		lane && campsMechanic
			? campsMechanic({ layout, lane, heroes, makeBody: laneView.makeBody, present, obstacles })
			: null
	const populations = { ball: null, dummies: [], flag: null }
	for (const mechanic of mechanics) {
		if (!mechanic.create) continue
		populations[mechanic.population] = mechanic.create({
			heroes,
			posts,
			lane,
			layout,
			makeBody: bodyAt,
			targets: () => [...heroes, ...(lane?.structures ?? [])],
			vulnerable: (unit) => lane?.vulnerable(unit) ?? true,
			obstacles,
			present,
			view: mechanicViews[mechanic.id] ?? {},
			endCast: (...args) => systems().endCast(...args),
			damage(shot, unit, damage) {
				systems().hit(
					{ ...shot, id: -1, owner: shot.owner, slot: 'ball', damage },
					{ id: unit.id, unit, hero: !unit.kind },
					unit.body.position,
				)
			},
		})
	}
	return { lane, camps, ...populations }
}
