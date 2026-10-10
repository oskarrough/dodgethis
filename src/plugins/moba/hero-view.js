import * as THREE from 'three'
import { makeStyleMaterial, styleId } from '../../core/stylepass.js'
import { tune } from './tune.js'
import { STEP } from '../../core/app.js'
import { castAbility } from './ability.js'
import { heroDefinition } from './heroes.js'

// Same costume on the lane body and the select replica. The capsule collider
// remains untouched; every costume sits above the same inked collision disc.
export function dressHero(body, heroId = 'fletcher', team = 'A') {
	heroDefinition(heroId)
	const t = tune.silhouettes
	const original = body.visual.geometry
	const hidden = body.visual.children.map((part) => [part, part.visible])
	hidden.forEach(([part]) => (part.visible = false))
	const costume = new THREE.Group()
	costume.name = 'moba-cast-pose'
	body.visual.add(costume)
	const torso = new THREE.Mesh(original, body.visual.material)
	torso.castShadow = true
	costume.add(torso)
	body.visual.geometry = new THREE.BufferGeometry()
	const empty = body.visual.geometry
	const teamMaterial = makeStyleMaterial(team === 'A' ? 'teamA' : 'teamB')
	const cream = makeStyleMaterial('cream')
	const fins = makeStyleMaterial(team === 'A' ? 'teamA' : 'teamB', { side: THREE.DoubleSide })
	const ink = makeStyleMaterial('ink', { flat: true })
	const foot = makeStyleMaterial(team === 'A' ? 'teamA' : 'teamB', { flat: true })
	const gloveMaterial = makeStyleMaterial(team === 'A' ? 'teamA' : 'teamB')
	const pocketMaterial = makeStyleMaterial('ammo', { flat: true })
	let glove = null,
		pocketRing = null
	const geometries = []
	const roots = []
	const own = (g) => {
		geometries.push(g)
		return g
	}
	function part(g, material, x = 0, y = 0, z = 0, parent = costume) {
		const mesh = new THREE.Mesh(own(g), material)
		mesh.position.set(x, y, z)
		parent.add(mesh)
		roots.push(mesh)
		return mesh
	}
	function rounded(width, depth, height) {
		const shape = new THREE.Shape()
		const x = width / 2,
			z = depth / 2,
			r = Math.min(t.corner, x, z)
		shape.moveTo(-x + r, -z)
		shape.lineTo(x - r, -z)
		shape.quadraticCurveTo(x, -z, x, -z + r)
		shape.lineTo(x, z - r)
		shape.quadraticCurveTo(x, z, x - r, z)
		shape.lineTo(-x + r, z)
		shape.quadraticCurveTo(-x, z, -x, z - r)
		shape.lineTo(-x, -z + r)
		shape.quadraticCurveTo(-x, -z, -x + r, -z)
		return new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
			.rotateX(Math.PI / 2)
			.translate(0, height / 2, 0)
	}
	body.mesh.name = `moba-${heroId}`
	const discY = -body.radius - body.halfHeight + t.discY
	const footDisc = part(
		new THREE.CircleGeometry(body.radius, t.segments).rotateX(-Math.PI / 2),
		foot,
		0,
		discY,
		0,
		body.mesh,
	)
	part(
		new THREE.RingGeometry(body.radius - t.discBorder, body.radius, t.segments).rotateX(
			-Math.PI / 2,
		),
		ink,
		0,
		discY + t.discBorder / 4,
		0,
		body.mesh,
	)
	if (heroId === 'fletcher') {
		torso.geometry = own(
			new THREE.CapsuleGeometry(t.bodyRadius, t.bodyHalfHeight * 2, 8, t.segments),
		)
		part(
			new THREE.CylinderGeometry(t.quiverRadius, t.quiverRadius, t.quiverHeight, t.segments),
			ink,
			0,
			t.quiverY,
			t.quiverZ,
		)
		for (let i = 0; i < t.arrowCount; i++) {
			const offset = i - (t.arrowCount - 1) / 2
			const arrow = new THREE.Group()
			arrow.position.set(offset * t.arrowSpacing, t.arrowY, t.quiverZ)
			arrow.rotation.z = -offset * t.arrowFan
			arrow.rotation.x = t.arrowTilt
			costume.add(arrow)
			roots.push(arrow)
			part(
				new THREE.CylinderGeometry(t.arrowRadius, t.arrowRadius, t.arrowHeight, 4),
				cream,
				0,
				0,
				0,
				arrow,
			)
			for (let fin = 0; fin < t.finCount; fin++) {
				const mesh = part(
					new THREE.PlaneGeometry(t.fletchingRadius * 2, t.fletchingHeight),
					fins,
					0,
					t.arrowHeight / 2,
					0,
					arrow,
				)
				mesh.rotation.y = (fin * Math.PI) / t.finCount
			}
		}
	} else if (heroId === 'mitts') {
		torso.geometry = own(rounded(t.mittsWidth, t.mittsDepth, t.mittsHeight))
		glove = new THREE.Group()
		glove.name = 'moba-glove'
		costume.add(glove)
		roots.push(glove)
		pocketRing = part(
			new THREE.RingGeometry(
				tune.mittsView.pocketRadius - tune.mittsView.pocketWidth,
				tune.mittsView.pocketRadius,
				tune.mittsView.segments,
			).rotateX(-Math.PI / 2),
			pocketMaterial,
			0,
			tune.mittsView.pocketY,
			0,
			footDisc,
		)
		pocketRing.name = 'moba-pocket-ring'
		pocketRing.visible = false
		// Palm ends before the thumb: the intervening gap is real geometry, not paint.
		part(
			rounded(t.gloveWidth, t.gloveDepth, t.fingerRadius * 2),
			gloveMaterial,
			t.gloveX,
			discY + t.mittsHeight / 2,
			t.gloveZ,
			glove,
		)
		for (let i = 0; i < t.fingerCount; i++)
			part(
				new THREE.SphereGeometry(t.fingerRadius, 8, 6),
				gloveMaterial,
				t.gloveX + (i - (t.fingerCount - 1) / 2) * t.fingerSpacing,
				discY + t.mittsHeight / 2,
				t.gloveZ - t.gloveDepth / 2,
				glove,
			)
		part(
			new THREE.SphereGeometry(t.fingerRadius, 8, 6),
			gloveMaterial,
			t.gloveX - t.gloveWidth / 2 - t.fingerRadius,
			discY + t.mittsHeight / 2,
			t.gloveZ + t.gloveDepth / 2,
			glove,
		)
	} else if (heroId === 'carom') {
		const shape = new THREE.Shape()
		for (let i = 0; i < 3; i++) {
			const angle = (i * Math.PI * 2) / 3
			const x = Math.sin(angle) * t.caromRadius,
				z = -Math.cos(angle) * t.caromRadius
			if (i === 0) shape.moveTo(x, z)
			else shape.lineTo(x, z)
		}
		shape.closePath()
		torso.geometry = own(
			new THREE.ExtrudeGeometry(shape, {
				depth: t.caromHeight,
				bevelEnabled: true,
				bevelThickness: t.corner / 2,
				bevelSize: t.corner / 2,
				bevelSegments: 3,
			})
				.rotateX(Math.PI / 2)
				.translate(0, t.caromHeight / 2, 0),
		)
		part(
			new THREE.TorusGeometry(t.racketRadius, t.racketTube, 8, t.segments).rotateX(Math.PI / 2),
			teamMaterial,
			t.racketX,
			t.racketY,
			0,
		)
		part(
			new THREE.CylinderGeometry(
				t.racketHandleRadius,
				t.racketHandleRadius,
				t.racketHandle,
				8,
			).rotateX(Math.PI / 2),
			ink,
			t.racketX,
			t.racketY,
			t.racketRadius + t.racketHandle / 2,
		)
	} else {
		torso.geometry = own(new THREE.BoxGeometry(t.skipWidth, t.skipHeight, t.skipDepth))
		part(
			new THREE.CylinderGeometry(
				t.megaphoneRadius,
				t.arrowRadius,
				t.megaphoneLength,
				t.segments,
			).rotateX(-Math.PI / 2),
			teamMaterial,
			0,
			t.megaphoneY,
			t.megaphoneZ,
		)
		part(
			new THREE.CircleGeometry(t.megaphoneMouth, t.segments),
			ink,
			0,
			t.megaphoneY,
			t.megaphoneZ - t.megaphoneLength / 2 - t.discBorder / 4,
		).rotation.y = Math.PI
	}
	// Move geometry, not the animated root: core's capsule centre is still physics.
	torso.geometry.computeBoundingBox()
	torso.geometry.translate(0, discY - torso.geometry.boundingBox.min.y, 0)
	if (heroId !== 'fletcher') {
		const border = part(torso.geometry.clone(), ink)
		border.geometry.computeBoundingBox()
		const bounds = border.geometry.boundingBox
		const height = bounds.max.y - bounds.min.y
		border.scale.set(
			1 + t.discBorder / (bounds.max.x - bounds.min.x),
			1 - t.discBorder / height,
			1 + t.discBorder / (bounds.max.z - bounds.min.z),
		)
		border.position.y = discY * (1 - border.scale.y)
	}
	const drawn = part(
		new THREE.CylinderGeometry(t.arrowRadius, t.arrowRadius, t.arrowHeight, 4).rotateX(Math.PI / 2),
		cream,
		0,
		0,
		-t.arrowHeight / 2,
	)
	drawn.name = 'moba-drawn-arrow'
	drawn.visible = false
	let bow = null,
		hand = null,
		bowString = null,
		drawArm = null
	const armDirection = new THREE.Vector3(),
		armUp = new THREE.Vector3(0, 1, 0)
	if (heroId === 'fletcher') {
		const a = tune.abilityView
		bow = new THREE.Group()
		bow.name = 'moba-bow'
		costume.add(bow)
		roots.push(bow)
		const curve = new THREE.CatmullRomCurve3([
			new THREE.Vector3(0, -a.bowHeight / 2, 0),
			new THREE.Vector3(0, 0, -a.bowCurve),
			new THREE.Vector3(0, a.bowHeight / 2, 0),
		])
		part(new THREE.TubeGeometry(curve, a.bowSegments, a.bowRadius, 4, false), ink, 0, 0, 0, bow)
		hand = part(new THREE.SphereGeometry(a.handRadius, 8, 6), cream)
		hand.name = 'moba-draw-hand'
		part(new THREE.SphereGeometry(a.handRadius, 8, 6), cream, 0, 0, -a.bowCurve, bow)
		drawArm = part(new THREE.CylinderGeometry(a.armRadius, a.armRadius, 1, 4), teamMaterial)
		drawArm.name = 'moba-draw-arm'
		const stringGeometry = new THREE.BufferGeometry()
		stringGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(36), 3))
		bowString = new THREE.Mesh(own(stringGeometry), fins)
		bowString.frustumCulled = false
		costume.add(bowString)
		roots.push(bowString)
	}
	const definition = heroDefinition(heroId)
	const resolver = { cast: null, definition }
	let releasePose = null,
		releaseTick = -Infinity,
		lastTick = -Infinity
	body.resetAbilityPose = () => {
		releasePose = null
		releaseTick = -Infinity
		costume.rotation.set(0, 0, 0)
		drawn.visible = false
		if (glove) {
			glove.position.set(0, 0, 0)
			glove.rotation.set(0, 0, 0)
			pocketRing.visible = false
		}
		body.poseAbility?.(null, 0, null, Number.isFinite(lastTick) ? lastTick : 0)
	}
	// Only a real projectile fact arms the snap. Cast disappearance is cancellation.
	body.releaseAbilityPose = (pose, tick) => {
		if ((pose === 'draw' && bow) || (pose === 'toss' && glove)) {
			releasePose = pose
			releaseTick = tick
		}
	}
	body.poseAbility = (cast, alpha = 0, unit = null, tick = 0) => {
		if (tick < lastTick || unit?.dead) body.resetAbilityPose()
		lastTick = tick
		if (unit?.dead) return
		resolver.cast = cast
		const ability = castAbility(resolver)
		const pose = ability?.effects?.pose
		const progress = cast
			? Math.max(0, Math.min(1, 1 - (cast.left - alpha) / Math.max(1, cast.total)))
			: 0
		const time = tick + alpha
		const elapsed = Math.max(0, (time - releaseTick) * STEP)
		const a = tune.abilityView,
			v = tune.mittsView
		const snap = releasePose === 'draw' ? a.drawSnap : v.tossSnap
		const recover = releasePose === 'draw' ? a.drawRecover : v.tossRecover
		const releasing =
			!cast &&
			!unit?.stance &&
			!unit?.body?.dashing &&
			!unit?.attack &&
			releasePose &&
			elapsed < Math.max(STEP, snap + recover)
		const fire = releasing ? Math.min(1, elapsed / Math.max(STEP, snap)) : 0
		const settle = releasing
			? 1 - Math.max(0, Math.min(1, (elapsed - snap) / Math.max(STEP, recover)))
			: 0
		if (cast || !releasing) releasePose = null
		costume.rotation.set(0, 0, 0)
		drawn.visible = false
		if (bow) {
			drawArm.visible = true
			bowString.visible = true
			const pulling = pose === 'draw'
			const reach = Math.max(STEP, Math.min(1, a.drawReach))
			const fetching = pulling ? Math.min(1, progress / reach) : 0
			const tension = pulling
				? Math.max(0, Math.min(1, (progress - reach) / Math.max(STEP, 1 - reach)))
				: 0
			const released = releasing && releasePose === 'draw'
			const pull = pulling ? tension : released ? (1 - fire) * settle : 0
			bow.position.set(a.bowX, a.bowY, a.bowZ)
			bow.rotation.y = a.drawTurn * pull
			bow.scale.z = 1 + a.bowFlex * pull
			hand.position.set(
				pulling ? a.handX * fetching : a.handX,
				pulling ? t.arrowY + (a.handY - t.arrowY) * fetching : a.handY,
				pulling
					? t.quiverZ + (a.bowZ - t.quiverZ) * fetching + a.drawPull * pull
					: a.bowZ + a.drawPull * pull,
			)
			if (!pulling && !released) hand.position.set(a.handX, a.handY, t.quiverZ)
			costume.rotation.x = -a.drawLean * pull + (released ? a.drawRecoil * fire * settle : 0)
			costume.rotation.y = -a.drawTurn * pull
			costume.rotation.z = -a.drawTurn * pull
			drawn.visible = pulling && progress >= reach
			drawn.position.set(hand.position.x, hand.position.y, hand.position.z - t.arrowHeight / 2)
			armDirection.set(hand.position.x - a.handX, hand.position.y - a.handY, hand.position.z)
			drawArm.position.set(
				(a.handX + hand.position.x) / 2,
				(a.handY + hand.position.y) / 2,
				hand.position.z / 2,
			)
			drawArm.scale.y = armDirection.length()
			if (drawArm.scale.y > 0)
				drawArm.quaternion.setFromUnitVectors(armUp, armDirection.normalize())
			const string = bowString.geometry.attributes.position
			const middleX = pulling || released ? hand.position.x : a.bowX
			const middleZ = a.bowZ + a.drawPull * pull
			const width = a.bowRadius / 4
			for (let leg = 0; leg < 2; leg++) {
				const y = a.bowY + ((leg ? 1 : -1) * a.bowHeight) / 2,
					i = leg * 6
				string.setXYZ(i, a.bowX - width, y, a.bowZ)
				string.setXYZ(i + 1, a.bowX + width, y, a.bowZ)
				string.setXYZ(i + 2, middleX - width, a.bowY, middleZ)
				string.setXYZ(i + 3, a.bowX + width, y, a.bowZ)
				string.setXYZ(i + 4, middleX + width, a.bowY, middleZ)
				string.setXYZ(i + 5, middleX - width, a.bowY, middleZ)
			}
			string.needsUpdate = true
		}
		if (!glove) return
		const pocket = unit?.abilityState?.pocket
		gloveMaterial.uniforms.uStyleId.value = styleId(
			(pocket?.team ?? team) === 'A' ? 'teamA' : 'teamB',
		)
		gloveMaterial.uniforms.uFlat.value = pocket ? 1 : 0
		pocketRing.visible = !!pocket
		if (pocket) {
			const fraction = Math.max(
				0,
				Math.min(1, ((pocket.until - time) * STEP) / tune.catching.pocketLife),
			)
			const positions = pocketRing.geometry.attributes.position
			for (let i = 0; i <= v.segments; i++) {
				const angle = (i / v.segments) * Math.PI * 2 * fraction
				for (let row = 0; row < 2; row++) {
					const radius = v.pocketRadius - (1 - row) * v.pocketWidth
					positions.setXYZ(
						row * (v.segments + 1) + i,
						Math.cos(angle) * radius,
						0,
						-Math.sin(angle) * radius,
					)
				}
			}
			positions.needsUpdate = true
		}
		glove.position.set(0, 0, 0)
		glove.rotation.set(0, 0, 0)
		if (pose === 'toss' || (releasing && releasePose === 'toss')) {
			const windup = pose === 'toss' ? Math.sin((progress * Math.PI) / 2) : (1 - fire) * settle
			glove.position.z = v.tossPull * windup - v.tossReach * fire * settle
			glove.position.y = v.tossLift * windup
			glove.rotation.y = v.gloveTurn * windup - v.tossTurn * fire * settle
			glove.rotation.x = -v.tossTurn * fire * settle
			costume.rotation.x = -v.tossLean * windup + v.tossLean * fire * settle
			costume.rotation.y = -v.tossTurn * windup + v.tossTurn * fire * settle
		} else if (unit?.stance?.ability === 'catch') {
			glove.position.y = v.gloveLift
			glove.rotation.z = -v.gloveTurn
			const direction = unit.catchWindow?.dir ?? unit.stance.dir
			if (direction)
				glove.rotation.y = Math.atan2(direction.x, direction.z) + Math.PI - body.mesh.rotation.y
		} else if (unit?.body?.dashing && unit.dashAbility === 'dive') {
			costume.rotation.x = -v.diveLean
			glove.position.z = -v.tossPull
		} else if (time < (unit?.proneUntil ?? 0)) {
			costume.rotation.x = -v.proneTurn
		} else if (unit?.attack) {
			const attack = unit.attack
			const reach =
				attack.phase === 'windup' ? 1 - (attack.left - alpha) / Math.max(1, attack.total) : 1
			glove.position.z = -v.slapReach * Math.max(0, Math.min(1, reach))
		}
	}
	body.poseAbility(null)
	let disposed = false
	return () => {
		if (disposed) return
		disposed = true
		body.resetAbilityPose()
		for (const root of roots) root.removeFromParent()
		for (const g of geometries) g.dispose()
		for (const material of [teamMaterial, cream, fins, ink, foot, gloveMaterial, pocketMaterial])
			material.dispose()
		costume.removeFromParent()
		empty.dispose()
		delete body.resetAbilityPose
		delete body.releaseAbilityPose
		delete body.poseAbility
		body.visual.geometry = original
		hidden.forEach(([part, visible]) => (part.visible = visible))
	}
}
