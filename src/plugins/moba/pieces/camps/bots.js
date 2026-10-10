import { STEP } from '../../../../core/app.js'
import { tune } from '../../tune.js'

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const hash = (id) => [...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)

// A bot with a quiet lane sometimes steps into the jungle and clears the nearest camp.
// It slots into the `escort` phase: after combat, before siege and the lane advance.
export const campBots = {
	botView(sim) {
		return { camps: sim.camps?.botView() ?? [] }
	},
	createBot() {
		return {
			botGoals: {
				escort(ctx) {
					const { perceived, p, h, b, near, enemies, attack, setState, frame } = ctx
					const c = tune.camps.bots
					if (h.hp < h.maxHp * c.hp || near(enemies, p, b.rotateQuiet).length) return null
					const camp = (perceived.camps ?? [])
						.filter((camp) => camp.guards.length && distance(camp.pos, p) <= c.reach)
						.sort((a, d) => distance(a.pos, p) - distance(d.pos, p) || a.id.localeCompare(d.id))[0]
					if (!camp) return null
					// Some windows a bot goes; a started camp is always finished.
					const window = Math.floor((perceived.tick * STEP) / c.period) + hash(h.id)
					if (!camp.provoked && window % c.every !== 0) return null
					const guard = [...camp.guards].sort((a, d) => a.hp - d.hp || a.id.localeCompare(d.id))[0]
					setState('camp')
					attack({ ...guard, radius: tune.waves.radius })
					return frame
				},
			},
		}
	},
}
