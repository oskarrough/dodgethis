import { tune } from '../../tune.js'

// The bot Espejo hates holds it and strikes on; the others walk round to its back, `behind` m
// opposite its face, and strike from there. While it polishes, everyone strikes where they stand.
export function espejoBotGoal(ctx, view) {
	const { perceived, h, p, move, attack, shoot, setState, frame } = ctx
	const boss = perceived.boss
	if (!boss || boss.unit.dead) return null
	const q = boss.unit.pos
	if (!view.polishing && view.target && view.target !== h.id) {
		const back = {
			x: q.x - Math.sin(view.facing) * tune.encounters.espejo.behind,
			z: q.z - Math.cos(view.facing) * tune.encounters.espejo.behind,
		}
		if (Math.hypot(p.x - back.x, p.z - back.z) > 1) {
			setState('behind')
			move(back)
			return frame
		}
	}
	setState('boss')
	if (!h.cast && shoot(boss.unit)) return frame
	attack(boss.unit)
	return frame
}
