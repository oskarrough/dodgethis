import { tune } from '../../tune.js'
import { STEP } from '../../../../core/app.js'

function bossObjective(ctx) {
	const boss = ctx.perceived.boss
	if (!boss || boss.phase === 'ended' || boss.unit.dead) {
		ctx.setState('wait')
		ctx.frame.pressed = [{ action: 'stop' }]
		return ctx.frame
	}
	ctx.setState('boss')
	// Keep the unavoidable Slam target planted; only splash recipients need to leave.
	if (!ctx.h.cast && ctx.shoot(boss.unit)) return ctx.frame
	ctx.attack(boss.unit)
	return ctx.frame
}

export const bossBots = {
	createBot() {
		return {
			botPerceive(ctx) {
				const boss = ctx.perceived.boss?.unit
				if (boss && !boss.dead) ctx.enemies.push(boss)
				// Slam evasion wins over optional skills; objective still supplies basic attacks.
				return { skillsLocked: true }
			},
			botThreats({ perceived, h }) {
				const boss = perceived.boss?.unit
				const cast = boss?.cast
				if (cast?.ability !== 'slam' || cast.targetId === h.id) return []
				return [
					{
						key: `slam:${perceived.tick + cast.left}`,
						centre: { ...cast.target },
						radius: tune.slam.radius,
						delay: cast.left * STEP,
					},
				]
			},
			botGoals: { objective: bossObjective, retreat: bossObjective },
		}
	},
}
