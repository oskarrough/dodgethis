import { tune } from '../../tune.js'
import encounters from '../../encounters/all-encounters.js'
import { bossBots } from './dungeon-warden-bots.js'
import { distance } from '../../../../core/spatial.js'

// A party of bots walks the map in its encounters' order: a pack that has woken and stands near is
// fought first, then the encounter's own bot goal if its folder has one, else its boss. They dodge
// the Slam of a Warden, and whatever the encounter warns of.
function dungeonObjective(ctx) {
	const { perceived, p, attack, shoot, setState, frame, h } = ctx
	const guard = (perceived.packs ?? [])
		.filter((pack) => pack.provoked)
		.flatMap((pack) => pack.guards)
		.filter((g) => distance(g.pos, p) <= tune.packs.leash)
		.sort((a, b) => distance(a.pos, p) - distance(b.pos, p) || a.id.localeCompare(b.id))[0]
	if (guard) {
		setState('pack')
		attack({ ...guard, radius: tune.waves.radius })
		return frame
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
	setState('boss')
	if (!h.cast && shoot(boss.unit)) return frame
	attack(boss.unit)
	return frame
}

export const dungeonBots = {
	botView(sim, packUnit) {
		const current = sim.dungeon.current()
		return {
			boss: current?.unit ? { phase: current.state.phase, unit: packUnit(current.unit) } : null,
			encounter: current?.botView ? { id: current.id, ...current.botView() } : null,
			packs: sim.packs?.botView() ?? [],
		}
	},
	createBot() {
		const { botPerceive, botThreats } = bossBots.createBot()
		return {
			// Mid-pull there is nowhere to heal (a waystone mends only out of a fight), so a hurt
			// bot fights on rather than drag the boss home.
			botPerceive: (ctx) => ({
				...botPerceive(ctx),
				holdGround: ctx.perceived.boss?.phase === 'engaged',
			}),
			botThreats(ctx) {
				const encounter = ctx.perceived.encounter
				return [
					...botThreats(ctx),
					...(encounter ? (encounters[encounter.id].botThreats?.(ctx, encounter) ?? []) : []),
				]
			},
			botGoals: { objective: dungeonObjective },
		}
	},
}
