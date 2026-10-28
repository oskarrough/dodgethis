import * as THREE from 'three'
import { STEP } from '../../../../core/app.js'
import { tune } from '../../tune.js'
import { look } from '../../look.js'
import { poseWindup, poseStrike } from '../../pose-curve.js'

const armUp = new THREE.Vector3(0, 1, 0)
const armDirection = new THREE.Vector3()
const stringEnd = new THREE.Vector3()

// The inherited basic has no cast pose: read its replicated attack phases explicitly.
export function animate(
	unit,
	rig,
	{ pose, progress, fire, settle, releasing, releasePose, costume, time, alpha },
) {
	const v = tune.loose.view
	const r = tune.rain.view
	const dash = tune.vault.view
	const a = look.abilityView
	const basic = unit?.attack
	const drawingBasic = basic?.phase === 'windup'
	const drawing = pose === 'draw' || drawingBasic
	const p = drawingBasic
		? Math.max(
				0,
				Math.min(
					1,
					1 -
						(basic.left - alpha) / Math.max(1, basic.total ?? unit.definition.basic.windup / STEP),
				),
			)
		: progress
	const tension = drawing ? poseWindup(p) : 0
	const basicStrike =
		basic?.phase === 'backswing'
			? poseStrike(
					Math.min(1, ((time - basic.startedTick) * STEP) / a.drawSnap),
					Math.max(0, (basic.left - alpha) / Math.max(1, unit.definition.basic.backswing / STEP)),
				)
			: 0
	const strike = basicStrike || (releasing && releasePose === 'draw' ? poseStrike(fire, settle) : 0)
	const strength = drawingBasic || basicStrike ? v.scale : 1
	const rainAge = (time - (unit?.abilityState?.rain?.released ?? -Infinity)) * STEP
	const rainDraw = pose === 'rain' ? poseWindup(progress) : 0
	const rainRelease =
		!unit?.cast && !basic && !unit?.order && !unit?.body.dashing && rainAge >= 0 && rainAge < r.life
			? (1 - rainAge / r.life) ** 2
			: 0
	const lift = rainDraw || rainRelease
	const pull = strength * tension + lift

	costume.position.y = rig.restY
	costume.scale.set(1, 1, 1)
	costume.rotation.set(
		-v.lean * tension * strength + v.lean * strike - r.tilt * lift,
		-v.tilt * tension * strength,
		-v.tilt * tension * strength,
	)
	rig.bow.position.set(a.bowX, a.bowY + r.height * lift, a.bowZ)
	rig.bow.rotation.set(-((r.angle * Math.PI) / 180) * lift, a.drawTurn * pull, 0)
	rig.bow.scale.z = 1 + a.bowFlex * pull
	rig.hand.position.set(
		a.handX,
		a.handY + r.height * lift,
		a.bowZ + v.reach * pull - v.spacing * strike,
	)
	if (!drawing && !strike && !lift) rig.hand.position.z = rig.quiverZ

	// Keep the hand, drawn shaft and string on the same tension point.
	const drawn = costume.getObjectByName('moba-drawn-arrow')
	if (drawn) {
		drawn.visible = drawing || pose === 'rain'
		drawn.position.set(
			rig.hand.position.x,
			rig.hand.position.y,
			rig.hand.position.z - rig.arrowHeight / 2,
		)
		drawn.rotation.x = -((r.angle * Math.PI) / 180) * lift
	}
	armDirection.set(
		rig.hand.position.x - a.handX,
		rig.hand.position.y - a.handY,
		rig.hand.position.z,
	)
	rig.drawArm.position.set(
		(a.handX + rig.hand.position.x) / 2,
		(a.handY + rig.hand.position.y) / 2,
		rig.hand.position.z / 2,
	)
	rig.drawArm.scale.y = armDirection.length()
	if (rig.drawArm.scale.y > 0)
		rig.drawArm.quaternion.setFromUnitVectors(armUp, armDirection.normalize())
	const string = rig.bowString.geometry.attributes.position
	const width = a.bowRadius / 4
	for (let leg = 0; leg < 2; leg++) {
		const end = stringEnd
			.set(0, ((leg ? 1 : -1) * a.bowHeight) / 2, 0)
			.applyEuler(rig.bow.rotation)
			.add(rig.bow.position)
		const middle = drawing || strike || lift ? rig.hand.position : rig.bow.position
		const i = leg * 6
		string.setXYZ(i, end.x - width, end.y, end.z)
		string.setXYZ(i + 1, end.x + width, end.y, end.z)
		string.setXYZ(i + 2, middle.x - width, middle.y, middle.z)
		string.setXYZ(i + 3, end.x + width, end.y, end.z)
		string.setXYZ(i + 4, middle.x + width, middle.y, middle.z)
		string.setXYZ(i + 5, middle.x - width, middle.y, middle.z)
	}
	string.needsUpdate = true

	if (unit?.dashAbility === 'vault' && unit.body.dashing) {
		const phase = Math.max(
			0,
			Math.min(1, 1 - (unit.body.dashTime - alpha * STEP) / tune.vault.time),
		)
		const arc = Math.sin(Math.PI * phase)
		costume.position.y += dash.height * arc
		costume.rotation.x = dash.tilt * arc
		costume.scale.set(1 + dash.squash * arc, 1 - dash.squash * arc, 1)
		if (drawn) drawn.visible = false
	} else {
		const age = (time - (unit?.abilityState?.vault?.landed ?? -Infinity)) * STEP
		if (age >= 0 && age < dash.settleTime) {
			const press = (1 - age / dash.settleTime) ** 2
			costume.scale.set(1 + dash.squash * press, 1 - dash.squash * press, 1)
			costume.rotation.x += dash.lean * press
		}
	}
}
