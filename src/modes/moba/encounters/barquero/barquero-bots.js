import { tune } from '../../tune.js'
import { distance } from '../../../../core/spatial.js'

// One bot pushes (the first by id) and stands just ahead of Tara on the road; the others fight
// the bardino nearest Tara. A bot alone pushes until a bardino is on it, fights, then pushes again.
export function barqueroBotGoal(ctx, view) {
	const { perceived, h, p, move, attack, setState, frame } = ctx
	const party = perceived.heroes
		.filter((u) => u.team === h.team && !u.dead)
		.map((u) => u.id)
		.sort()
	const near = (pos) =>
		[...view.bardinos].sort(
			(a, b) => distance(a.pos, pos) - distance(b.pos, pos) || a.id.localeCompare(b.id),
		)[0]
	const pusher = party[0] === h.id
	const onMe = near(p)
	const close = onMe && distance(onMe.pos, p) <= tune.encounters.barquero.ring
	if (!pusher || (party.length === 1 && close)) {
		const bardino = party.length === 1 ? onMe : near(view.idol)
		if (bardino) {
			setState('bardinos')
			attack({ ...bardino, radius: tune.waves.radius })
			return frame
		}
	}
	setState('push')
	// Stand on the road a step ahead of Tara, inside its ring.
	const d = distance(view.idol, view.ahead) || 1
	const step = Math.min(d, tune.encounters.barquero.ring * 0.5)
	const spot = {
		x: view.idol.x + ((view.ahead.x - view.idol.x) / d) * step,
		z: view.idol.z + ((view.ahead.z - view.idol.z) / d) * step,
	}
	if (distance(p, spot) > 0.4) move(spot)
	else frame.pressed = [{ action: 'stop' }]
	return frame
}
