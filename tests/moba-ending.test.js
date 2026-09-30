import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { createLaneView } from '../src/plugins/moba/lane-view.js'
import { tune } from '../src/plugins/moba/tune.js'

test('a fallen core shatters on presentation time while the lane clock remains frozen', () => {
	const view = createLaneView(new THREE.Scene())
	const body = view.makeBody(40, 0, 'B', 'core')
	const unit = {
		id: 'core-B',
		kind: 'core',
		team: 'B',
		structure: true,
		dead: true,
		hp: 0,
		maxHp: 6000,
		body,
	}
	const lane = { time: 900, structures: [unit], minions: [], globes: [], vulnerable: () => true }
	try {
		body.retire()
		const shards = body.mesh.children.filter((child) => child.name === 'core-shard')
		expect(shards).toHaveLength(tune.laneView.shatterPieces)
		expect(body.crystal.visible).toBe(false)
		view.update(lane, [], 0, () => null, tune.laneView.shatterLife / 2)
		const flight = shards[0].position.clone()
		view.update(lane, [], 0, () => null, 0)
		expect(shards[0].position.toArray()).toEqual(flight.toArray())
		view.update(lane, [], 0, () => null, tune.laneView.shatterLife / 2)
		expect(shards[0].position.x).toBeCloseTo(tune.laneView.shatterSpread)
		expect(shards[0].position.y).toBeCloseTo(-body.halfHeight + tune.laneView.shatterSize)
		expect(lane.time).toBe(900)
	} finally {
		view.dispose()
	}
})
