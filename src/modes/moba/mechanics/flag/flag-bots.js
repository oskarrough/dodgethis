import { STEP } from '../../../../core/app.js'

const ticks = (s) => Math.max(1, Math.round(s / STEP))
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

// Bots and the centre flag: the team's nearest few walk to the ring when it's up, stand in it and
// shoot whoever contests it. Everyone else keeps their lane.
export const flagBots = {
	botView(sim) {
		const s = sim.flag.state
		return {
			flag: {
				phase: s.phase,
				x: s.x,
				z: s.z,
				nextHoist: s.nextHoist,
				owner: s.owner,
				progress: s.progress,
				radius: sim.flag.radius(),
			},
		}
	},
	createBot() {
		return {
			botPerceive({ perceived, team }) {
				const flag = perceived.flag
				if (flag?.phase !== 'up') return {}
				return {
					preferredTargets: perceived.heroes.filter(
						(u) => !u.dead && u.team !== team && distance(u.pos, flag) <= flag.radius + 1,
					),
				}
			},
			botGoals: {
				objective(ctx) {
					const { h, p, own, now, side, b, target, move, frame, setState } = ctx
					const flag = ctx.perceived.flag
					if (!flag || h.hp <= h.maxHp * b.flagHp) return null
					const preparing = flag.phase === 'rising' && flag.nextHoist - now <= ticks(b.flagPrepare)
					if (!preparing && flag.phase !== 'up') return null
					const goers = [{ id: h.id, pos: p }, ...own.filter((u) => u.id !== h.id)]
						.sort((a, c) => distance(a.pos, flag) - distance(c.pos, flag))
						.slice(0, b.flagGo)
					if (!goers.some((u) => u.id === h.id)) return null
					// In the ring with someone to shoot: let the fight run.
					const inside = distance(p, flag) <= flag.radius * 0.7
					if (inside && target && distance(target.pos, p) <= b.fightRange) return null
					setState('flag')
					if (!inside) move({ x: flag.x + side * flag.radius * 0.3, z: flag.z })
					return frame
				},
			},
		}
	},
}
