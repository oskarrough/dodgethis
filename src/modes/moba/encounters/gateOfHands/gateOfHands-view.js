import * as THREE from 'three'
import { makeStyleMaterial } from '../../../../core/stylepass.js'
import { tune } from '../../tune.js'

// The hands as rings on the sand that fill grey while held and burn blue while lit, the door's
// posts until it opens, the Potsherds' pots, and each shard: a red ring where it will land and the
// shard itself on its arc. Plain shapes; the look is Oskar's to give.
export function view(scene) {
	const g = () => tune.encounters.gateOfHands
	const v = () => g().view
	const owned = []
	const root = new THREE.Group()
	scene.add(root)
	const material = (role) => {
		const m = makeStyleMaterial(role, { flat: true, side: THREE.DoubleSide })
		owned.push(m)
		return m
	}
	const ink = material('ink')
	const light = material('teamA')
	const clay = material('teamB')
	const stone = material('scenery')
	const mesh = (geometry, mat, parent = root) => {
		owned.push(geometry)
		const m = new THREE.Mesh(geometry, mat)
		parent.add(m)
		return m
	}
	const flat = (m, x, z) => {
		m.rotation.x = -Math.PI / 2
		m.position.set(x, tune.map.printLayers.seams + v().lift, z)
		return m
	}
	let built = null
	function build(fight, spot) {
		const r = g().radius
		const hands = fight.hands.map((hand) => {
			flat(mesh(new THREE.RingGeometry(r - v().rim, r, v().segments), ink), hand.x, hand.z)
			const fill = flat(
				mesh(new THREE.CircleGeometry(r - v().rim, v().segments), stone),
				hand.x,
				hand.z,
			)
			return { hand, fill }
		})
		const door = g().door.posts.map((z) => {
			const post = mesh(
				new THREE.CylinderGeometry(g().door.radius, g().door.radius, g().door.height, v().segments),
				stone,
			)
			post.position.set(spot.x + g().door.x, g().door.height / 2, spot.z + z)
			return post
		})
		for (const pot of fight.potsherds)
			mesh(
				new THREE.CylinderGeometry(v().potTop, v().pot, v().potHeight, v().segments),
				clay,
			).position.set(pot.x, v().potHeight / 2, pot.z)
		const shardGeometry = new THREE.SphereGeometry(v().shard, v().shardSegments, v().shardSegments)
		const warnGeometry = new THREE.RingGeometry(g().splash - v().rim, g().splash, v().segments)
		owned.push(shardGeometry, warnGeometry)
		return { hands, door, shards: new Map(), shardGeometry, warnGeometry }
	}
	return {
		get markerPosition() {
			return null
		},
		present() {},
		update(sim, blend) {
			const fight = sim.dungeon?.encounters?.find((e) => e.id === 'gateOfHands')
			if (!fight) return
			built ??= build(fight, fight.spot)
			const t = sim.tick + blend
			for (const { hand, fill } of built.hands) {
				const share = t < hand.litUntil ? 1 : hand.fill
				fill.scale.setScalar(Math.max(0.001, share))
				fill.material = t < hand.litUntil ? light : stone
			}
			for (const post of built.door) post.visible = !fight.state.open
			const live = new Set()
			for (const shard of fight.state.shards) {
				live.add(shard.id)
				let drawn = built.shards.get(shard.id)
				if (!drawn) {
					const from = fight.potsherds.find((p) => p.id === shard.from)
					drawn = {
						from,
						warn: flat(new THREE.Mesh(built.warnGeometry, clay), shard.x, shard.z),
						shard: new THREE.Mesh(built.shardGeometry, clay),
					}
					root.add(drawn.warn, drawn.shard)
					built.shards.set(shard.id, drawn)
				}
				const k = Math.min(1, (t - shard.thrown) / (shard.lands - shard.thrown))
				drawn.shard.position.set(
					drawn.from.x + (shard.x - drawn.from.x) * k,
					v().potHeight + Math.sin(k * Math.PI) * v().arc,
					drawn.from.z + (shard.z - drawn.from.z) * k,
				)
			}
			for (const [id, drawn] of built.shards)
				if (!live.has(id)) {
					root.remove(drawn.warn, drawn.shard)
					built.shards.delete(id)
				}
		},
		dispose() {
			scene.remove(root)
			for (const o of owned) o.dispose()
		},
	}
}
