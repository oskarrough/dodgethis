import { tune } from '../../tune.js'
import encounters from '../../encounters/all-encounters.js'
import { bossBots, strike } from './dungeon-warden-bots.js'
import { distance } from '../../../../core/spatial.js'

// A party of bots walks the map in its encounters' order: a pack that has woken and stands near is
// fought first, then the encounter's own bot goal if its folder has one, else its boss. They dodge
// the Slam of a Warden, and whatever the encounter warns of.
function dungeonObjective(ctx) {
	const { perceived, p, setState, frame } = ctx
	const guard = (perceived.packs ?? [])
		.filter((pack) => pack.provoked)
		.flatMap((pack) => pack.guards)
		.filter((g) => distance(g.pos, p) <= tune.packs.leash)
		.sort((a, b) => distance(a.pos, p) - distance(b.pos, p) || a.id.localeCompare(b.id))[0]
	if (guard) {
		return strike(ctx, { ...guard, radius: tune.waves.radius }, 'pack')
	}
	// An encounter that only warns (no `botGoal`) is fought as its boss.
	const encounter = perceived.encounter
	const botGoal = encounter && encounters[encounter.id].botGoal
	if (botGoal) return botGoal(ctx, encounter)
	const boss = perceived.boss
	if (!boss || boss.unit.dead) {
		setState('wait')
		frame.pressed = [{ action: 'stop' }]
		return frame
	}
	return strike(ctx, boss.unit, 'boss')
}

// Guards a bot is fighting: those of a woken pack within the pack's leash.
const awakeGuards = ({ perceived, p }) =>
	(perceived.packs ?? [])
		.filter((pack) => pack.provoked)
		.flatMap((pack) => pack.guards)
		.filter((g) => distance(g.pos, p) <= tune.packs.leash)

export const dungeonBots = {
	botView(sim, packUnit) {
		const current = sim.dungeon.current()
		return {
			boss: current?.unit ? { phase: current.state.phase, unit: packUnit(current.unit) } : null,
			encounter: current?.botView ? { id: current.id, ...current.botView() } : null,
			// A guard is seen as any unit is, so the lane's fight can aim, lead and cast at it.
			packs: (sim.packs?.botView() ?? []).map((pack) => ({
				...pack,
				guards: pack.guards.map((g) => {
					const live = sim.find(g.id)
					return live ? { ...packUnit(live), pos: g.pos } : g
				}),
			})),
		}
	},
	createBot() {
		const { botThreats } = bossBots.createBot()
		const threatsOf = (ctx) => {
			const encounter = ctx.perceived.encounter
			return [
				...botThreats(ctx),
				...(encounter ? (encounters[encounter.id].botThreats?.(ctx, encounter) ?? []) : []),
			]
		}
		return {
			// Mid-pull there is nowhere to heal (a waystone mends only out of a fight), so a hurt
			// bot fights on rather than drag the boss home. Out of a pull, a bot that is whole never
			// balks at a boss for its size: only a hurt one goes back to mend.
			botPerceive(ctx) {
				const { h, p, b, perceived } = ctx
				const boss = perceived.boss
				const guards = awakeGuards(ctx)
				// A Warden counts as a foe only once pulled: an idle one is a place to walk to, and
				// weighing its size as a danger sent a lone bot back and forth across the pull line.
				if (boss && boss.phase === 'engaged' && !boss.unit.dead) ctx.enemies.push(boss.unit)
				ctx.enemies.push(...guards)
				// The kit is the bot's own to cast, except while it stands in a warned ring: there
				// stepping out comes first, as it always did.
				const rings = threatsOf(ctx).filter((t) => t.centre)
				const reach = (t) => t.radius + h.body.radius + b.zoneClearance
				return {
					skillsLocked: rings.some((t) => distance(p, t.centre) <= reach(t) * 1.5),
					// No landing, cast or step to be taken inside a warned ring.
					guardOk: [(at) => rings.every((t) => distance(at, t.centre) > reach(t))],
					// Mid-pull there is nowhere to heal (a waystone mends only out of a fight), so a
					// hurt bot fights on rather than drag the boss or a pack home. Only a bot nearly
					// down, or one out of any fight and hurt, goes back to mend.
					holdGround:
						boss?.phase === 'engaged' ||
						h.hp >= h.maxHp * b.recoverHp ||
						(guards.length > 0 && h.hp >= h.maxHp * b.retreatHp),
				}
			},
			botThreats: threatsOf,
			botGoals: { objective: dungeonObjective },
		}
	},
}
