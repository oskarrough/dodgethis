import { dressHero } from '../../hero-view.js'
import { tune } from '../../tune.js'

// Temporary Warden costume, distinct windups without another hero in the draft.
export function dressBoss(body) {
	const dispose = dressHero(body, 'brew', 'B')
	const pose = body.poseAbility
	const costume = body.mesh.getObjectByName('moba-cast-pose')
	body.mesh.name = 'moba-warden'
	body.poseAbility = (cast, alpha, unit, tick) => {
		pose(cast, alpha, unit, tick)
		const progress = cast ? Math.max(0, Math.min(1, 1 - (cast.left - alpha) / cast.total)) : 0
		const p = tune.boss.pose
		if (cast?.ability === 'swing') {
			costume.rotation.y = -p.swingTurn * progress
			costume.rotation.z = p.swingLean * progress
		}
		if (cast?.ability === 'slam') {
			costume.rotation.x = -p.slamLean * progress
			costume.position.y = p.slamLift * progress
		} else costume.position.y = 0
	}
	return dispose
}
