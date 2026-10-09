import { createLobbyDirectory } from './lobby-directory.js'
import { validateRoster } from '../../core/roster.js'
import { MAX_PLAYERS, REMOVAL_MESSAGES, plainJoinData } from './net.js'

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
		onBackToLobby = () => false,
		onPeerLeave = () => false,
		modeId = () => null,
		joinData = () => undefined,
		rosterSelections = () => [],
		// A mode with its own walk-around lobby takes the room there at once; it seats bots itself.
		hasRoomLobby = () => false,
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
		state.capacity = net.capacity?.() ?? MAX_PLAYERS
		net.send('lobby', state)
		notify()
	}
	function syncSelections(keepTeams = false) {
		for (const pick of rosterSelections()) {
			const human = state.humans.find((h) => h.id === pick.id)
			if (!human) continue
			if (!keepTeams) human.team = pick.team
			human.data = { ...human.data, heroId: pick.heroId }
			if (Number.isSafeInteger(pick.joinOrder)) human.joinOrder = pick.joinOrder
		}
	}
	function requireHost() {
		if (!net.isHost || !state) throw new Error('Only the host can change the lobby')
		if (state.phase !== 'lobby') throw new Error('Roster and settings are frozen during a match')
	}
	// The mode's roster: online makes each human's participant id its peer id.
	function roster() {
		return validateRoster([
			...state.humans,
			...teams.flatMap((team) =>
				Array.from({ length: state.bots[team] }, (_, i) => ({
					id: `bot-${team}-${i}`,
					team,
					controller: 'bot',
				})),
			),
		]).map((p) => {
			const human = state.humans.find((h) => h.id === p.id)
			return human
				? Object.freeze({
						...p,
						joinOrder: human.joinOrder,
						...(human.data ? { data: Object.freeze({ ...human.data }) } : {}),
					})
				: p
		})
	}
	net.onPeerJoin = (peerId, data) => {
		if (!net.isHost || !state || state.phase !== 'lobby') return
		if (state.humans.some((p) => p.peerId === peerId)) return
		const team =
			state.humans.filter((p) => p.team === 'A').length <=
			state.humans.filter((p) => p.team === 'B').length
				? 'A'
				: 'B'
		const joinOrder = Math.max(-1, ...state.humans.map((h, i) => h.joinOrder ?? i)) + 1
		state.humans.push({
			id: peerId,
			peerId,
			team,
			joinOrder,
			controller: 'human',
			...(data ? { data } : {}),
		})
		// A new peer starts a fresh shared lobby roster; departures never restart it.
		if (state.liveLobby) session.start()
		else publish()
	}
	net.onPeerLeave = (peerId, code) => {
		if (!net.isHost || !state) return
		state.humans = state.humans.filter((p) => p.peerId !== peerId)
		const reason = Object.hasOwn(REMOVAL_MESSAGES, code) ? REMOVAL_MESSAGES[code] : null
		if (reason) state.message = reason
		const kept = state.matchId && onPeerLeave(peerId)
		if (state.phase === 'match' && !kept) {
			state.phase = 'lobby'
			state.liveLobby = false
			state.matchId = null
			state.message = reason
				? `${reason} Match cancelled.`
				: 'A player left. Match cancelled; scores reset.'
			net.accepting = true
			onAbort(state.message)
		}
		publish()
	}
	net.onDisconnect = (message, code) => {
		generation++
		directory.stop()
		const removal = Object.hasOwn(REMOVAL_MESSAGES, code) ? REMOVAL_MESSAGES[code] : null
		const notice = removal || message || 'The host left. Session ended.'
		const reason = removal && state?.phase === 'match' ? `${notice} Match cancelled.` : notice
		settleRoster(new Error(reason))
		net.leave()
		state = null
		lastRevision = -1
		onAbort(reason)
		onChange(null, reason)
	}
	net.on('lobby', (incoming, from) => {
		if (net.isHost) {
			net.reject?.(from)
			return
		}
		if (
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
		if (state.matchId && previous?.matchId !== state.matchId)
			onStart(roster(), state.matchId, state.modeId)
		if (previous?.phase === 'match' && state?.phase === 'lobby' && !state.liveLobby)
			onAbort(state.message || 'Back to lobby; scores reset.')
	})
	// Guests send intent frames; the host sends state envelopes.
	for (const type of ['intent', 'state'])
		net.on(type, (data, from) => {
			if (!state?.matchId) {
				net.reject?.(from)
				return
			}
			if (
				net.isHost
					? type !== 'intent' || !state.humans.some((p) => p.peerId === from)
					: type !== 'state' || from !== net.hostId
			) {
				net.reject?.(from)
				return
			}
			onMessage(type, data, from)
		})
	const session = {
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
			const data = joinData()
			state = {
				revision: 0,
				phase: 'lobby',
				modeId: modeId(),
				public: isPublic,
				matchId: null,
				code: net.code,
				hostId: net.id,
				humans: [
					{
						id: net.id,
						peerId: net.id,
						team: 'A',
						joinOrder: 0,
						controller: 'human',
						...(data ? { data } : {}),
					},
				],
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
			if (operation === generation && hasRoomLobby()) this.start()
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
			await net.join(code, joinData())
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
			syncSelections()
			const human = state.humans.find((p) => p.id === id)
			if (!human) throw new Error('Unknown participant')
			human.team = team
			if (state.liveLobby) session.start({ keepTeams: true })
			else publish()
		},
		setBots(team, count) {
			requireHost()
			if (!teams.includes(team) || !Number.isInteger(count) || count < 0 || count > MAX_BOTS)
				throw new Error(`Bots must be 0–${MAX_BOTS}`)
			state.bots[team] = count
			if (state.liveLobby) session.start()
			else publish()
		},
		start({ keepTeams = false } = {}) {
			requireHost()
			syncSelections(keepTeams)
			const capacity = net.capacity?.() ?? MAX_PLAYERS
			if (state.humans.length > capacity)
				throw new Error(`This mode allows at most ${capacity} humans; remove a player before Start`)
			const local = state.humans.find((p) => p.id === net.id)
			const data = joinData()
			if (data) local.data = data
			const participants = roster()
			if (
				!state.liveLobby &&
				!hasRoomLobby() &&
				!teams.every((team) => participants.some((p) => p.team === team))
			)
				throw new Error('Both teams need at least one participant')
			state.modeId = modeId()
			state.phase = 'match'
			state.liveLobby = false
			state.matchId = Array.from(crypto.getRandomValues(new Uint32Array(4)), (value) =>
				value.toString(16),
			).join('-')
			state.message = ''
			net.accepting = false
			const startingId = state.matchId
			publish()
			if (state?.phase === 'match' && state.matchId === startingId)
				onStart(participants, startingId, state.modeId)
		},
		setRoomPhase(lobby) {
			if (!net.isHost || !state?.matchId) return
			syncSelections()
			state.phase = lobby ? 'lobby' : 'match'
			state.liveLobby = lobby
			state.modeId = modeId()
			net.accepting = lobby
			publish()
		},
		backToLobby(message = '') {
			if (!net.isHost || !state || state.liveLobby) return
			if (state.phase === 'match' && onBackToLobby()) return
			state.phase = 'lobby'
			state.liveLobby = false
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
	return session
}

function validLobby(state, hostId, localId) {
	if (
		!state ||
		!Number.isSafeInteger(state.revision) ||
		state.revision < 0 ||
		state.hostId !== hostId ||
		!(
			state.modeId === null ||
			(typeof state.modeId === 'string' && state.modeId.length > 0 && state.modeId.length <= 64)
		) ||
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
		(state.liveLobby != null && typeof state.liveLobby !== 'boolean') ||
		(state.liveLobby && state.phase !== 'lobby') ||
		(state.phase === 'match' || state.liveLobby
			? typeof state.matchId !== 'string' || state.matchId.length > 80
			: state.matchId !== null)
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
	if (
		state.capacity != null &&
		(!Number.isSafeInteger(state.capacity) || state.capacity < 1 || state.capacity > MAX_PLAYERS)
	)
		return false
	if (!Array.isArray(state.humans) || state.humans.length > (state.capacity ?? MAX_PLAYERS))
		return false
	try {
		validateRoster(state.humans)
	} catch {
		return false
	}
	return (
		state.humans.every(
			(p) =>
				p.controller === 'human' &&
				p.id === p.peerId &&
				plainJoinData(p.data) &&
				(p.joinOrder == null || (Number.isSafeInteger(p.joinOrder) && p.joinOrder >= 0)),
		) && [hostId, localId].every((id) => state.humans.some((p) => p.peerId === id))
	)
}
