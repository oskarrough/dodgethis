import { neutralFrame, readIntent } from '../../core/intents.js'
import { tune } from './tune.js'

export const INPUT_TIMEOUT = 0.5
export const HOST_TIMEOUT = 10
// A guest whose tab died sends nothing; after this long its seat goes back to the room.
const SEAT_TIMEOUT = 10
const SEND_INTERVAL = 1 / 20
// Protocol ceiling, captured once so a live tune edit cannot exceed the receiver's limit.
const MAX_FACTS = tune.link.maxFacts
const MIN_GAP = 0.014 // a changed frame waits this long after the last send: every frame at 60 Hz, every third at 144
const safeInt = (n) => Number.isSafeInteger(n) && n >= 0

// One match's wire (docs/plugin-architecture.md, line 9). The host seats every remote human's intent frames and sends
// `{ matchId, epoch, seq, state, facts }` at 20 Hz; a guest sends its own frames and applies envelopes. It calls only the
// mode's contract (`epoch snapshot apply validFact`) and the core's intents, and never knows which game it carries.
export function createLink({
	net,
	matchId,
	roster,
	contract,
	intents,
	present,
	onLost = () => {},
	onSilent = () => {},
	now = () => performance.now() / 1000,
	// The local participant, and each remote human's peer and seat. A late joiner may take a bot's seat id.
	local = net.id,
	peers = roster
		.filter((p) => p.controller === 'human' && p.id !== local)
		.map((p) => ({ peerId: p.id, id: p.id })),
}) {
	const host = net.isHost
	const sizes = []
	let sampleIndex = 0
	const encoder = new TextEncoder()
	const envelopeBytes = (envelope) =>
		encoder.encode(JSON.stringify({ t: 'state', d: envelope })).length
	const measure = (bytes) => {
		stats.bytes += bytes
		sizes[sampleIndex] = bytes
		sampleIndex = (sampleIndex + 1) % tune.link.samples
	}
	const stats = {
		sent: 0,
		bytes: 0,
		received: 0,
		intents: 0,
		rejected: 0,
		rejectionReason: null,
		skipped: 0,
		get envelopeP95() {
			const sorted = sizes.toSorted((a, b) => a - b)
			return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0
		},
		get envelopeSamples() {
			return sizes.length
		},
	}
	// Host: remote humans by peer id, each feeding its participant's seat.
	const seats = new Map()
	const addSeat = (peerId, id) =>
		seats.set(peerId, { id, seq: -1, seen: now(), silent: false, fact: factId })
	let factId = 0
	if (host) for (const peer of peers) addSeat(peer.peerId, peer.id)
	let seq = 0
	let facts = []
	let sendClock = 0
	let lastSeq = -1
	let lastEpoch = -1
	let lastFact = 0
	let heard = now()
	let intentSeq = 0
	let lastSent = -Infinity
	let lastKey = ''
	let disposed = false
	let activeContract = null
	const currentContract = () => {
		const current = typeof contract === 'function' ? contract() : contract
		if (current !== activeContract) {
			// Facts belong to a run's tick clock; never carry lobby cues into its replacement.
			facts = []
			for (const seat of seats.values()) seat.fact = factId
			activeContract = current
		}
		return current
	}

	function receiveIntent(message, from) {
		const seat = seats.get(from)
		const reject = () => {
			net.reject?.(from)
			return false
		}
		if (!seat || !message || message.matchId !== matchId || !safeInt(message.seq)) return reject()
		if (message.seq <= seat.seq) return reject()
		const frame = readIntent(message.frame)
		if (!frame) return reject()
		const time = now()
		seat.seq = message.seq
		seat.seen = time
		seat.silent = false
		stats.intents++
		intents.feed(seat.id, frame)
		return true
	}

	function validEnvelope(envelope, current) {
		if (
			!envelope ||
			envelope.matchId !== matchId ||
			!safeInt(envelope.seq) ||
			envelope.seq <= lastSeq ||
			!safeInt(envelope.epoch) ||
			envelope.epoch < lastEpoch
		)
			return false
		if (!Array.isArray(envelope.facts) || envelope.facts.length > MAX_FACTS) return false
		return envelope.facts.every(
			(entry) => entry && safeInt(entry.id) && current.validFact(entry.fact),
		)
	}

	function receiveState(envelope, from) {
		const current = currentContract()
		if (!current || from !== net.hostId || !validEnvelope(envelope, current)) return false
		const time = now()
		heard = time // A rejected state is still a live host, not a transport timeout.
		stats.received++
		measure(envelopeBytes(envelope))
		lastSeq = envelope.seq
		lastEpoch = envelope.epoch
		const accepted = current.apply(envelope.state, time) !== false
		if (!accepted) {
			stats.rejected++
			stats.rejectionReason = 'Snapshot rejected by mode'
		}
		// Valid facts survive a rejected snapshot; their ids still deduplicate retries.
		for (const { id, fact } of envelope.facts) {
			if (id <= lastFact) continue
			lastFact = id
			present(fact)
		}
		return accepted
	}

	function broadcast() {
		const current = currentContract()
		if (!current) return
		const envelope = {
			matchId,
			epoch: current.epoch,
			seq: ++seq,
			state: current.snapshot(),
			facts: [],
		}
		// Minimal transports may only broadcast; real peers each have an independent fact cursor.
		if (!net.sendTo) {
			envelope.facts = facts.splice(0, MAX_FACTS)
			stats.sent++
			measure(envelopeBytes(envelope))
			net.send('state', envelope)
			return
		}
		for (const [id, seat] of seats) {
			const conn = net.conns.get(id)
			if (!conn) {
				seats.delete(id)
				continue
			}
			envelope.facts = facts.filter((entry) => entry.id > seat.fact).slice(0, MAX_FACTS)
			const bytes = envelopeBytes(envelope)
			if ((conn.dataChannel?.bufferedAmount ?? 0) > bytes * tune.link.queuedEnvelopes) {
				stats.skipped++
				continue
			}
			if (!net.sendTo(id, 'state', envelope)) continue
			seat.fact = envelope.facts.at(-1)?.id ?? seat.fact
			stats.sent++
			measure(bytes)
		}
		const delivered = Math.min(factId, ...Array.from(seats.values(), (seat) => seat.fact))
		facts = facts.filter((entry) => entry.id > delivered)
	}

	// The local frame, taken whole each frame: edges go at once, an unchanged frame at most every tenth of a second.
	function sendIntent() {
		const frame = intents.drain(local)
		const time = now()
		const key = JSON.stringify(frame)
		const edges = !!frame.order || frame.pressed.length > 0 || frame.released.length > 0
		if (!edges && (key === lastKey ? time - lastSent < 0.1 : time - lastSent < MIN_GAP)) return
		lastSent = time
		lastKey = key
		net.send('intent', { matchId, seq: ++intentSeq, frame })
	}

	return {
		stats,
		receive(type, data, from) {
			if (disposed) return false
			if (host) return type === 'intent' && receiveIntent(data, from)
			return type === 'state' && receiveState(data, from)
		},
		// Host: every gameplay fact the mode presents rides the next envelope.
		record(fact) {
			if (!disposed && host && currentContract())
				facts.push({ id: ++factId, fact: structuredClone(fact) })
		},
		update(dt) {
			if (disposed) return
			if (!host) {
				sendIntent()
				if (now() - heard > HOST_TIMEOUT) {
					disposed = true
					onLost('The host stopped responding. Session ended.')
				}
				return
			}
			// A silent seat stands still and drops its charge, once; a long-silent peer is let go.
			for (const [peerId, seat] of seats) {
				if (!seat.silent && now() - seat.seen > INPUT_TIMEOUT) {
					seat.silent = true
					intents.feed(seat.id, { ...neutralFrame(), pressed: [{ action: 'cancel', at: null }] })
				}
				if (now() - seat.seen > SEAT_TIMEOUT) {
					seats.delete(peerId)
					onSilent(peerId)
				}
			}
			sendClock += dt
			if (sendClock >= SEND_INTERVAL) {
				sendClock %= SEND_INTERVAL
				broadcast()
			}
		},
		broadcast,
		// Guest: a hidden tab draws no frames, but its throttled timers still say it is here.
		keepalive() {
			if (!host && !disposed && now() - lastSent >= 1) sendIntent()
		},
		// Host: a peer whose frames stopped arriving.
		silent: (peerId) => seats.get(peerId)?.silent ?? true,
		// Host: a peer seated mid-run starts from the next fact.
		seat(peerId, id) {
			if (host && !disposed) addSeat(peerId, id)
		},
		dispose() {
			disposed = true
			seats.clear()
			facts = []
		},
	}
}
