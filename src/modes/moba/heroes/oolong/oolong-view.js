import * as THREE from 'three'
import { tune } from '../../tune.js'
import { STEP } from '../../../../core/app.js'
import { makeStyleMaterial } from '../../../../core/stylepass.js'
import { poseWindup, poseStrike } from '../../pose-curve.js'

export function dress({ torso, part, detail, face, own, discY, materials }) {
	const v = tune.heroes.oolong.view
	torso.geometry = own(new THREE.CylinderGeometry(v.width, v.width, v.height, 6))
	face(0.86, discY + 0.88, -0.4)
	const hem = new THREE.CylinderGeometry(v.width, v.width, 0.12, 6).translate(0, discY + 0.09, 0)
	const normals = hem.attributes.normal
	for (let i = 0; i < normals.count; i++) normals.setXYZ(i, 0, -1, 0)
	part(hem, materials.skin)
	// A worn wooden lip gives the drum a hard, readable edge without changing its footprint.
	part(
		new THREE.CylinderGeometry(v.width * 0.92, v.width, 0.1, 6),
		materials.skin,
		0,
		discY + v.height - 0.05,
		0,
	)
	detail(
		[-1, 1].map((side) =>
			new THREE.BoxGeometry(0.025, 0.012, 0.35)
				.rotateY(side * 0.32)
				.translate(side * 0.24, discY + v.height + 0.006, 0.05),
		),
		materials.ink,
	)
	// Team accent: a sash round the middle, proud of the ink border.
	part(
		new THREE.CylinderGeometry(
			v.width + v.sashProud * 0.25,
			v.width + v.sashProud * 0.25,
			v.sashHeight * 0.4,
			6,
		),
		materials.team,
		0,
		discY + v.sashY,
		0,
	)
	const jug = part(
		new THREE.CylinderGeometry(v.jugRadius * 1.35, v.jugRadius * 1.35, v.jugHeight, 6),
		materials.cream,
		0,
		discY + v.jugY + 0.2,
		v.jugZ + 0.16,
	)
	// A dark shoulder and pale chipped rim make the enamel vessel legible over the back.
	part(
		new THREE.CylinderGeometry(v.jugRadius * 1.08, v.jugRadius * 1.35, 0.08, 6),
		materials.cream,
		0,
		v.jugHeight / 2 - 0.04,
		0,
		jug,
	)
	// The neck rides on the jug so it tips with it.
	part(
		new THREE.CylinderGeometry(v.neckRadius, v.neckRadius, v.neckHeight, 6),
		materials.ink,
		0,
		v.neckY - v.jugY,
		0,
		jug,
	)
	// A missing bite in the enamel lid is visible from above and moves with the jug.
	part(
		new THREE.CylinderGeometry(
			v.neckRadius * 1.2,
			v.neckRadius * 1.15,
			0.06,
			8,
			1,
			false,
			0.5,
			Math.PI * 2 - 0.8,
		),
		materials.cream,
		0,
		v.neckY - v.jugY + v.neckHeight / 2 - 0.03,
		0,
		jug,
	)
	const palm = part(
		new THREE.SphereGeometry(v.palmRadius, 6, 4),
		materials.cream,
		v.palmX,
		discY + v.palmY,
		v.palmZ,
	)
	// A tucked heel only clears the hem during the kick; the resting silhouette stays a drum.
	const heel = part(new THREE.BoxGeometry(v.heelWidth, v.heelHeight, v.heelLength), materials.cream)
	// Two broken cuffs carry the debt and the tea shield without painting another danger area.
	const cuff = (material, start) =>
		part(
			new THREE.RingGeometry(
				v.cuffRadius - v.cuffWidth,
				v.cuffRadius,
				12,
				1,
				start,
				Math.PI,
			).rotateX(-Math.PI / 2),
			material,
			0,
			discY + v.sashY,
			0,
		)
	const debt = cuff(materials.ink, 0)
	const shield = cuff(own(makeStyleMaterial('cream', { flat: true })), Math.PI)
	return {
		jug,
		palm,
		heel,
		debt,
		shield,
		discY,
		jugY: discY + v.jugY + 0.2,
		last: null,
		drinkEnd: -Infinity,
		drinkAmount: 0,
		kicked: false,
		kickEnd: -Infinity,
	}
}
export function animate(unit, rig, { costume, pose, progress, time, alpha }) {
	const v = tune.heroes.oolong.view
	// History is only for the two short recoveries; all sustained poses read replicated state.
	if (!unit || unit.dead || (rig.last !== null && time < rig.last)) {
		rig.drinkEnd = rig.kickEnd = -Infinity
		rig.drinkAmount = 0
		rig.kicked = false
	}
	rig.last = time
	costume.position.set(0, 0, 0)
	costume.scale.set(1, 1, 1)
	rig.jug.position.set(0, rig.jugY, v.jugZ + 0.16)
	rig.jug.rotation.set(0, 0, 0)
	rig.palm.position.set(v.palmX, rig.discY + v.palmY, v.palmZ)
	rig.palm.scale.set(1, 1, 1)
	rig.heel.visible = rig.debt.visible = rig.shield.visible = false
	if (!unit || unit.dead) return

	const active = (key) =>
		unit.statuses?.find((s) => s.key === key && (s.until == null || s.until > time))
	const bank = active('stagger.bank')
	const shield = active('swig.shield')
	const burden = Math.min(1, (bank?.amount ?? 0) / Math.max(1, unit.maxHp * v.debtFraction))
	rig.debt.visible = burden > 0
	rig.debt.scale.setScalar(1 + burden * v.debtGrow)
	rig.shield.visible = (shield?.amount ?? 0) > 0
	const fullShield = Math.max(1, tune.swig.shieldPerSecond * tune.swig.duration)
	rig.shield.scale.setScalar(1 + v.shieldGrow * Math.min(1, (shield?.amount ?? 0) / fullShield))

	const drinking = unit.channel?.ability === 'swig'
	const drinkAge = drinking ? (unit.channel.total - unit.channel.left + alpha) * STEP : 0
	const lift = drinking ? poseWindup(drinkAge / v.drinkRaise) : 0
	if (drinking) {
		rig.drinkAmount = lift
		rig.drinkEnd = time
	}
	const lower = Math.max(0, 1 - ((time - rig.drinkEnd) * STEP) / v.drinkRecover)
	const sip = drinking ? Math.sin((drinkAge * Math.PI) / v.gulpPeriod) ** 4 : 0
	const drink = drinking ? lift : rig.drinkAmount * lower * lower

	const kicking = unit.dashAbility === 'flyingKick' && unit.body.dashing
	if (rig.kicked && !kicking) rig.kickEnd = time
	rig.kicked = kicking
	const landing = Math.max(0, 1 - ((time - rig.kickEnd) * STEP) / v.kickRecover)
	const brace = unit.stance?.ability === 'stagger'
	if (brace) {
		const age = Math.max(0, tune.stagger.duration - (unit.stance.until - time) * STEP)
		const plant = poseWindup(age / v.braceTime)
		costume.scale.set(1 + v.braceWide * plant, 1 - v.braceLow * plant, 1)
		costume.rotation.x = v.staggerLean * plant
		costume.rotation.z = -v.staggerLean * burden
		rig.palm.position.set(v.guardX, rig.discY + v.guardY, v.guardZ)
		rig.palm.scale.set(v.guardWide, 1, v.palmFlat)
		rig.jug.position.x = -v.guardX
	}
	if (drinking || drink > 0.001) {
		rig.jug.rotation.x = -v.drinkTilt * drink - v.gulpTilt * sip
		rig.jug.position.y += v.drinkLift * drink + v.gulpLift * sip
		rig.jug.position.z -= v.drinkReach * drink
		rig.palm.position.set(
			v.guardX * (1 - drink),
			rig.discY + v.palmY + v.drinkLift * drink,
			v.palmZ - v.drinkReach * drink,
		)
		costume.rotation.x = -v.drinkLean * drink
	}
	if (pose === 'flyingKick') {
		const coil = poseWindup(progress)
		costume.rotation.x = v.kickCoil * coil
		costume.rotation.y = -v.kickTurn * coil
		costume.scale.set(1 + v.braceWide * coil, 1 - v.braceLow * coil, 1)
		rig.palm.position.z += v.palmPull * coil
		rig.heel.visible = true
		rig.heel.position.set(-v.heelX, rig.discY + v.heelLift * coil, -v.heelTuck)
		rig.heel.rotation.x = -v.kickCoil * coil
	} else if (kicking || (landing > 0 && !drinking && !unit.attack && !pose && !brace)) {
		const extend = kicking ? 1 : poseStrike(1, landing * landing)
		costume.rotation.x = -v.kickLean * extend
		costume.rotation.y = v.kickTurn * extend
		rig.heel.visible = true
		rig.heel.position.set(
			-v.heelX,
			rig.discY + v.heelLift * extend,
			-v.heelTuck - v.heelReach * extend,
		)
		rig.heel.rotation.x = v.kickLean * extend
		rig.jug.position.z += v.jugFollow * extend
		rig.palm.position.z += v.palmPull * extend
		if (!kicking) costume.scale.y = 1 - v.landLow * Math.sin(Math.PI * landing)
	}
	if (unit.attack) {
		const attack = unit.attack
		const winding = attack.phase === 'windup'
		const coil = winding
			? poseWindup(Math.max(0, 1 - (attack.left - alpha) / Math.max(1, attack.total)))
			: 0
		const elapsed = (time - attack.startedTick) * STEP
		const settle = Math.max(
			0,
			((attack.left - alpha) * STEP) / Math.max(STEP, tune.palmStrike.backswing),
		)
		// Contact is the first backswing tick, so the palm is already extended there.
		const strike = winding ? 0 : poseStrike(1, settle)
		costume.rotation.y = -v.palmTurn * coil + v.palmTurn * strike
		costume.rotation.x = v.palmLean * coil - v.palmLean * strike
		rig.palm.position.x = v.palmX - v.palmCross * strike
		rig.palm.position.z = v.palmZ + v.palmPull * coil - v.strikeReach * strike
		rig.palm.scale.set(
			1 + v.palmOpen * strike,
			1 + v.palmOpen * strike,
			1 - (1 - v.palmFlat) * strike,
		)
		rig.jug.rotation.z =
			v.palmLean * strike * Math.max(0, 1 - elapsed / Math.max(STEP, tune.palmStrike.backswing))
	}
}
