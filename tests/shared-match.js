import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { buildCourt } from '../src/plugins/dodgeball/court.js'
import { createMatchFlow } from '../src/plugins/dodgeball/matchflow.js'
import { createActions } from '../src/plugins/dodgeball/actions.js'
import { validFact } from '../src/plugins/dodgeball/replica.js'
import { createLink } from '../src/plugins/online/link.js'
import { createIntents } from '../src/core/intents.js'
import { tune } from '../src/core/tune.js'

// A host and a guest wired as the browser wires them, minus the DOM and the clock: dodgeball's flow under a shared session,
// online's link, and a wire the test delivers by hand. `tick()` is one 60 Hz frame on both machines.
export const DT = 1 / 60
export const ROSTER = [
	{ id: 'host', team: 'A', controller: 'human' },
	{ id: 'guest', team: 'B', controller: 'human' },
]

export function createSharedMatch({
	roster = ROSTER,
	matchId = 'match-1',
	present = (_, e) => e,
} = {}) {
	let time = 0
	const now = () => time
	const wire = []
	const sound = tune.output.sound
	tune.output.sound = false // no AudioContext here
	const disposers = [() => (tune.output.sound = sound)]

	function peer(id, host) {
		const scene = new THREE.Scene()
		const world = new RAPIER.World({ x: 0, y: tune.physics.gravity, z: 0 })
		world.timestep = DT
		buildCourt(scene, world, RAPIER)
		const eventQueue = new RAPIER.EventQueue(true)
		const intents = createIntents()
		const actions = createActions()
		const facts = []
		const cards = []
		const overlay = {
			card: null,
			show(card) {
				this.card = card
				cards.push(card.title)
			},
			hide() {
				this.card = null
			},
		}
		const net = {
			id,
			isHost: host,
			hostId: 'host',
			send(type, data) {
				const to = host
					? roster.filter((p) => p.controller === 'human' && p.id !== id)
					: [{ id: 'host' }]
				for (const { id: peerId } of to) wire.push([peerId, type, structuredClone(data), id])
				return to.length
			},
		}
		let link = null
		const record = (fact) => {
			facts.push(present(id, fact))
			link?.record(fact)
		}
		const flow = createMatchFlow({
			ctx: { scene, world, RAPIER, eventQueue, combat: { push() {} }, present: record },
			overlay,
			fadeEl: { classList: { add() {}, remove() {} } },
			splashEl: { hidden: false },
			session: { local: [id], authoritative: host, shared: true, actions: [] },
			actions,
			clearActions() {
				intents.cancel()
				actions.cancel()
			},
			resetPresentation() {},
			onChange() {},
			onTheme() {},
		})
		flow.startRoster(roster)
		link = createLink({
			net,
			matchId,
			roster,
			contract: { epoch: 1, snapshot: flow.snapshot, apply: flow.apply, validFact },
			intents,
			present: record,
			now,
		})
		disposers.push(() => {
			link.dispose()
			flow.dispose()
			eventQueue.free()
			world.free()
		})
		return { id, flow, link, intents, actions, facts, cards, overlay, net, world }
	}

	const host = peer('host', true)
	const guest = peer('guest', false)
	const peers = { host, guest }

	function deliver() {
		for (const [to, type, data, from] of wire.splice(0)) peers[to]?.link.receive(type, data, from)
	}

	return {
		host,
		guest,
		wire,
		deliver,
		now,
		advance(seconds) {
			time += seconds
		},
		// One frame: devices feed each side's local frame, the guest sends, the host steps while the round is in play and broadcasts.
		tick(frames = {}) {
			time += DT
			for (const p of [host, guest]) if (frames[p.id]) p.intents.feed(p.id, frames[p.id])
			guest.link.update(DT)
			deliver()
			if (host.flow.phase === 'playing') {
				host.flow.step(DT, host.intents)
				host.intents.age(DT)
			}
			host.link.update(DT)
			deliver()
			host.flow.round.lateUpdate(time)
			guest.flow.round.lateUpdate(time)
		},
		dispose() {
			for (const fn of disposers.splice(0)) fn()
		},
	}
}

// An intent frame from the old wire's fields, for scripts.
export function frame({
	move = { x: 0, z: 0 },
	aim = null,
	held = false,
	pressed = [],
	released = false,
} = {}) {
	return {
		move,
		order: null,
		aim,
		held: held ? { primary: true } : {},
		pressed: pressed.map((action) => ({ action, at: aim })),
		released: released ? ['primary'] : [],
	}
}
