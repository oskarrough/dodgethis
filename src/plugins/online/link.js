import { neutralFrame, readIntent } from '../../core/intents.js'

export const INPUT_TIMEOUT = 0.5
export const HOST_TIMEOUT = 10
export const SEND_INTERVAL = 1 / 20
const MAX_FACTS = 256
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
	now = () => performance.now() / 1000,
}) {
	const host = net.isHost
	const local = net.id
	const stats = { sent: 0, bytes: 0, received: 0, intents: 0 }
	// Host: remote humans by peer id, which online makes their participant id.
	const seats = new Map(
		host
			? roster
					.filter((p) => p.controller === 'human' && p.id !== local)
					.map((p) => [p.id, { seq: -1, seen: now(), silent: false }])
			: [],
	)
	let seq = 0
	let factId = 0
	let facts = []
	let sendClock = 0
	// Guest
	let lastSeq = -1
	let lastEpoch = -1
	let lastFact = 0
	let heard = now()
	let intentSeq = 0
	let lastSent = -Infinity
	let lastKey = ''
	let disposed = false

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
		intents.feed(from, frame)
		return true
	}

	function validEnvelope(envelope) {
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
			(entry) => entry && safeInt(entry.id) && contract.validFact(entry.fact),
		)
	}

	function receiveState(envelope, from) {
		if (from !== net.hostId || !validEnvelope(envelope)) return false
		if (contract.apply(envelope.state, now()) === false) return false
		stats.received++
		lastSeq = envelope.seq
		lastEpoch = envelope.epoch
		heard = now()
		// Facts land after the state they belong to, each once however often it is resent.
		for (const { id, fact } of envelope.facts) {
			if (id <= lastFact) continue
			lastFact = id
			present(fact)
		}
		return true
	}

	function broadcast() {
		const envelope = {
			matchId,
			epoch: contract.epoch,
			seq: ++seq,
			state: contract.snapshot(),
			facts,
		}
		facts = []
		stats.sent++
		stats.bytes += JSON.stringify(envelope).length
		net.send('state', envelope)
	}

	// The local frame, taken whole each frame: edges go at once, an unchanged frame at most every tenth of a second.
	function sendIntent() {
		const frame = intents.drain(local)
		const time = now()
		const key = JSON.stringify(frame)
		const edges = frame.pressed.length > 0 || frame.released.length > 0
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
			if (!disposed && host) facts.push({ id: ++factId, fact: structuredClone(fact) })
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
			// A silent seat stands still and drops its charge, once.
			for (const [id, seat] of seats)
				if (!seat.silent && now() - seat.seen > INPUT_TIMEOUT) {
					seat.silent = true
					intents.feed(id, { ...neutralFrame(), pressed: [{ action: 'cancel', at: null }] })
				}
			sendClock += dt
			if (sendClock >= SEND_INTERVAL) {
				sendClock %= SEND_INTERVAL
				broadcast()
			}
		},
		broadcast,
		dispose() {
			disposed = true
			seats.clear()
			facts = []
		},
	}
}
