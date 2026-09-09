import { afterEach, beforeEach, expect, test } from 'bun:test'
import { DEFAULT_PEER_OPTIONS, MAX_PLAYERS, Net, PROTO } from '../src/net.js'

class Emitter {
	listeners = new Map()
	on(type, fn) {
		if (!this.listeners.has(type)) this.listeners.set(type, [])
		this.listeners.get(type).push(fn)
		return this
	}
	emit(type, ...args) {
		const listeners = [...(this.listeners.get(type) ?? [])]
		for (const fn of listeners) fn(...args)
	}
}
class Clock {
	now = 0
	nextId = 0
	tasks = new Map()
	setTimeout(fn, delay) {
		const id = ++this.nextId
		this.tasks.set(id, { at: this.now + delay, fn })
		return id
	}
	clearTimeout(id) {
		this.tasks.delete(id)
	}
	tick(dt) {
		const end = this.now + dt
		while (true) {
			const next = [...this.tasks]
				.filter(([, task]) => task.at <= end)
				.sort((a, b) => a[1].at - b[1].at)[0]
			if (!next) break
			const [id, task] = next
			this.now = task.at
			this.tasks.delete(id)
			task.fn()
		}
		this.now = end
	}
}
class Connection extends Emitter {
	constructor(peer, metadata = { v: PROTO }) {
		super()
		this.peer = peer
		this.metadata = metadata
		this.open = false
		this.closed = false
		this.sent = []
	}
	send(message) {
		if (!this.open || this.failSend) throw new Error('Data channel closed')
		this.sent.push(structuredClone(message))
		// Synchronous delivery intentionally stresses welcome/hello adoption order.
		this.other?.emit('data', structuredClone(message))
	}
	close() {
		if (this.closed) return
		this.closed = true
		this.open = false
		this.emit('close')
		this.other?.close()
	}
	start() {
		this.open = true
		this.emit('open')
	}
}
function network(clock) {
	const hub = { peers: new Map(), instances: [], autoOpen: true, autoConnect: true, sequence: 0 }
	hub.Peer = class extends Emitter {
		constructor(id, options) {
			super()
			this.id = id ?? `guest-${++hub.sequence}`
			this.options = options
			this.destroyed = false
			this.connections = []
			this.tasks = new Set()
			hub.instances.push(this)
			if (hub.autoOpen) this.schedule(() => this.start())
		}
		schedule(fn) {
			const id = clock.setTimeout(() => {
				this.tasks.delete(id)
				if (!this.destroyed) fn()
			}, 0)
			this.tasks.add(id)
		}
		start() {
			if (hub.peers.has(this.id)) {
				this.emit('error', { type: 'unavailable-id' })
				return
			}
			hub.peers.set(this.id, this)
			this.emit('open', this.id)
		}
		connect(id, options) {
			const outgoing = new Connection(id, options.metadata)
			outgoing.options = options
			this.connections.push(outgoing)
			if (hub.autoConnect)
				this.schedule(() => {
					const target = hub.peers.get(id)
					if (!target) {
						this.emit('error', { type: 'peer-unavailable' })
						return
					}
					const incoming = new Connection(this.id, options.metadata)
					target.connections.push(incoming)
					incoming.other = outgoing
					outgoing.other = incoming
					target.emit('connection', incoming)
					outgoing.open = true
					incoming.open = true
					outgoing.emit('open')
					incoming.emit('open')
				})
			return outgoing
		}
		destroy() {
			if (this.destroyed) return
			this.destroyed = true
			for (const task of this.tasks) clock.clearTimeout(task)
			this.tasks.clear()
			if (hub.peers.get(this.id) === this) hub.peers.delete(this.id)
			for (const conn of this.connections) conn.close()
			this.emit('close')
		}
	}
	return hub
}

let clock, hub, nets
beforeEach(() => {
	clock = new Clock()
	hub = network(clock)
	nets = []
})
afterEach(() => {
	for (const net of nets) net.leave()
	expect(clock.tasks.size).toBe(0)
})
function make(options = {}) {
	const net = new Net({
		Peer: hub.Peer,
		timers: clock,
		startupTimeout: 50,
		joinTimeout: 80,
		handshakeTimeout: 30,
		...options,
	})
	nets.push(net)
	return net
}
async function flush() {
	for (let i = 0; i < 8; i++) await Promise.resolve()
}
async function settle(promise) {
	for (let i = 0; i < 4; i++) {
		clock.tick(0)
		await flush()
	}
	return promise
}
async function host() {
	const net = make()
	await settle(net.host())
	return net
}
async function guest(server) {
	const net = make()
	await settle(net.join(server.code))
	return net
}
function incoming(server, id = 'manual-guest', metadata = { v: PROTO }) {
	const conn = new Connection(id, metadata)
	server.peer.emit('connection', conn)
	conn.start()
	return conn
}
const hello = (conn, v = PROTO) => conn.emit('data', { t: 'hello', d: { v } })

test('private host and guest exchange welcome/hello with protocol metadata and readable codes', async () => {
	const server = await host()
	expect(server.code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/)
	expect(server.id).toBe(`dodgethis-${server.code}`)
	expect(server.hostId).toBe(server.id)
	expect(server.isHost).toBe(true)
	expect(server.active).toBe(true)
	const client = make()
	expect(await settle(client.join(` ${server.code.toLowerCase()} `))).toBe(server.code)
	expect(client.active).toBe(true)
	expect(client.isHost).toBe(false)
	expect(client.hostId).toBe(server.id)
	expect(client.peerIds).toEqual([server.id])
	expect(server.peerIds).toEqual([client.id])
	const outgoing = client.conns.get(server.id)
	expect(outgoing.options).toEqual({
		reliable: true,
		serialization: 'json',
		metadata: { v: PROTO },
	})
	expect(outgoing.sent).toEqual([{ t: 'hello', d: { v: PROTO } }])
	expect(outgoing.other.sent[0]).toEqual({ t: 'welcome', d: { v: PROTO, hostId: server.id } })
})

test('roster broadcast inside onPeerJoin is received after guest adoption, before join resolves', async () => {
	const server = await host()
	const client = make()
	const seen = []
	let resolved = false
	client.on('lobby', (data, from) =>
		seen.push({ data, from, active: client.active, hostId: client.hostId, resolved }),
	)
	server.onPeerJoin = (id) => server.send('lobby', { humans: [server.id, id] })
	await settle(
		client.join(server.code).then(() => {
			resolved = true
		}),
	)
	expect(seen).toEqual([
		{
			data: { humans: [server.id, client.id] },
			from: server.id,
			hostId: server.id,
			active: true,
			resolved: false,
		},
	])
})

test('host broadcasts or targets established peers; guest sends only to host, never relays', async () => {
	const server = await host()
	const a = await guest(server)
	const b = await guest(server)
	const seen = { host: [], a: [], b: [] }
	server.on('input', (d, from) => seen.host.push([d, from]))
	a.on('input', (d, from) => seen.a.push([d, from]))
	b.on('input', (d, from) => seen.b.push([d, from]))
	expect(a.send('input', { from: b.id, x: 1 })).toBe(1)
	expect(seen.host).toEqual([[{ from: b.id, x: 1 }, a.id]])
	expect(seen.b).toHaveLength(0)
	expect(a.sendTo(b.id, 'input', 9)).toBe(false)
	expect(server.send('input', 2)).toBe(2)
	expect(server.sendTo(a.id, 'input', 3)).toBe(true)
	expect(seen.a).toEqual([
		[2, server.id],
		[3, server.id],
	])
	expect(seen.b).toEqual([[2, server.id]])
	expect(server.sendTo('missing', 'input', 4)).toBe(false)
	expect(a.send('welcome', {})).toBe(0)
})

test('unacknowledged or malformed messages never reach application handlers', async () => {
	const server = await host()
	const conn = incoming(server)
	const seen = []
	server.on('input', (d) => seen.push(d))
	conn.emit('data', { t: 'input', d: 1 })
	expect(server.peerIds).toHaveLength(0)
	hello(conn)
	for (const message of [
		null,
		3,
		[],
		{},
		{ t: 4 },
		{ t: '' },
		{ t: 'x'.repeat(65) },
		{ t: 'welcome', d: 1 },
	])
		conn.emit('data', message)
	conn.emit('data', { t: 'input', d: 2 })
	expect(seen).toEqual([2])
	conn.close()
	conn.emit('data', { t: 'input', d: 3 })
	expect(seen).toEqual([2])
})

test.each([undefined, 0, 2])(
	'host refuses wrong metadata version %s without seating a guest',
	async (v) => {
		const server = await host()
		let joins = 0
		server.onPeerJoin = () => joins++
		const conn = incoming(server, 'old-client', { v })
		expect(conn.sent[0].t).toBe('refused')
		expect(conn.sent[0].d.reason).toContain('version mismatch')
		hello(conn)
		expect(joins).toBe(0)
		clock.tick(100)
		expect(conn.closed).toBe(true)
	},
)

test('host validates hello version, ignores repeated hello, and rejects duplicates without dropping original', async () => {
	const server = await host()
	const wrong = incoming(server, 'wrong')
	hello(wrong, 2)
	expect(wrong.sent.at(-1).t).toBe('refused')
	let joins = 0
	server.onPeerJoin = () => joins++
	const first = incoming(server, 'same')
	const pendingDuplicate = incoming(server, 'same')
	expect(pendingDuplicate.sent[0].d.reason).toContain('already connected')
	hello(first)
	hello(first)
	const duplicate = incoming(server, 'same')
	expect(duplicate.sent[0].d.reason).toContain('already connected')
	clock.tick(100)
	expect(joins).toBe(1)
	expect(server.conns.get('same')).toBe(first)
	expect(first.closed).toBe(false)
})

test('capacity is eight humans including host and pending handshake reservations', async () => {
	const server = await host()
	const pending = Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => incoming(server, `client-${i}`))
	const full = incoming(server, 'extra')
	expect(full.sent[0].d.reason).toContain('full')
	pending.forEach((conn) => hello(conn))
	expect(server.peerIds).toHaveLength(7)
	pending[0].close()
	const replacement = incoming(server, 'replacement')
	hello(replacement)
	expect(server.peerIds).toHaveLength(7)
})

test('closed lobby refuses joins, including a match starting during handshake', async () => {
	const server = await host()
	const waiting = incoming(server, 'waiting')
	server.accepting = false
	hello(waiting)
	expect(waiting.sent.at(-1).d.reason).toContain('closed')
	const client = make()
	const result = client.join(server.code).catch((error) => error)
	expect((await settle(result)).message).toContain('closed')
	expect(client.active).toBe(false)
	expect(server.peerIds).toHaveLength(0)
})

test('guests reject unsolicited incoming links and never route their data', async () => {
	const server = await host()
	const client = await guest(server)
	const seen = []
	client.on('lobby', (data) => seen.push(data))
	const intruder = incoming(client, 'intruder')
	expect(intruder.sent[0].d.reason).toContain('Guests do not accept')
	hello(intruder)
	intruder.emit('data', { t: 'lobby', d: 'forged' })
	expect(seen).toHaveLength(0)
	expect(client.peerIds).toEqual([server.id])
})

test.each([
	[{ t: 'welcome', d: { v: 2, hostId: 'dodgethis-ABCDE' } }, 'version mismatch'],
	[{ t: 'refused', d: { v: 2, reason: 'old server' } }, 'version mismatch'],
	[{ t: 'welcome', d: { v: 1, hostId: 'wrong-host' } }, 'invalid host identity'],
	[{ t: 'refused', d: { v: 1, reason: 'Lobby closed' } }, 'Lobby closed'],
])('guest validates welcome/refused: %j', async (message, reason) => {
	hub.autoConnect = false
	const client = make()
	const result = client.join('ABCDE').catch((error) => error)
	clock.tick(0)
	await flush()
	const conn = client.peer.connections[0]
	conn.start()
	conn.emit('data', message)
	expect((await result).message).toContain(reason)
	expect(client.active).toBe(false)
	expect(conn.closed).toBe(true)
})

test('startup, join, and host handshake timeouts all clean up', async () => {
	hub.autoOpen = false
	const pendingHost = make()
	const startup = pendingHost.host().catch((error) => error)
	const startupPeer = pendingHost.peer
	clock.tick(50)
	expect((await startup).message).toContain('Signalling service timed out')
	expect(startupPeer.destroyed).toBe(true)
	hub.autoOpen = true
	hub.autoConnect = false
	const client = make()
	const joining = client.join('ABCDE').catch((error) => error)
	clock.tick(0)
	await flush()
	const joinPeer = client.peer
	clock.tick(80)
	expect((await joining).message).toContain('No answer')
	expect(joinPeer.destroyed).toBe(true)
	const server = await host()
	const conn = incoming(server)
	clock.tick(30)
	expect(conn.sent.at(-1).d.reason).toContain('handshake timed out')
	clock.tick(100)
	expect(conn.closed).toBe(true)
	expect(server.peerIds).toHaveLength(0)
	expect(server._pending.size).toBe(0)
})

test.each(['host', 'join'])(
	'leave cancels pending %s startup and ignores old peer callbacks',
	async (operation) => {
		hub.autoOpen = false
		const net = make()
		const result = (operation === 'host' ? net.host() : net.join('ABCDE')).catch((error) => error)
		const oldPeer = net.peer
		net.leave()
		expect((await result).message).toContain('cancelled')
		expect(oldPeer.destroyed).toBe(true)
		hub.autoOpen = true
		await settle(net.host())
		const id = net.id
		oldPeer.emit('open', 'old-id')
		oldPeer.emit('error', { type: 'network' })
		oldPeer.emit('close')
		oldPeer.emit('disconnected')
		const late = new Connection('late')
		oldPeer.emit('connection', late)
		expect(late.closed).toBe(true)
		expect(net.id).toBe(id)
		expect(net.active).toBe(true)
	},
)

test('an unopened connection timing out can only be refused, never welcomed or seated later', async () => {
	const server = await host()
	const conn = new Connection('late-open')
	server.peer.emit('connection', conn)
	hello(conn) // data before the server has welcomed this connection cannot seat it
	expect(server.peerIds).toHaveLength(0)
	clock.tick(30)
	conn.start()
	expect(conn.sent.map((m) => m.t)).toEqual(['refused'])
	hello(conn)
	expect(server.peerIds).toHaveLength(0)
})

test('a late refusal after guest adoption keeps the readable reason and clears the connection', async () => {
	const server = await host()
	const client = await guest(server)
	const messages = []
	client.onDisconnect = (reason) => messages.push(reason)
	const conn = server.conns.get(client.id)
	conn.send({ t: 'refused', d: { v: PROTO, reason: 'Match started during handshake' } })
	expect(messages).toEqual(['Match started during handshake'])
	expect(client.active).toBe(false)
	expect(server.peerIds).toHaveLength(0)
})

test('already-queued old timeout callbacks cannot alter a replacement session', async () => {
	hub.autoOpen = false
	const net = make()
	const result = net.host().catch((error) => error)
	const oldTimer = [...clock.tasks.values()][0].fn
	net.leave()
	await result
	hub.autoOpen = true
	await settle(net.host())
	const id = net.id
	oldTimer()
	expect(net.id).toBe(id)
	expect(net.active).toBe(true)
})

test('refused connection cleanup is safe even when close emits on every call', async () => {
	const server = await host()
	const conn = incoming(server, 'invalid', { v: 9 })
	let calls = 0
	conn.close = () => {
		calls++
		if (calls < 10) conn.emit('close')
	}
	clock.tick(100)
	expect(calls).toBe(1)
})

test('leave cancels pending join handshake; late welcome cannot resurrect it or damage a new host', async () => {
	hub.autoConnect = false
	const net = make()
	const result = net.join('ABCDE').catch((error) => error)
	clock.tick(0)
	await flush()
	const conn = net.peer.connections[0]
	net.leave()
	expect((await result).message).toContain('cancelled')
	await settle(net.host())
	const id = net.id
	conn.emit('data', { t: 'welcome', d: { v: PROTO, hostId: 'dodgethis-ABCDE' } })
	conn.emit('error', new Error('late'))
	conn.emit('close')
	expect(net.id).toBe(id)
	expect(net.active).toBe(true)
	expect(net.peerIds).toHaveLength(0)
})

test('replacing an operation cancels the old promise without letting its catch tear down the new peer', async () => {
	hub.autoOpen = false
	const net = make()
	const old = net.host().catch((error) => error)
	const oldPeer = net.peer
	hub.autoOpen = true
	const next = net.host()
	expect((await old).message).toContain('cancelled')
	await settle(next)
	expect(oldPeer.destroyed).toBe(true)
	expect(net.active).toBe(true)
})

test('guest departure fires host onPeerLeave once; host departure disconnects guests once', async () => {
	const server = await host()
	const a = await guest(server)
	const b = await guest(server)
	const aId = a.id
	const left = [],
		disconnected = []
	server.onPeerLeave = (id) => left.push(id)
	b.onDisconnect = (message) => disconnected.push(message)
	const conn = server.conns.get(aId)
	a.leave()
	conn.emit('close')
	conn.emit('error')
	expect(left).toEqual([aId])
	server.leave()
	expect(disconnected).toHaveLength(1)
	expect(disconnected[0]).toContain('host connection')
	expect(b.active).toBe(false)
	expect(b.peer).toBeNull()
	expect(server.peerIds).toHaveLength(0)
})

test('signalling loss cleans up and reports once, but intentional leave is silent', async () => {
	const server = await host()
	const messages = []
	server.onDisconnect = (message) => messages.push(message)
	const peer = server.peer
	peer.emit('disconnected')
	peer.emit('error', { type: 'network' })
	expect(messages).toEqual(['Connection to the signalling service was lost'])
	expect(peer.destroyed).toBe(true)
	await settle(server.host())
	server.leave()
	expect(messages).toHaveLength(1)
})

test('send failure drops a connection and reports the host-side departure once', async () => {
	const server = await host()
	const client = await guest(server)
	const id = client.id
	const leaves = []
	server.onPeerLeave = (peerId) => leaves.push(peerId)
	server.conns.get(id).failSend = true
	expect(server.send('lobby', {})).toBe(0)
	expect(leaves).toEqual([id])
	expect(server.peerIds).toHaveLength(0)
	expect(client.active).toBe(false)
})

test('missing library, invalid code, and missing lobby produce readable errors', async () => {
	const noLibrary = make({ Peer: null })
	expect(await noLibrary.host().catch((e) => e.message)).toContain(
		'Networking library did not load',
	)
	expect(noLibrary.active).toBe(false)
	for (const code of ['', null, 'bad', 'ABC0I', '<script>'])
		expect(
			await make()
				.join(code)
				.catch((e) => e.message),
		).toContain('lobby code')
	const client = make()
	const result = client.join('ABCDE').catch((e) => e.message)
	expect(await settle(result)).toBe('No lobby with that code')
	expect(client.peer).toBeNull()
})

test('private code collision retries use a fresh peer, and six-character codes can be joined', async () => {
	hub.autoOpen = false
	const server = make()
	const result = server.host()
	const collision = server.peer
	collision.emit('error', { type: 'unavailable-id' })
	await flush()
	expect(collision.destroyed).toBe(true)
	expect(server.peer).not.toBe(collision)
	server.peer.start()
	await result
	expect(server.active).toBe(true)
	hub.autoOpen = true
	hub.autoConnect = false
	const client = make()
	const joining = client.join('ABCDEF')
	clock.tick(0)
	await flush()
	const conn = client.peer.connections[0]
	conn.start()
	conn.emit('data', { t: 'welcome', d: { v: PROTO, hostId: 'dodgethis-ABCDEF' } })
	expect(await joining).toBe('ABCDEF')
})

test('constructor injection and window override replace public relay defaults', async () => {
	const options = { config: { iceServers: [{ urls: 'turn:private.example' }] } }
	const net = make({ peerOptions: options })
	await settle(net.host())
	expect(net.peer.options).toBe(options)
	expect(DEFAULT_PEER_OPTIONS.config.iceServers.at(-1).urls[0]).toContain('openrelay')
	const oldWindow = globalThis.window
	try {
		globalThis.window = { Peer: hub.Peer, DODGETHIS_PEER_OPTIONS: options }
		const browserNet = new Net({ timers: clock })
		nets.push(browserNet)
		await settle(browserNet.host())
		expect(browserNet.peer.options).toBe(options)
	} finally {
		if (oldWindow === undefined) delete globalThis.window
		else globalThis.window = oldWindow
	}
})
