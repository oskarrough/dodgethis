import { tune } from '../../tune.js'
import { STEP } from '../../../../core/app.js'

// Fight a foe with the whole kit, as a lane bot would: its casts, shots and dashes first, and
// only when the fight has nothing to do (the foe is out of reach, or the odds are poor) a plain
// walk-up attack. `state` names what the bot reports itself doing.
export function strike(ctx, foe, state) {
	if (ctx.fight(ctx)) {
		ctx.setState(state)
		return ctx.frame
	}
	ctx.setState(state)
	ctx.attack(foe)
	return ctx.frame
}

function bossObjective(ctx) {
	const boss = ctx.perceived.boss
	if (!boss || boss.phase === 'ended' || boss.unit.dead) {
		ctx.setState('wait')
		ctx.frame.pressed = [{ action: 'stop' }]
		return ctx.frame
	}
	// The unavoidable Slam target stays planted; only splash recipients need to leave.
	return strike(ctx, boss.unit, 'boss')
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
