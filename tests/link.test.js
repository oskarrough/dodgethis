import { afterEach, expect, test } from 'bun:test'
import RAPIER from '@dimforge/rapier3d-compat'
import { createSharedMatch, frame } from './shared-match.js'
import { HOST_TIMEOUT, INPUT_TIMEOUT, createLink } from '../src/plugins/online/link.js'

await RAPIER.init({})
let match
afterEach(() => match?.dispose())

// A guest intent message as the wire carries it.
let seq = 0
const intent = (f = frame(), overrides = {}) => ({
	matchId: 'match-1',
	seq: ++seq,
	frame: f,
	...overrides,
})
const ticks = (n, frames) => {
	for (let i = 0; i < n; i++) match.tick(frames)
}

test('the host seats intents only from their sender, in order, and a silent seat stands still', () => {
	match = createSharedMatch()
	const { host } = match
	const [local, remote] = host.flow.round.units
	const localX = local.position.x
	const remoteX = remote.position.x
	const moving = intent(frame({ move: { x: 1, z: 0 } }))
	expect(host.link.receive('intent', moving, 'guest')).toBe(true)
	expect(host.link.receive('intent', moving, 'guest')).toBe(false) // same seq
	expect(host.link.receive('intent', intent(), 'stranger')).toBe(false)
	expect(host.link.receive('intent', intent(frame(), { matchId: 'old' }), 'guest')).toBe(false)
	expect(host.link.receive('intent', intent({ ...frame(), move: { x: 9, z: 0 } }), 'guest')).toBe(
		false,
	)
	expect(host.link.receive('state', { wins: { B: 2 } }, 'guest')).toBe(false)
	ticks(12)
	expect(remote.position.x).toBeGreaterThan(remoteX + 0.1)
	expect(local.position.x).toBeCloseTo(localX, 3)
	match.advance(INPUT_TIMEOUT + 0.1)
	ticks(90)
	expect(Math.abs(remote.velocity.x)).toBeLessThan(0.01)
	expect(host.flow.match.wins).toEqual({ A: 0, B: 0 })
})

test('the host charges the bow and owns the shot; a frame cannot name its speed', () => {
	match = createSharedMatch()
	const { host } = match
	const remote = host.flow.round.units[1]
	const aim = { x: 0, z: 8 }
	host.link.receive(
		'intent',
		intent({ ...frame({ aim, held: true, pressed: ['primary'] }), speed: 9999 }),
		'guest',
	)
	for (let i = 0; i < 10; i++) {
		match.tick()
		host.link.receive('intent', intent(frame({ aim, held: true })), 'guest')
	}
	host.link.receive('intent', intent(frame({ aim, released: true })), 'guest')
	match.tick()
	const shot = host.facts.find((e) => e.type === 'shot')
	expect(shot.source.id).toBe(remote.id)
	expect(shot.source.team).toBe('B')
	expect(shot.perfect).toBe(false)
	const arrow = host.flow.round.arrows.find((a) => a.id === shot.arrowId)
	expect(arrow.ownerTeam).toBe('B')
	expect(arrow.velocity.length()).toBeLessThan(100)
	expect(remote.heldArrow?.id).not.toBe(shot.arrowId)
})

test('silence drops a held charge without firing, and a flood is rate limited', () => {
	match = createSharedMatch()
	const { host } = match
	host.link.receive('intent', intent(frame({ held: true, pressed: ['primary'] })), 'guest')
	ticks(5)
	match.advance(INPUT_TIMEOUT + 0.1)
	ticks(2) // the timeout lands after one step, the cancel on the next
	expect(host.actions.seat('guest').meter.charging).toBe(false)
	host.link.receive('intent', intent(frame({ released: true })), 'guest')
	match.tick()
	expect(host.facts.filter((e) => e.type === 'shot')).toHaveLength(0)
	let accepted = 0
	for (let i = 0; i < 200; i++)
		accepted += Number(host.link.receive('intent', intent(frame({ pressed: ['dash'] })), 'guest'))
	expect(accepted).toBeLessThanOrEqual(120)
})

test('host outcomes replicate exactly; stale envelopes are ignored and the next round has fresh ids', () => {
	match = createSharedMatch()
	const { host, guest } = match
	host.link.broadcast()
	const first = match.wire.at(-1)
	match.wire.length = 0
	expect(guest.link.receive('state', first[2], 'stranger')).toBe(false)
	expect(guest.link.receive('state', first[2], 'host')).toBe(true)
	expect(guest.flow.round.brains).toHaveLength(0)
	expect(guest.flow.round.localPlayer.participantId).toBe('guest')
	host.flow.round.units[1].place(0, -20, -8)
	ticks(100)
	expect(guest.flow.match.wins).toEqual({ A: 1, B: 0 })
	expect(guest.flow.phase).toBe('roundOver')
	expect(guest.overlay.card.title).toBe('ROUND LOST')
	expect(guest.overlay.card.actions.map((a) => a.label)).toEqual(['Menu'])
	expect(host.overlay.card.actions.map((a) => a.label)).toEqual(['Next round', 'Menu'])
	host.link.broadcast()
	const ended = match.wire.at(-1)[2]
	match.deliver()
	const facts = guest.facts.length
	expect(guest.link.receive('state', ended, 'host')).toBe(false)
	expect(guest.facts).toHaveLength(facts)
	const firstIds = guest.flow.round.units.map((u) => u.id)
	host.overlay.card.actions.find((a) => a.label === 'Next round').onSelect()
	ticks(4) // the next envelope
	expect(guest.flow.round.units.map((u) => u.id)).not.toEqual(firstIds)
	expect(guest.flow.round.units.map((u) => u.id)).toEqual(host.flow.round.units.map((u) => u.id))
	expect(guest.flow.phase).toBe('playing')
	expect(guest.overlay.card).toBeNull()
	host.flow.round.units[1].place(0, -20, -8)
	ticks(100)
	expect(guest.flow.phase).toBe('matchOver')
	expect(guest.flow.match.wins).toEqual(host.flow.match.wins)
	expect(guest.overlay.card.title).toBe('YOU LOSE')
	host.link.broadcast()
	const last = match.wire.at(-1)[2]
	match.wire.length = 0
	expect(
		guest.link.receive('state', { ...last, seq: 99999, facts: [{ id: 1e6, fact: null }] }, 'host'),
	).toBe(false)
	expect(
		guest.link.receive(
			'state',
			{ ...last, seq: 99999, state: { ...last.state, roundId: 1 } },
			'host',
		),
	).toBe(false)
})

test('fact ids deduplicate even when repeated in a newer envelope', () => {
	match = createSharedMatch()
	const { host, guest } = match
	host.link.receive('intent', intent(frame({ aim: { x: 0, z: 8 }, pressed: ['slot2'] })), 'guest')
	match.tick()
	host.link.receive('intent', intent(frame({ aim: { x: 0, z: 8 }, pressed: ['primary'] })), 'guest')
	host.flow.step(1 / 60, host.intents)
	host.link.broadcast()
	const envelope = match.wire.at(-1)[2]
	match.wire.length = 0
	expect(envelope.facts.some((x) => x.fact.type === 'shot' && x.fact.kind === 'bowl')).toBe(true)
	expect(guest.link.receive('state', envelope, 'host')).toBe(true)
	const count = guest.facts.length
	expect(count).toBeGreaterThan(0)
	expect(guest.link.receive('state', { ...envelope, seq: envelope.seq + 1 }, 'host')).toBe(true)
	expect(guest.facts).toHaveLength(count)
	expect(
		guest.link.receive('state', { ...envelope, seq: envelope.seq + 2, matchId: 'old' }, 'host'),
	).toBe(false)
})

test('a remote jump runs on the host and its landing reaches the guest', () => {
	match = createSharedMatch()
	const { host, guest } = match
	ticks(30)
	const remote = host.flow.round.units[1]
	const before = remote.position.y
	expect(host.link.receive('intent', intent(frame({ pressed: ['jump'] })), 'guest')).toBe(true)
	ticks(5)
	expect(remote.position.y).toBeGreaterThan(before)
	ticks(90)
	expect(guest.facts.some((e) => e.type === 'land' && e.source.id === remote.id)).toBe(true)
})

test('the guest sends its own frames, edges at once, and gives up on a silent host', () => {
	match = createSharedMatch()
	const { guest } = match
	const lost = []
	const sent = []
	const send = guest.net.send
	guest.net.send = (type, data) => (type === 'intent' && sent.push(data.frame), send(type, data))
	match.tick({ guest: frame({ move: { x: 1, z: 0 } }) })
	match.tick({ guest: frame({ move: { x: 1, z: 0 } }) }) // unchanged: waits
	match.tick({ guest: frame({ move: { x: 1, z: 0 }, pressed: ['dash'] }) })
	expect(sent).toHaveLength(2)
	expect(sent[1].pressed.map((e) => e.action)).toContain('dash')
	guest.link.dispose()
	const silent = createLink({
		net: guest.net,
		matchId: 'match-1',
		roster: [],
		contract: {},
		intents: guest.intents,
		present() {},
		onLost: (m) => lost.push(m),
		now: match.now,
	})
	match.advance(HOST_TIMEOUT + 1)
	silent.update(1 / 60)
	silent.update(1 / 60)
	expect(lost).toEqual(['The host stopped responding. Session ended.'])
})
