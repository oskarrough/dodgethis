// Private, host-and-spoke PeerJS transport. Lobby/game authority lives in the session model.
import { tune } from './tune.js'

// 3: raw strings let us bound guest traffic before parsing JSON.
export const PROTO = 3
export const MAX_PLAYERS = 8
export const REMOVAL_MESSAGES = Object.freeze({
	'input-abuse': 'Player removed: invalid or excessive input.',
})
const PREFIX = 'dodgethis-'
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CONTROL = new Set(['hello', 'welcome', 'refused'])

// Public OpenRelay service, as in the Doodle reference: best-effort third-party
// TURN, not a private or guaranteed relay. Deployments can replace this config
// via window.DODGETHIS_PEER_OPTIONS (or constructor peerOptions).
export const DEFAULT_PEER_OPTIONS = {
	debug: 0,
	config: {
		iceServers: [
			{ urls: 'stun:stun.l.google.com:19302' },
			{ urls: 'stun:stun1.l.google.com:19302' },
			{ urls: 'stun:stun.cloudflare.com:3478' },
			{
				urls: [
					'turn:openrelay.metered.ca:80',
					'turn:openrelay.metered.ca:443',
					'turn:openrelay.metered.ca:443?transport=tcp',
				],
				username: 'openrelayproject',
				credential: 'openrelayproject',
			},
		],
	},
}

function errorMessage(error) {
	switch (error?.type) {
		case 'unavailable-id':
			return 'That lobby code is already in use'
		case 'peer-unavailable':
			return 'No lobby with that code'
		case 'browser-incompatible':
			return 'This browser does not support peer connections'
		case 'network':
		case 'server-error':
		case 'socket-error':
		case 'socket-closed':
			return 'Could not reach the signalling service'
		default:
			return error?.message || 'Peer connection failed'
	}
}
const cancelled = () => new Error('Connection attempt cancelled')
const makeCode = () =>
	Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')

export class Net {
	constructor({
		Peer = globalThis.window?.Peer,
		peerOptions = globalThis.window?.DODGETHIS_PEER_OPTIONS ?? DEFAULT_PEER_OPTIONS,
		timers = globalThis,
		startupTimeout = 12000,
		joinTimeout = 14000,
		handshakeTimeout = 5000,
	} = {}) {
		this.Peer = Peer
		this.peerOptions = peerOptions
		this.timers = timers
		this.startupTimeout = startupTimeout
		this.joinTimeout = joinTimeout
		this.handshakeTimeout = handshakeTimeout
		this.peer = null
		this.id = null
		this.hostId = null
		this.code = null
		this.isHost = false
		this.connected = false
		this.accepting = true
		this.conns = new Map()
		this.handlers = new Map()
		this.onPeerJoin = null
		this.onPeerLeave = null
		this.onDisconnect = null
		this._generation = 0
		this._connections = new Set()
		this._pending = new Map()
		this._timeouts = new Map()
		this._inputs = new Map()
		this._cancelOperation = null
	}

	get active() {
		return !!this.peer && this.connected
	}
	get peerIds() {
		return [...this.conns.keys()]
	}
	on(type, fn) {
		this.handlers.set(type, fn)
	}

	async host() {
		this.leave()
		const generation = this._generation
		this.isHost = true
		try {
			for (let attempt = 0; attempt < 3; attempt++) {
				this.code = makeCode()
				try {
					await this._openPeer(PREFIX + this.code, generation)
					break
				} catch (error) {
					if (generation !== this._generation) throw cancelled()
					if (error.type !== 'unavailable-id' || attempt === 2) throw error
				}
			}
			if (generation !== this._generation) throw cancelled()
			this.hostId = this.id
			this.connected = true
			return this.code
		} catch (error) {
			if (generation === this._generation) this.leave()
			throw error
		}
	}

	async join(code) {
		this.leave()
		const generation = this._generation
		code = typeof code === 'string' ? code.trim().toUpperCase() : ''
		if (!/^[A-HJ-NP-Z2-9]{5,6}$/.test(code))
			throw new Error('Enter a five or six character lobby code')
		try {
			await this._openPeer(null, generation)
			if (generation !== this._generation) throw cancelled()
			this.code = code
			this.hostId = PREFIX + code
			const conn = this.peer.connect(this.hostId, {
				reliable: true,
				serialization: 'raw',
				metadata: { v: PROTO },
			})
			await this._joinConnection(conn, generation)
			if (generation !== this._generation) throw cancelled()
			return this.code
		} catch (error) {
			if (generation === this._generation) this.leave()
			throw error
		}
	}

	_openPeer(id, generation) {
		return new Promise((resolve, reject) => {
			if (typeof this.Peer !== 'function') {
				reject(new Error('Networking library did not load; refresh the page'))
				return
			}
			let peer
			try {
				peer = new this.Peer(id, this.peerOptions)
			} catch (error) {
				reject(new Error(errorMessage(error)))
				return
			}
			this.peer = peer
			let settled = false
			const current = () => generation === this._generation && this.peer === peer
			const finish = (error) => {
				if (settled) return
				settled = true
				this._clearTimeout(peer)
				this._cancelOperation = null
				if (error) {
					if (this.peer === peer) this.peer = null
					try {
						peer.destroy()
					} catch {
						/* already closed */
					}
					reject(error)
				} else resolve()
			}
			this._cancelOperation = () => finish(cancelled())
			this._timeout(peer, this.startupTimeout, () =>
				finish(new Error('Signalling service timed out')),
			)
			peer.on('open', (peerId) => {
				if (!current() || settled) return
				if (typeof peerId !== 'string' || !peerId)
					return finish(new Error('Signalling service returned no peer id'))
				this.id = peerId
				finish()
			})
			peer.on('connection', (conn) => {
				if (!current()) {
					this._close(conn)
					return
				}
				if (this.isHost && this.active) this._incoming(conn, generation)
				else this._refuse(conn, 'Guests do not accept incoming connections', generation)
			})
			peer.on('error', (error) => {
				if (!current()) return
				const failure = new Error(errorMessage(error))
				failure.type = error?.type
				if (!settled) finish(failure)
				else if (this._cancelOperation) this._cancelOperation(failure)
				else if (error?.type !== 'peer-unavailable') this._disconnect(failure.message)
			})
			peer.on('disconnected', () => {
				if (!current()) return
				const message = 'Connection to the signalling service was lost'
				if (!settled) finish(new Error(message))
				else if (this._cancelOperation) this._cancelOperation(new Error(message))
				else this._disconnect(message)
			})
			peer.on('close', () => {
				if (!current()) return
				if (!settled) finish(new Error('Peer connection closed during startup'))
				else if (this._cancelOperation) this._cancelOperation(new Error('Peer connection closed'))
				else this._disconnect('Peer connection closed')
			})
		})
	}

	_joinConnection(conn, generation) {
		this._connections.add(conn)
		return new Promise((resolve, reject) => {
			let settled = false
			const finish = (error) => {
				if (settled) return
				settled = true
				this._clearTimeout(conn)
				this._cancelOperation = null
				if (error) reject(error)
				else resolve()
			}
			this._cancelOperation = (error = cancelled()) => finish(error)
			this._timeout(conn, this.joinTimeout, () =>
				finish(new Error('No answer from that lobby; check the code or your connection')),
			)
			conn.on('data', (raw) => {
				if (generation !== this._generation || !this._connections.has(conn)) return
				// Protocol 2 sends an object into our raw channel, which RTC coerces to this string.
				if (!settled && raw === '[object Object]')
					return finish(new Error('Game version mismatch; everyone must refresh the page'))
				const message = this._read(conn, raw)
				if (settled) {
					// The lobby may close between welcome and our hello acknowledgement.
					if (message?.t === 'refused' && this.conns.get(conn.peer) === conn) {
						const reason =
							typeof message.d?.reason === 'string'
								? message.d.reason.slice(0, 200)
								: 'The lobby refused the connection'
						this._disconnect(reason, message.d?.code)
					} else this._route(conn, message)
					return
				}
				if (message?.t !== 'welcome' && message?.t !== 'refused') return
				if (message.d?.v !== PROTO)
					return finish(new Error('Game version mismatch; everyone must refresh the page'))
				if (message.t === 'refused') {
					const reason =
						typeof message.d.reason === 'string'
							? message.d.reason.slice(0, 200)
							: 'The lobby refused the connection'
					return finish(new Error(reason))
				}
				if (conn.peer !== this.hostId || message.d.hostId !== this.hostId)
					return finish(new Error('Lobby returned an invalid host identity'))
				// Adopt BEFORE acknowledging: onPeerJoin can immediately publish a roster.
				// Session listeners registered before join() receive it even before await returns.
				this.conns.set(conn.peer, conn)
				this.connected = true
				finish()
				this._send(conn, { t: 'hello', d: { v: PROTO } })
			})
			conn.on('close', () => {
				if (generation !== this._generation) return
				if (!settled) finish(new Error('The lobby closed the connection before welcoming you'))
				else this._drop(conn)
			})
			conn.on('error', (error) => {
				if (generation !== this._generation) return
				if (!settled) finish(new Error(errorMessage(error)))
				else this._drop(conn)
			})
		})
	}

	_incoming(conn, generation) {
		let reason
		if (conn.metadata?.v !== PROTO || conn.serialization !== 'raw')
			reason = 'Game version mismatch; everyone must refresh the page'
		else if (!this.accepting) reason = 'That lobby is closed; a match may already be running'
		else if (typeof conn.peer !== 'string' || !conn.peer || conn.peer === this.id)
			reason = 'Invalid peer identity'
		else if (this.conns.has(conn.peer) || this._pending.has(conn.peer))
			reason = 'That player is already connected'
		else if (this.conns.size + this._pending.size >= MAX_PLAYERS - 1)
			reason = 'That lobby is full (8 players maximum)'
		if (reason) {
			this._refuse(conn, reason, generation)
			return
		}
		this._connections.add(conn)
		this._pending.set(conn.peer, conn) // reserve capacity while the handshake is pending
		const current = () => generation === this._generation && this._connections.has(conn)
		let welcomed = false
		this._timeout(conn, this.handshakeTimeout, () =>
			this._refuse(conn, 'Lobby handshake timed out', generation),
		)
		conn.on('open', () => {
			if (!current() || this._pending.get(conn.peer) !== conn || welcomed) return
			if (!this.accepting) {
				this._refuse(conn, 'That lobby is closed; a match may already be running', generation)
				return
			}
			welcomed = true
			this._send(conn, { t: 'welcome', d: { v: PROTO, hostId: this.id } })
		})
		conn.on('data', (raw) => {
			if (!current()) return
			const message = this._read(conn, raw)
			if (this.conns.get(conn.peer) === conn) {
				this._route(conn, message)
				return
			}
			if (!welcomed || this._pending.get(conn.peer) !== conn || message?.t !== 'hello') return
			if (message.d?.v !== PROTO) {
				this._refuse(conn, 'Game version mismatch; everyone must refresh the page', generation)
				return
			}
			if (!this.accepting) {
				this._refuse(conn, 'That lobby is closed; a match may already be running', generation)
				return
			}
			this._pending.delete(conn.peer)
			this._clearTimeout(conn)
			this.conns.set(conn.peer, conn)
			this.onPeerJoin?.(conn.peer)
		})
		conn.on('close', () => {
			if (current()) this._drop(conn)
		})
		conn.on('error', () => {
			if (current()) this._drop(conn)
		})
	}

	_refuse(conn, reason, generation, code) {
		if (this._pending.get(conn.peer) === conn) this._pending.delete(conn.peer)
		this._connections.add(conn)
		const current = () => generation === this._generation && this._connections.has(conn)
		const refuse = () => {
			if (!current()) return
			try {
				const message = { t: 'refused', d: { v: PROTO, reason, ...(code ? { code } : {}) } }
				conn.send(conn.serialization === 'raw' ? JSON.stringify(message) : message)
			} catch {
				/* close still informs the guest */
			}
			// The guest closes after reading the notice; only a non-cooperating guest needs this fallback.
			if (current()) this._timeout(conn, tune.input.closeDelay, () => this._close(conn))
		}
		conn.on('close', () => {
			if (current()) this._close(conn)
		})
		conn.on('error', () => {
			if (current()) this._close(conn)
		})
		this._timeout(conn, this.handshakeTimeout, () => this._close(conn))
		if (conn.open) refuse()
		else conn.on('open', refuse)
	}

	// The host charges EVERY raw message before touching JSON, even unknown types and malformed input.
	_read(conn, raw) {
		if (this.isHost) {
			let budget = this._inputs.get(conn)
			const time = performance.now() / 1000
			if (budget?.dropped) return null
			if (!budget) {
				budget = { at: time, tokens: tune.input.burst, dirty: [] }
				this._inputs.set(conn, budget)
			}
			budget.tokens = Math.min(
				tune.input.burst,
				budget.tokens + (time - budget.at) * tune.input.rate,
			)
			budget.at = time
			const allowed = budget.tokens >= 1
			if (allowed) budget.tokens--
			if (!allowed || !this._withinCap(raw)) {
				this._reject(conn)
				return null
			}
		} else if (typeof raw !== 'string') return null
		try {
			const message = JSON.parse(raw)
			if (!message || typeof message !== 'object' || Array.isArray(message)) {
				this._reject(conn)
				return null
			}
			return message
		} catch {
			this._reject(conn)
			return null
		}
	}

	_withinCap(raw) {
		// Cheap code-unit limit first; never encode an arbitrarily large payload.
		return (
			typeof raw === 'string' &&
			raw.length <= tune.input.cap &&
			new TextEncoder().encode(raw).byteLength <= tune.input.cap
		)
	}

	reject(peerId) {
		const conn = this.conns.get(peerId)
		if (conn) this._reject(conn)
	}

	_reject(conn) {
		const budget = this._inputs.get(conn)
		if (!this.isHost || !budget || budget.dropped) return
		const window = Math.floor(performance.now() / 1000 / tune.input.dirtyWindow)
		if (budget.dirty.at(-1) === window) return
		// A quiet window ages history, rather than washing repeated abuse clean.
		budget.dirty = budget.dirty.filter((w) => window - w < tune.input.historyWindows)
		budget.dirty.push(window)
		if (budget.dirty.length < tune.input.rejectionWindows) return
		budget.dropped = true
		const established = this.conns.get(conn.peer) === conn
		if (established) this.conns.delete(conn.peer)
		const code = 'input-abuse'
		this._refuse(conn, REMOVAL_MESSAGES[code], this._generation, code)
		if (established) this.onPeerLeave?.(conn.peer, code)
	}

	_route(conn, message) {
		if (this.conns.get(conn.peer) !== conn) return
		if (!message || typeof message !== 'object' || Array.isArray(message)) return
		if (
			typeof message.t !== 'string' ||
			!message.t ||
			message.t.length > 64 ||
			CONTROL.has(message.t)
		) {
			this._reject(conn)
			return
		}
		const handler = this.handlers.get(message.t)
		if (!handler) this._reject(conn)
		else handler(message.d, conn.peer)
	}

	_send(conn, message) {
		if (!conn.open) return false
		try {
			conn.send(JSON.stringify(message))
			return true
		} catch {
			this._drop(conn)
			return false
		}
	}

	// Application messages never relay guest-to-guest. The session model decides
	// which established peer may send input/state and what the host broadcasts.
	send(type, data) {
		if (!this.active || CONTROL.has(type)) return 0
		let sent = 0
		const recipients = [...this.conns.values()] // callbacks may change the live connections
		for (const conn of recipients) if (this._send(conn, { t: type, d: data })) sent++
		return sent
	}
	sendTo(peerId, type, data) {
		if (!this.active || CONTROL.has(type)) return false
		const conn = this.conns.get(peerId)
		return !!conn && this._send(conn, { t: type, d: data })
	}

	_drop(conn) {
		const established = this.conns.get(conn.peer) === conn
		if (established) this.conns.delete(conn.peer)
		this._close(conn)
		if (!established) return
		if (this.isHost) this.onPeerLeave?.(conn.peer)
		else this._disconnect('The host connection was lost; session ended')
	}
	_disconnect(message, code) {
		this.leave()
		this.onDisconnect?.(message, code)
	}
	_timeout(key, delay, callback) {
		this._clearTimeout(key)
		const generation = this._generation
		const timer = this.timers.setTimeout(() => {
			if (generation !== this._generation || this._timeouts.get(key) !== timer) return
			this._timeouts.delete(key)
			callback()
		}, delay)
		this._timeouts.set(key, timer)
	}
	_clearTimeout(key) {
		if (!this._timeouts.has(key)) return
		this.timers.clearTimeout(this._timeouts.get(key))
		this._timeouts.delete(key)
	}
	_close(conn) {
		this._clearTimeout(conn)
		this._inputs.delete(conn)
		if (this._pending.get(conn.peer) === conn) this._pending.delete(conn.peer)
		this._connections.delete(conn)
		try {
			conn.close()
		} catch {
			/* already closed */
		}
	}

	leave() {
		this._generation++ // invalidate callbacks before any close/destroy can emit events
		this._cancelOperation?.()
		this._cancelOperation = null
		for (const key of this._timeouts.keys()) this._clearTimeout(key)
		const peer = this.peer
		this.peer = null
		this.connected = false
		for (const conn of this._connections) this._close(conn)
		this.conns.clear()
		this._pending.clear()
		try {
			peer?.destroy()
		} catch {
			/* already closed */
		}
		this.id = null
		this.hostId = null
		this.code = null
		this.isHost = false
		this.accepting = true
	}
}
