import { STEP } from '../../../../core/app.js'
import { tune } from '../../tune.js'
import { distance } from '../../../../core/spatial.js'

// Bots share the hands out by id: with three or more alive each takes its own; fewer run to the
// hand whose light runs out first. On the hand they stand, unless a shard is coming down there.
export function handsBotGoal(ctx, view) {
	const { perceived, h, p, move, setState, frame } = ctx
	const g = tune.encounters.manos
	const party = perceived.heroes
		.filter((u) => u.team === h.team && !u.dead)
		.map((u) => u.id)
		.sort()
	const hands = view.hands
	const left = (hand) => Math.max(0, hand.litUntil - perceived.tick)
	const hand =
		party.length >= hands.length
			? hands[party.indexOf(h.id) % hands.length]
			: [...hands].sort((a, b) => left(a) - left(b) || distance(a, p) - distance(b, p))[0]
	setState('hands')
	if (distance(p, hand) > g.radius * 0.5) move({ x: hand.x, z: hand.z })
	else frame.pressed = [{ action: 'stop' }]
	return frame
}

export function handsBotThreats({ perceived }, view) {
	const g = tune.encounters.manos
	return view.shards.map((shard) => ({
		key: `shard:${shard.id}`,
		centre: { x: shard.x, z: shard.z },
		radius: g.splash,
		delay: Math.max(0, shard.lands - perceived.tick) * STEP,
	}))
}
