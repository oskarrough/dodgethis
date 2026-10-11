import { createLaneView } from './lane-view.js'
import pieceViews from './pieces/all-piece-views.js'
import { tune } from './tune.js'

// Where map pieces plug into the sim, in two passes. The ground comes before any body: the lane's
// view, tower obstacles and their colliders, and the cover abilities place.
export function layPieceGround({
	pieces,
	scene,
	smooth,
	layout,
	mapObstacles,
	world,
	RAPIER,
	replan,
}) {
	const lanePiece = pieces.find((piece) => piece.lane)?.lane
	const laneView = lanePiece ? createLaneView(scene, smooth, layout) : null
	const towerObstacles = pieces.flatMap((piece) => piece.obstacles?.(layout) ?? [])
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
	return { lanePiece, laneView, obstacles, addCover, removeCover, removeTower, dispose }
}

// Then, once heroes stand, the pieces that act: the lane, neutral camps, and each piece's population
// (Ball, dummies, flag). `systems()` reaches the sim's combat, wired after the pieces.
export function plugPieces({
	pieces,
	ground,
	layout,
	heroes,
	posts,
	training,
	present,
	bodyAt,
	systems,
}) {
	const { lanePiece, laneView, obstacles, removeTower } = ground
	const lane = laneView
		? lanePiece.create({
				layout,
				structures: pieces.some((piece) => piece.structures),
				heroes,
				wavesEnabled: () => pieces.some((piece) => piece.waves) && training.waves,
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
	const campsPiece = pieces.find((piece) => piece.camps)?.camps
	const camps =
		lane && campsPiece
			? campsPiece({ layout, lane, heroes, makeBody: laneView.makeBody, present, obstacles })
			: null
	const populations = { ball: null, dummies: [], flag: null }
	for (const piece of pieces) {
		if (!piece.create) continue
		populations[piece.population] = piece.create({
			heroes,
			posts,
			lane,
			layout,
			makeBody: bodyAt,
			targets: () => [...heroes, ...(lane?.structures ?? [])],
			vulnerable: (unit) => lane?.vulnerable(unit) ?? true,
			obstacles,
			present,
			view: pieceViews[piece.id] ?? {},
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
