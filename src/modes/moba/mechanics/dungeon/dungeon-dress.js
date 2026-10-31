import { dressHero } from '../../hero-view.js'
import { wardenFigure } from './dungeon-figures.js'
import { tune } from '../../tune.js'

// Keep the shared body, foot disc and hit response; each Warden wears its own sculpted body.
export function dressBoss(body) {
	const dispose = dressHero(body, 'oolong', 'B')
	const pose = body.poseAbility
	const costume = body.mesh.getObjectByName('moba-cast-pose')
	let figure = null
	body.mesh.name = 'moba-warden'
	body.poseAbility = (cast, alpha, unit, tick) => {
		pose(cast, alpha, unit, tick)
		if (unit && !figure) {
			for (const child of costume.children) child.visible = false
			figure = wardenFigure(unit.id)
			figure.root.position.y = -body.radius - body.halfHeight
			costume.add(figure.root)
		}
		costume.scale.set(1, 1, 1)
		const progress = cast ? Math.max(0, Math.min(1, 1 - (cast.left - alpha) / cast.total)) : 0
		const p = tune.warden.pose
		if (cast?.ability === 'swing') {
			costume.rotation.y = -p.swingTurn * progress
			costume.rotation.z = p.swingLean * progress
		}
		if (cast?.ability === 'slam') {
			costume.rotation.x = -p.slamLean * progress
			costume.position.y = p.slamLift * progress
		} else costume.position.y = 0
	}
	return () => {
		figure?.dispose()
		dispose()
	}
}
