import { afterEach, beforeEach, expect, test } from 'bun:test'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { createRound } from '../src/round.js'
import { createReplicaRound, snapshotRound } from '../src/replica.js'
import { buildCourt } from '../src/court.js'
import { createFeedback } from '../src/feedback.js'
import { tune } from '../src/tune.js'
import { TRAIL } from '../src/weapons.js'

await RAPIER.init({})
const roster = [
	{ id: 'alice', team: 'A', controller: 'human', peerId: 'peer-a' },
	{ id: 'bob', team: 'B', controller: 'human', peerId: 'peer-b' },
	{ id: 'bot', team: 'B', controller: 'bot', peerId: null },
]
let host, replica, hostWorld, guestWorld, queue, scene, previous
beforeEach(() => {
	previous = {
		ai: tune.ai.enabled,
		trails: tune.fx.trails,
		infiniteAmmo: tune.cheats.infiniteAmmo,
		godmode: tune.cheats.godmode,
	}
	tune.ai.enabled = false
	tune.fx.trails = true
	tune.cheats.infiniteAmmo = false
	tune.cheats.godmode = false
	const hostScene = new THREE.Scene()
	hostWorld = new RAPIER.World({ x: 0, y: tune.physics.gravity, z: 0 })
	buildCourt(hostScene, hostWorld, RAPIER)
	queue = new RAPIER.EventQueue(true)
	host = createRound(
		{ scene: hostScene, world: hostWorld, RAPIER, eventQueue: queue, combat: { push() {} } },
		{ roster, localParticipantId: 'alice', seed: 42 },
	)
	host.lateUpdate()
	scene = new THREE.Scene()
	guestWorld = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
	for (const method of ['createRigidBody', 'createCollider', 'createCharacterController', 'step'])
		guestWorld[method] = () => {
			throw new Error(`Replica attempted physics: ${method}`)
		}
	replica = createReplicaRound(
		{ scene, world: guestWorld, RAPIER },
		{ roster, localParticipantId: 'bob' },
	)
})
afterEach(() => {
	replica.dispose()
	host.dispose()
	queue.free()
	hostWorld.free()
	expect(guestWorld.bodies.len()).toBe(0)
	expect(guestWorld.colliders.len()).toBe(0)
	guestWorld.free()
	expect(scene.children).toHaveLength(0)
	tune.ai.enabled = previous.ai
	tune.fx.trails = previous.trails
	tune.cheats.infiniteAmmo = previous.infiniteAmmo
	tune.cheats.godmode = previous.godmode
})
const copyPacket = () => structuredClone(snapshotRound(host))
function deliver(time = 0) {
	const snapshot = snapshotRound(host)
	expect(replica.push(snapshot, time)).toBe(true)
	replica.lateUpdate(time + 0.08)
	return snapshot
}
function expectVector(actual, expected) {
	for (const axis of ['x', 'y', 'z']) expect(actual[axis]).toBeCloseTo(expected[axis], 5)
}

test('replica exposes local roster/spawn visuals immediately without unit bodies, brains, or a simulation API', () => {
	expect(replica.human).toBe(replica.localPlayer)
	expect(replica.localPlayer.participantId).toBe('bob')
	expect(replica.localPlayer.team).toBe('B')
	expect(replica.brains).toHaveLength(0)
	expect(replica.step).toBeUndefined()
	expect(replica.looseHuman).toBeUndefined()
	for (let i = 0; i < roster.length; i++) {
		const unit = replica.units[i]
		expect(unit.body).toBeNull()
		expect(unit.characterController).toBeNull()
		expect(unit.colliderHandle).toBe(-1)
		expectVector(unit.position, host.units[i].position)
		unit.update({ x: 1, z: 1 }, 1)
		expect(unit.dash({ x: 1, z: 0 })).toBe(false)
	}
})

test('host snapshot synchronizes stable numeric ids, owned metadata, held references and poses', () => {
	host.units[0].place(1, 1, 4)
	host.units[0].aim.set(1, 0, 0)
	host.units[0].face(host.units[0].aim)
	host.units[1].weapon = 'bowl'
	host.units[2].windup = 0.5
	host.lateUpdate()
	const packet = deliver()
	expect(replica.units.map((u) => u.id)).toEqual(host.units.map((u) => u.id))
	expect(replica.arrows.map((a) => a.id)).toEqual(host.arrows.map((a) => a.id))
	for (let i = 0; i < roster.length; i++) {
		const unit = replica.units[i]
		expect(unit.participant).toEqual(packet.units[i].participant)
		expectVector(unit.position, packet.units[i].position)
		expectVector(unit.aim, packet.units[i].aim)
		expect(unit.heldArrow?.id ?? null).toBe(packet.units[i].heldArrow)
		unit.updateVisual(1 / 60, unit.windup)
	}
	expect(replica.localPlayer.weapon).toBe('bowl')
	expect(replica.units[2].windup).toBe(0.5)
	packet.units[0].position.x = 999
	packet.units[0].participant.team = 'B'
	replica.lateUpdate(1)
	expect(replica.units[0].position.x).toBe(1)
	expect(replica.units[0].participant.team).toBe('A')
})

test.each(['arrow', 'bowl'])(
	'replicated %s flight uses the existing projectile/trail visuals, then grounded pickup markers',
	(kind) => {
		const shot = host.localPlayer.heldArrow
		host.looseArrow(host.localPlayer, { x: 1, z: 0 }, 15, { kind, perfect: kind === 'arrow' })
		for (let i = 0; i < 3; i++) {
			host.step(1 / 60, { x: 0, z: 0 })
			host.lateUpdate()
		}
		const packet = deliver()
		const arrow = replica.arrows.find((a) => a.id === shot.id)
		const snapshot = packet.arrows.find((a) => a.id === shot.id)
		const received = arrow.snapshot()
		// Quaternion interpolation normalizes Rapier's float32 rotation slightly.
		for (const axis of ['x', 'y', 'z', 'w'])
			expect(received.quaternion[axis]).toBeCloseTo(snapshot.quaternion[axis], 6)
		expect({ ...received, quaternion: snapshot.quaternion }).toEqual(snapshot)
		expect(arrow.trail.visible).toBe(true)
		expect(arrow.trail.material.color.getHex()).toBe(
			new THREE.Color(kind === 'bowl' ? TRAIL.bowl : TRAIL.perfect).getHex(),
		)
		expect(arrow.ball.visible).toBe(kind === 'bowl')
		expect(arrow.mesh.visible).toBe(kind === 'arrow')
		expect(arrow.pickup.visible).toBe(false)
		expectVector(arrow.position, shot.position)
		shot.ground()
		deliver(0.1)
		expect(arrow.state).toBe('grounded')
		expect(arrow.kind).toBe('arrow')
		expect(arrow.mesh.visible).toBe(true)
		expect(arrow.ball.visible).toBe(false)
		expect(arrow.trail.visible).toBe(false)
		expect(arrow.pickup.visible).toBe(true)
		expect(arrow.pickup.position.x).toBeCloseTo(shot.position.x, 5)
		expect(arrow.pickup.position.z).toBeCloseTo(shot.position.z, 5)
		expect(arrow.snapshot().source).toEqual({ id: host.localPlayer.id, team: 'A', isHuman: true })
		// Receiving held ownership does not independently pick up or simulate an arrow.
		shot.hold()
		host.localPlayer.heldArrow = shot
		host.lateUpdate()
		deliver(0.2)
		expect(replica.units[0].heldArrow).toBe(arrow)
		expect(arrow.pickup.visible).toBe(false)
		expectVector(arrow.position, replica.units[0].handPosition())
	},
)

test('dash timers, flags and animation inputs are authoritative; guest time does not advance them', () => {
	host.dashUnit(host.units[0], { x: 1, z: 0 })
	const packet = deliver()
	const unit = replica.units[0]
	expect(unit.dashing).toBe(true)
	expect(unit.dashReady).toBe(false)
	expect(unit.dashTime).toBe(packet.units[0].dashTime)
	unit.react({ type: 'dash', direction: { x: 1, z: 0 } })
	unit.updateVisual(0.05)
	expect(Math.abs(unit.visual.rotation.z)).toBeGreaterThan(0)
	replica.lateUpdate(1)
	expect(unit.dashTime).toBe(packet.units[0].dashTime)
	for (let i = 0; i < 30; i++) {
		host.step(1 / 60, { x: 0, z: 0 })
		host.lateUpdate()
	}
	deliver(1.1)
	expect(unit.dashing).toBe(false)
})

test('dead host snapshots never access removed bodies and replica corpses stay owned by death feedback', () => {
	deliver()
	const target = host.units[0]
	target.eliminate()
	target.body.translation = () => {
		throw new Error('Removed Rapier body accessed')
	}
	const packet = deliver(0.1)
	const unit = replica.units[0]
	expect(unit.alive).toBe(false)
	expect(unit.visual.visible).toBe(false)
	expect(unit.visual.position.toArray()).toEqual([0, 0, 0])
	expect(unit.visual.scale.toArray()).toEqual([1, 1, 1])
	expect(unit.heldArrow).toBeNull()
	const feedback = createFeedback(scene, { sfx: { fall() {} }, confirm() {} })
	try {
		feedback.present(
			{
				type: 'fall',
				outcome: 'eliminated',
				target: { id: unit.id, isHuman: true, isLocal: false },
				point: packet.units[0].position,
				direction: { x: 0, y: -1, z: 0 },
			},
			unit.visual,
		)
		expect(unit.visual.parent).toBe(scene)
		feedback.update(0.1)
		const pose = unit.visual.position.clone()
		expect(replica.push(packet, 0.2)).toBe(true)
		replica.lateUpdate(0.3)
		expect(unit.visual.position.equals(pose)).toBe(true)
		replica.dispose()
		expect(unit.visual.parent).toBeNull()
	} finally {
		feedback.dispose()
	}
})

test('arrival-time interpolation blends position/aim/yaw, clamps to newest and preserves local aim', () => {
	const first = copyPacket()
	first.units[0].position = { x: 0, y: 1, z: 0 }
	first.units[0].aim = { x: 1, y: 0, z: 0 }
	first.units[0].yaw = Math.PI - 0.2
	expect(replica.push(first, 1)).toBe(true)
	const second = structuredClone(first)
	second.units[0].position.x = 2
	second.units[0].aim = { x: 0, y: 0, z: 1 }
	second.units[0].yaw = -Math.PI + 0.2
	expect(replica.push(second, 1.1)).toBe(true)
	replica.localPlayer.aim.set(-1, 0, 0)
	replica.lateUpdate(1.13) // renders 1.05, halfway between the two arrivals
	expect(replica.units[0].position.x).toBeCloseTo(1, 5)
	expect(replica.units[0].aim.x).toBeCloseTo(Math.SQRT1_2, 5)
	expect(replica.units[0].aim.z).toBeCloseTo(Math.SQRT1_2, 5)
	expect(replica.units[0].mesh.rotation.y).toBeCloseTo(Math.PI, 5)
	expect(replica.localPlayer.aim.toArray()).toEqual([-1, 0, 0])
	replica.lateUpdate(99)
	expect(replica.units[0].position.x).toBe(2)
	expect(replica.localPlayer.aim.toArray()).toEqual([-1, 0, 0])
})

test('projectile interpolation blends quaternions/trails but new state applies immediately', () => {
	host.looseHuman({ x: 1, z: 0 }, 15, { kind: 'bowl' })
	const first = copyPacket()
	const shot = first.arrows.find((a) => a.state === 'flying')
	shot.position = { x: 0, y: 0.5, z: 0 }
	shot.quaternion = { x: 0, y: 0, z: 0, w: 1 }
	expect(replica.push(first, 1)).toBe(true)
	const second = structuredClone(first)
	const moved = second.arrows.find((a) => a.id === shot.id)
	moved.position.x = 2
	moved.quaternion = { x: 0, y: 1, z: 0, w: 0 }
	expect(replica.push(second, 1.1)).toBe(true)
	replica.lateUpdate(1.13)
	const arrow = replica.arrows.find((a) => a.id === shot.id)
	expect(arrow.ball.position.x).toBeCloseTo(1, 5)
	expect(arrow.ball.quaternion.y).toBeCloseTo(Math.SQRT1_2, 5)
	expect(arrow.trail.geometry.attributes.position.array[0]).toBeCloseTo(1, 5)
	const grounded = structuredClone(second)
	const rest = grounded.arrows.find((a) => a.id === shot.id)
	rest.state = 'grounded'
	rest.kind = 'arrow'
	rest.position.y = 0.045
	expect(replica.push(grounded, 1.15)).toBe(true)
	expect(arrow.ball.visible).toBe(false)
	expect(arrow.pickup.visible).toBe(true)
	replica.lateUpdate(1.16)
	expect(arrow.position.x).toBe(2)
	expect(arrow.position.y).toBe(0.045)
})

test.each([
	[
		'duplicate unit id',
		(p) => {
			p.units[1].id = p.units[0].id
		},
	],
	[
		'duplicate participant',
		(p) => {
			p.units[1].participant = p.units[0].participant
		},
	],
	[
		'missing participant',
		(p) => {
			p.units.pop()
		},
	],
	[
		'owner changed',
		(p) => {
			p.units[0].participant.peerId = 'intruder'
		},
	],
	[
		'team changed',
		(p) => {
			p.units[0].participant.team = 'B'
		},
	],
	[
		'controller changed',
		(p) => {
			p.units[0].participant.controller = 'bot'
		},
	],
	[
		'unit id changed',
		(p) => {
			p.units[0].id += 9999
		},
	],
	[
		'NaN position',
		(p) => {
			p.units[0].position.x = NaN
		},
	],
	[
		'infinite velocity',
		(p) => {
			p.units[0].velocity.z = Infinity
		},
	],
	[
		'bad weapon',
		(p) => {
			p.units[0].weapon = 'laser'
		},
	],
	[
		'invalid dash flag',
		(p) => {
			p.units[0].dashing = true
		},
	],
	[
		'negative dash timer',
		(p) => {
			p.units[0].dashTime = -1
		},
	],
	[
		'duplicate arrow id',
		(p) => {
			p.arrows[1].id = p.arrows[0].id
		},
	],
	[
		'missing arrow',
		(p) => {
			p.arrows.pop()
		},
	],
	[
		'invalid quaternion',
		(p) => {
			p.arrows[0].quaternion.w = 10
		},
	],
	[
		'invalid arrow state',
		(p) => {
			p.arrows[0].state = 'lost'
		},
	],
	[
		'missing held reference',
		(p) => {
			p.units[0].heldArrow = 9999
		},
	],
	[
		'two holders',
		(p) => {
			p.units[1].heldArrow = p.units[0].heldArrow
		},
	],
	[
		'unheld held arrow',
		(p) => {
			p.units[0].heldArrow = null
		},
	],
	[
		'holding grounded ammo',
		(p) => {
			p.arrows[0].state = 'grounded'
		},
	],
	[
		'dead holder',
		(p) => {
			p.units[0].alive = false
		},
	],
	[
		'invalid projectile source',
		(p) => {
			p.arrows[2].source = { id: 9999, team: 'A', isHuman: true }
			p.arrows[2].ownerTeam = 'A'
		},
	],
	[
		'source owner mismatch',
		(p) => {
			p.arrows[2].source = { id: p.units[0].id, team: 'A', isHuman: true }
			p.arrows[2].ownerTeam = 'B'
		},
	],
	[
		'fake human source',
		(p) => {
			p.arrows[2].source = { id: p.units[2].id, team: 'B', isHuman: true }
			p.arrows[2].ownerTeam = 'B'
		},
	],
])('rejects %s without partial state/scene mutation', (_name, mutate) => {
	deliver()
	const before = snapshotRound(replica)
	const children = [...scene.children]
	const invalid = copyPacket()
	invalid.units[0].position.z = 99 // an earlier valid field must not partially apply
	mutate(invalid)
	expect(replica.push(invalid, 1)).toBe(false)
	expect(snapshotRound(replica)).toEqual(before)
	expect(scene.children).toEqual(children)
})

test('invalid first packet allocates no arrows or host ids; stale arrivals and resurrection are rejected', () => {
	const invalid = copyPacket()
	invalid.arrows.at(-1).velocity.x = NaN
	const children = scene.children.length
	expect(replica.push(invalid, 0)).toBe(false)
	expect(replica.arrows).toHaveLength(0)
	expect(replica.localPlayer.id).toBeNull()
	expect(scene.children).toHaveLength(children)
	const alive = deliver(1)
	expect(replica.push(alive, 0.5)).toBe(false)
	expect(replica.push(alive, NaN)).toBe(false)
	host.units[2].eliminate()
	deliver(2)
	expect(replica.push(alive, 3)).toBe(false)
})

test('pool additions reuse shared geometry builders and disposal releases every owned resource once', () => {
	deliver()
	tune.cheats.infiniteAmmo = true
	host.looseHuman({ x: 1, z: 0 }, 15)
	host.step(1 / 60, { x: 0, z: 0 })
	host.lateUpdate()
	deliver(1)
	expect(replica.arrows).toHaveLength(8)
	const resources = new Set()
	for (const unit of replica.units)
		unit.visual.traverse((o) => {
			if (o.geometry) resources.add(o.geometry)
			if (o.material) resources.add(o.material)
		})
	for (const arrow of replica.arrows) {
		for (const root of [arrow.mesh, arrow.ball, arrow.pickup, arrow.trail])
			root.traverse((o) => {
				if (o.geometry) resources.add(o.geometry)
			})
		resources.add(arrow.trail.material)
	}
	const disposed = new Map()
	for (const resource of resources)
		resource.addEventListener('dispose', () =>
			disposed.set(resource, (disposed.get(resource) ?? 0) + 1),
		)
	replica.dispose()
	replica.dispose()
	expect(disposed.size).toBe(resources.size)
	expect([...disposed.values()].every((count) => count === 1)).toBe(true)
	expect(replica.push(snapshotRound(host), 2)).toBe(false)
})
