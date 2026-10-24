import { tune } from '../../tune.js'
import { bossBots } from '../boss/boss-bots.js'

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

// A party of bots walks the map in its bosses' order: a pack that has woken and stands near is
// fought first, else the next boss. They dodge the Slam as in the Warden's room.
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
		return {
			boss: { phase: sim.boss.state.phase, unit: packUnit(sim.boss.unit) },
			packs: sim.packs?.botView() ?? [],
		}
	},
	createBot() {
		const { botPerceive, botThreats } = bossBots.createBot()
		return {
			botPerceive,
			botThreats,
			botGoals: { objective: dungeonObjective },
		}
	},
}
