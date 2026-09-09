import { createLobbyDirectory } from './lobby-directory.js'
import { validateRoster } from './roster.js'

export const MAX_BOTS = 12
const teams = ['A', 'B']

// Only the host edits the roster. Transport identity, never a message field,
// determines which human owns a seat.
export function createOnlineSession(
	net,
	{
		onChange = () => {},
		onStart = () => {},
		onAbort = () => {},
		onMessage = () => {},
		rosterTimeout = 7000,
		directory = createLobbyDirectory(),
	} = {},
) {
	let state = null
	let revision = 0
	let lastRevision = -1
	let pendingRoster = null
	let generation = 0
	function settleRoster(error) {
		if (!pendingRoster) return
		const pending = pendingRoster
		pendingRoster = null
		clearTimeout(pending.timer)
		if (error) pending.reject(error)
		else pending.resolve()
	}
	const notify = () => onChange(state)
	function publish() {
		directory.update(state)
		state.revision = ++revision
		net.send('lobby', state)
		notify()
	}
	function requireHost() {
		if (!net.isHost || !state) throw new Error('Only the host can change the lobby')
		if (state.phase !== 'lobby') throw new Error('Roster and settings are frozen during a match')
	}
	function roster() {
		return validateRoster([
			...state.humans,
			...teams.flatMap((team) =>
				Array.from({ length: state.bots[team] }, (_, i) => ({
					id: `bot-${team}-${i}`,
					team,
					controller: 'bot',
					peerId: null,
				})),
			),
		])
	}
	net.onPeerJoin = (peerId) => {
		if (!net.isHost || !state || state.phase !== 'lobby') return
		if (state.humans.some((p) => p.peerId === peerId)) return
		const team =
			state.humans.filter((p) => p.team === 'A').length <=
			state.humans.filter((p) => p.team === 'B').length
				? 'A'
				: 'B'
		state.humans.push({ id: peerId, peerId, team, controller: 'human' })
		publish()
	}
	net.onPeerLeave = (peerId) => {
		if (!net.isHost || !state) return
		state.humans = state.humans.filter((p) => p.peerId !== peerId)
		if (state.phase === 'match') {
			state.phase = 'lobby'
			state.matchId = null
			state.message = 'A player left. Match cancelled; scores reset.'
			net.accepting = true
			onAbort(state.message)
		}
		publish()
	}
	net.onDisconnect = (message) => {
		generation++
		directory.stop()
		const reason = message || 'The host left. Session ended.'
		settleRoster(new Error(reason))
		net.leave()
		state = null
		lastRevision = -1
		onAbort(reason)
		onChange(null, reason)
	}
	net.on('lobby', (incoming, from) => {
		if (
			net.isHost ||
			from !== net.hostId ||
			!validLobby(incoming, net.hostId, net.id) ||
			incoming.revision <= lastRevision
		)
			return
		const previous = state
		lastRevision = incoming.revision
		state = structuredClone(incoming)
		settleRoster()
		notify()
		if (state.phase === 'match' && previous?.matchId !== state.matchId)
			onStart(roster(), state.matchId)
		if (previous?.phase === 'match' && state.phase === 'lobby')
			onAbort(state.message || 'Back to lobby; scores reset.')
	})
	for (const type of ['input', 'snapshot', 'events'])
		net.on(type, (data, from) => {
			if (!state || state.phase !== 'match') return
			if (
				net.isHost
					? type !== 'input' || !state.humans.some((p) => p.peerId === from)
					: type === 'input' || from !== net.hostId
			)
				return
			onMessage(type, data, from)
		})
	return {
		get state() {
			return state
		},
		get active() {
			return !!state
		},
		net,
		async host(isPublic = false) {
			directory.stop()
			const operation = ++generation
			settleRoster(new Error('Connection attempt cancelled'))
			await net.host()
			if (operation !== generation) throw new Error('Connection attempt cancelled')
			revision = 0
			lastRevision = -1
			state = {
				revision: 0,
				phase: 'lobby',
				public: isPublic,
				matchId: null,
				code: net.code,
				hostId: net.id,
				humans: [{ id: net.id, peerId: net.id, team: 'A', controller: 'human' }],
				bots: { A: 0, B: 0 },
				message: '',
			}
			publish()
			if (isPublic) {
				try {
					await directory.start(state, (error) => {
						if (operation === generation) onChange(state, error.message)
					})
					if (operation !== generation) throw new Error('Connection attempt cancelled')
				} catch (error) {
					if (operation === generation) this.leave()
					throw error
				}
			}
		},
		async quickJoin() {
			const operation = ++generation
			const lobbies = await directory.list()
			if (operation !== generation) throw new Error('Connection attempt cancelled')
			for (const { code } of lobbies) {
				const attempt = generation + 1
				try {
					await this.join(code)
					return
				} catch (error) {
					if (generation !== attempt || state) throw error
				}
			}
			throw Object.assign(new Error('No public lobbies available.'), { code: 'NO_PUBLIC_LOBBIES' })
		},
		async join(code) {
			directory.stop()
			const operation = ++generation
			settleRoster(new Error('Connection attempt cancelled'))
			lastRevision = -1
			state = null
			await net.join(code)
			if (operation !== generation) throw new Error('Connection attempt cancelled')
			if (state) return
			await new Promise((resolve, reject) => {
				pendingRoster = {
					resolve,
					reject,
					timer: setTimeout(() => {
						net.leave()
						settleRoster(new Error('The host did not send a roster. Leave and try again.'))
					}, rosterTimeout),
				}
			})
		},
		setTeam(id, team) {
			requireHost()
			if (!teams.includes(team)) throw new Error('Unknown team')
			const human = state.humans.find((p) => p.id === id)
			if (!human) throw new Error('Unknown participant')
			human.team = team
			publish()
		},
		setBots(team, count) {
			requireHost()
			if (!teams.includes(team) || !Number.isInteger(count) || count < 0 || count > MAX_BOTS)
				throw new Error(`Bots must be 0–${MAX_BOTS}`)
			state.bots[team] = count
			publish()
		},
		start() {
			requireHost()
			const participants = roster()
			if (!teams.every((team) => participants.some((p) => p.team === team)))
				throw new Error('Both teams need at least one participant')
			state.phase = 'match'
			state.matchId = Array.from(crypto.getRandomValues(new Uint32Array(4)), (value) =>
				value.toString(16),
			).join('-')
			state.message = ''
			net.accepting = false
			const startingId = state.matchId
			publish()
			if (state?.phase === 'match' && state.matchId === startingId)
				onStart(participants, startingId)
		},
		backToLobby(message = '') {
			if (!net.isHost || !state) return
			state.phase = 'lobby'
			state.matchId = null
			state.message = message
			net.accepting = true
			onAbort(message)
			publish()
		},
		leave() {
			directory.stop()
			generation++
			settleRoster(new Error('Connection attempt cancelled'))
			net.leave()
			state = null
			lastRevision = -1
			onAbort('')
			notify()
		},
	}
}

function validLobby(state, hostId, localId) {
	if (
		!state ||
		!Number.isSafeInteger(state.revision) ||
		state.revision < 0 ||
		state.hostId !== hostId ||
		!['lobby', 'match'].includes(state.phase)
	)
		return false
	if (
		typeof state.code !== 'string' ||
		state.code.length > 12 ||
		typeof state.message !== 'string' ||
		state.message.length > 200
	)
		return false
	if (
		state.phase === 'match'
			? typeof state.matchId !== 'string' || state.matchId.length > 80
			: state.matchId !== null
	)
		return false
	if (
		!state.bots ||
		!teams.every(
			(team) =>
				Number.isInteger(state.bots[team]) && state.bots[team] >= 0 && state.bots[team] <= MAX_BOTS,
		)
	)
		return false
	if (!Array.isArray(state.humans) || state.humans.length > 8) return false
	try {
		validateRoster(state.humans)
	} catch {
		return false
	}
	return (
		state.humans.every((p) => p.controller === 'human' && p.id === p.peerId) &&
		[hostId, localId].every((id) => state.humans.some((p) => p.peerId === id))
	)
}
