// `bun run online:check`: host and guest sims on the existing shared-match harness, snapshots
// through JSON, rejected snapshots and dropped facts counted. Exits non-zero if they disagree.
import RAPIER from '@dimforge/rapier3d-compat'
import { createSharedMatch, frame } from '../tests/shared-match.js'

const SECONDS = 3

await RAPIER.init({})
const match = createSharedMatch()
const { host, guest } = match

function throughJson(peer) {
	const send = peer.net.send.bind(peer.net)
	peer.net.send = (type, data) => send(type, JSON.parse(JSON.stringify(data)))
}
throughJson(host)
throughJson(guest)

try {
	const ticks = Math.round(SECONDS * 60)
	for (let i = 0; i < ticks; i++) {
		const pressed = i === 30 ? ['jump'] : []
		match.tick({
			host: frame({ move: { x: 0.4, z: 0 } }),
			guest: frame({ move: { x: -0.4, z: 0 }, pressed }),
		})
	}
	host.link.broadcast()
	match.deliver()
	guest.flow.round?.lateUpdate(match.now())

	const rejected = guest.link.stats.rejected
	const dropped = guest.link.stats.dropped + host.link.stats.dropped
	const received = guest.link.stats.received
	console.log(`rejected ${rejected}  dropped ${dropped}  received ${received}`)

	const fail = (reason) => {
		console.error(reason)
		process.exitCode = 1
	}
	if (received < 1) fail('The guest received no snapshots.')
	if (rejected) fail(`${rejected} snapshot(s) rejected.`)
	if (dropped) fail(`${dropped} fact(s) dropped.`)

	const hostUnits = host.flow.round?.units ?? []
	const guestUnits = guest.flow.round?.units ?? []
	const id = (unit) => `${unit.participantId}:${unit.id}:${unit.alive ? 'alive' : 'out'}`
	if (host.flow.phase !== guest.flow.phase)
		fail(`Phase disagrees: host ${host.flow.phase}, guest ${guest.flow.phase}.`)
	if (JSON.stringify(host.flow.match.wins) !== JSON.stringify(guest.flow.match.wins))
		fail(
			`Wins disagree: host ${JSON.stringify(host.flow.match.wins)}, guest ${JSON.stringify(guest.flow.match.wins)}.`,
		)
	if (hostUnits.map(id).join() !== guestUnits.map(id).join())
		fail(
			`Roster disagrees: host ${hostUnits.map(id).join(', ')} / guest ${guestUnits.map(id).join(', ')}.`,
		)
	if (!host.facts.length) fail('No facts crossed the wire.')
	if (host.facts.length !== guest.facts.length)
		fail(`Facts disagree: host ${host.facts.length}, guest ${guest.facts.length}.`)
} finally {
	match.dispose()
}
