import { test, expect } from 'bun:test'
import { createOnlineSession } from '../src/online-session.js'

function fixture(isHost = true, options = {}) {
	const handlers = new Map()
	const sent = []
	const net = {
		isHost,
		id: isHost ? 'host' : 'guest',
		hostId: 'host',
		code: 'ABCDE',
		accepting: true,
		on(t, f) {
			handlers.set(t, f)
		},
		send(t, d) {
			sent.push([t, structuredClone(d)])
		},
		async host() {},
		async join() {},
		leave() {},
	}
	const starts = [],
		aborts = [],
		messages = []
	const session = createOnlineSession(net, {
		onStart: (...args) => starts.push(args),
		onAbort: (x) => aborts.push(x),
		onMessage: (...args) => messages.push(args),
		...options,
	})
	return {
		net,
		session,
		starts,
		aborts,
		messages,
		sent,
		receive: (t, d, from) => handlers.get(t)?.(d, from),
	}
}
test('host creates zero-bot human match, assigns teams, freezes roster and aborts on departure', async () => {
	const f = fixture()
	await f.session.host()
	expect(() => f.session.start()).toThrow('Both teams')
	f.net.onPeerJoin('guest')
	expect(f.session.state.humans.map((p) => p.team)).toEqual(['A', 'B'])
	f.session.start()
	expect(f.starts[0][0].every((p) => p.controller === 'human')).toBe(true)
	expect(f.net.accepting).toBe(false)
	expect(() => f.session.setBots('A', 1)).toThrow('frozen')
	f.net.onPeerLeave('guest')
	expect(f.session.state.phase).toBe('lobby')
	expect(f.session.state.matchId).toBeNull()
	expect(f.net.accepting).toBe(true)
	expect(f.aborts[0]).toContain('scores reset')
})
test('allied humans and mixed bots use explicit ownership; guest settings and score messages ignored', async () => {
	const f = fixture()
	await f.session.host()
	f.net.onPeerJoin('guest')
	f.session.setTeam('guest', 'A')
	f.session.setBots('B', 3)
	f.receive('lobby', { bots: { A: 12, B: 0 } }, 'guest')
	expect(f.session.state.bots).toEqual({ A: 0, B: 3 })
	f.session.start()
	expect(f.starts[0][0].filter((p) => p.controller === 'bot')).toHaveLength(3)
	f.receive('snapshot', { wins: { A: 99 } }, 'guest')
	f.receive('input', {}, 'stranger')
	expect(f.messages).toHaveLength(0)
	f.receive('input', {}, 'guest')
	expect(f.messages).toHaveLength(1)
})
test('guest only adopts validated newer host lobby; start is once, stale and malformed messages ignored', async () => {
	const host = fixture()
	await host.session.host()
	host.net.onPeerJoin('guest')
	const guest = fixture(false)
	let state = structuredClone(host.session.state)
	guest.receive('lobby', state, 'stranger')
	expect(guest.session.state).toBeNull()
	guest.receive('lobby', state, 'host')
	expect(guest.session.state.humans).toHaveLength(2)
	expect(() => guest.session.setBots('A', 1)).toThrow('Only the host')
	host.session.start()
	state = structuredClone(host.session.state)
	guest.receive('lobby', state, 'host')
	guest.receive('lobby', state, 'host')
	expect(guest.starts).toHaveLength(1)
	guest.receive('lobby', { ...state, revision: 999, bots: { A: -1, B: 0 } }, 'host')
	expect(guest.session.state.revision).toBe(state.revision)
	guest.receive('input', {}, 'host')
	expect(guest.messages).toHaveLength(0)
	guest.net.onDisconnect()
	expect(guest.session.state).toBeNull()
	expect(guest.aborts[0]).toContain('host left')
})

test('join waits for a validated roster and times out cleanly if host never sends it', async () => {
	const f = fixture(false, { rosterTimeout: 5 })
	let leaves = 0
	f.net.leave = () => leaves++
	await expect(f.session.join('ABCDE')).rejects.toThrow('did not send a roster')
	expect(leaves).toBe(1)
	expect(f.session.state).toBeNull()
})

test('leave cancels the pending roster wait; fresh join adopts only its own roster', async () => {
	const f = fixture(false, { rosterTimeout: 1000 })
	const waiting = f.session.join('ABCDE')
	const rejected = waiting.catch((error) => error.message)
	await Promise.resolve()
	f.session.leave()
	expect(await rejected).toContain('cancelled')
	const host = fixture()
	await host.session.host()
	host.net.onPeerJoin('guest')
	const joining = f.session.join('ABCDE')
	await Promise.resolve()
	f.receive('lobby', structuredClone(host.session.state), 'host')
	await joining
	expect(f.session.state.humans).toHaveLength(2)
})

test('synchronous departure during start broadcast cannot resurrect the aborted match', async () => {
	const f = fixture()
	await f.session.host()
	f.net.onPeerJoin('guest')
	f.net.send = (type, state) => {
		if (type === 'lobby' && state.phase === 'match') f.net.onPeerLeave('guest')
	}
	f.session.start()
	expect(f.session.state.phase).toBe('lobby')
	expect(f.session.state.matchId).toBeNull()
	expect(f.starts).toHaveLength(0)
})

test('quick join skips unavailable lobbies and waits for a valid roster', async () => {
	const host = fixture()
	await host.session.host()
	host.net.onPeerJoin('guest')
	const directory = { list: async () => [{ code: 'BCDEF' }, { code: 'ABCDE' }], stop() {} }
	const guest = fixture(false, { directory })
	const attempts = []
	guest.net.join = async (code) => {
		attempts.push(code)
		if (code === 'BCDEF') throw new Error('Lobby full')
		guest.receive('lobby', host.session.state, 'host')
	}
	await guest.session.quickJoin()
	expect(attempts).toEqual(['BCDEF', 'ABCDE'])
	expect(guest.session.state.humans).toHaveLength(2)
})

test('quick join reports no lobbies and leave cancels discovery', async () => {
	let resolve
	const directory = { list: async () => [], stop() {} }
	const guest = fixture(false, { directory })
	await expect(guest.session.quickJoin()).rejects.toThrow('No public lobbies')
	directory.list = () =>
		new Promise((done) => {
			resolve = done
		})
	const joining = guest.session.quickJoin()
	guest.session.leave()
	resolve([{ code: 'ABCDE' }])
	await expect(joining).rejects.toThrow('cancelled')
	expect(guest.session.state).toBeNull()
})

test('public hosting registers explicitly and leaves cleanly if registration fails', async () => {
	let registrations = 0
	const directory = {
		update() {},
		stop() {},
		async start(state) {
			registrations++
			expect(state.public).toBe(true)
			throw new Error('Directory unavailable')
		},
	}
	const host = fixture(true, { directory })
	await host.session.host()
	expect(registrations).toBe(0)
	await expect(host.session.host(true)).rejects.toThrow('Directory unavailable')
	expect(registrations).toBe(1)
	expect(host.session.state).toBeNull()
})
