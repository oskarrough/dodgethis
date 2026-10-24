import { tune } from '../../tune.js'
import { distance } from '../../../../core/spatial.js'

// Bots fight Fornax as they fight any Warden, but a bot that holds `retreat` stacks of Heat walks
// back into the shade and stays there, shooting if it can, until it has cooled.
export function fornaxBotGoal(ctx, view) {
	const { perceived, h, p, move, attack, shoot, setState, frame } = ctx
	const boss = perceived.boss
	if (!boss || boss.unit.dead) return null
	const { shade } = view
	const heat = view.heat[h.id] ?? 0
	const inside = distance(p, shade) <= shade.radius * 0.6
	if (
		view.phase === 'engaged' &&
		(heat >= tune.encounters.fornax.retreat || (heat > 0 && inside))
	) {
		setState('shade')
		if (!inside) move({ x: shade.x, z: shade.z })
		else if (h.cast || !shoot(boss.unit)) frame.pressed = [{ action: 'stop' }]
		return frame
	}
	setState('boss')
	if (!h.cast && shoot(boss.unit)) return frame
	attack(boss.unit)
	return frame
}
