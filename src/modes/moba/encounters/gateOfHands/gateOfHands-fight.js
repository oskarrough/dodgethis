import { STEP } from '../../../../core/app.js'
import { tune } from '../../tune.js'
import { distance } from '../../../../core/spatial.js'

const ticks = (s) => Math.max(1, Math.round(s / STEP))

// The fight's state: each hand's `fill` (0..1) and `litUntil` tick, the Potsherds' next throw and
// the shards in the air. Won the tick all three hands are lit; then the door's posts come away.
export function createGateOfHands({ heroes, spot, systems, removeObstacle }) {
	const g = () => tune.encounters.gateOfHands
	const at = (offset) => ({ x: spot.x + offset.x, z: spot.z + offset.z })
	const hands = g().hands.map((offset, i) => ({ id: i, ...at(offset), fill: 0, litUntil: -1 }))
	const potsherds = g().potsherds.map((offset, i) => ({ id: `potsherd-${i + 1}`, ...at(offset) }))
	const state = { phase: 'idle', open: false, nextThrow: 0, shards: [] }
	let serial = 0
	const lit = (hand, t) => t < hand.litUntil
	const living = () => heroes.filter((h) => !h.dead)
	function lightHands(t, dt) {
		for (const hand of hands) {
			const held = living().some((h) => distance(h.body.position, hand) <= g().radius)
			if (held) {
				hand.fill = Math.min(1, hand.fill + dt / g().fill)
				if (hand.fill >= 1) hand.litUntil = t + ticks(g().linger)
			} else if (!lit(hand, t)) hand.fill = Math.max(0, hand.fill - dt / g().fill)
		}
	}
	function throwShards(t) {
		if (t < state.nextThrow) return
		state.nextThrow = t + ticks(g().every)
		for (const pot of potsherds) {
			const target = living()
				.filter((h) => distance(h.body.position, pot) <= g().reach)
				.sort(
					(a, b) =>
						distance(a.body.position, pot) - distance(b.body.position, pot) ||
						a.id.localeCompare(b.id),
				)[0]
			if (!target) continue
			const p = target.body.position
			state.shards.push({
				id: ++serial,
				from: pot.id,
				x: p.x,
				z: p.z,
				thrown: t,
				lands: t + ticks(g().delay),
			})
		}
	}
	function landShards(t) {
		for (let i = state.shards.length - 1; i >= 0; i--) {
			const shard = state.shards[i]
			if (t < shard.lands) continue
			state.shards.splice(i, 1)
			for (const h of living()) {
				if (distance(h.body.position, shard) > g().splash) continue
				const p = h.body.position
				const d = distance(p, shard) || 1
				systems().hit(
					{
						id: -1,
						owner: shard.from,
						team: 'B',
						slot: 'shard',
						damage: g().damage,
						dx: (p.x - shard.x) / d,
						dz: (p.z - shard.z) / d,
					},
					{ id: h.id, unit: h, hero: true },
					p,
				)
			}
		}
	}
	function step(t, dt) {
		if (state.open) return
		lightHands(t, dt)
		if (state.phase === 'idle' && hands.some((hand) => lit(hand, t))) state.phase = 'awake'
		if (state.phase === 'awake') throwShards(t)
		landShards(t)
		if (hands.every((hand) => lit(hand, t))) {
			state.open = true
			state.phase = 'ended'
			state.shards.length = 0
			tune.encounters.gateOfHands.door.posts.forEach((_, i) =>
				removeObstacle(`gateOfHands-door-${i + 1}`),
			)
		}
	}
	return {
		spot,
		state,
		hands,
		potsherds,
		units: [],
		step,
		won: () => state.open,
		// What bots see: each hand's place and light, and the shards on their way down.
		botView: () => ({
			hands: hands.map((hand) => ({
				x: hand.x,
				z: hand.z,
				fill: hand.fill,
				litUntil: hand.litUntil,
			})),
			shards: state.shards.map((s) => ({ id: s.id, x: s.x, z: s.z, lands: s.lands })),
		}),
	}
}
