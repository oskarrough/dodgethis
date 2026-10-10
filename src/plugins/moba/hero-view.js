import * as THREE from 'three'
import { makeStyleMaterial } from '../../core/stylepass.js'
import { look } from './look.js'
import { STEP } from '../../core/app.js'
import { castAbility } from './ability.js'
import { DEFAULT_HERO, heroDefinition } from './heroes.js'
import HERO_VIEWS from './heroes/views.js'

// A hero folder's costume (heroes/views.js) dresses the torso, adds parts and returns the rig
// its poses need: the bow posed here, or parts its own animate() poses. Without one, the box.
function dressBox({ torso, part, own, t, materials }) {
	const { ink, team: teamMaterial } = materials
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
	return {}
}

// Same costume on the lane body and the select replica. The capsule collider
// remains untouched; every costume sits above the same inked collision disc.
export function dressHero(body, heroId = DEFAULT_HERO, team = 'A') {
	heroDefinition(heroId)
	const t = look.silhouettes
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
	const { dress = dressBox, animate = null } = HERO_VIEWS[heroId]?.costume ?? {}
	const dressed = dress({
		costume,
		torso,
		footDisc,
		discY,
		part,
		own,
		rounded,
		roots,
		t,
		look,
		materials: {
			ink,
			cream,
			fins,
			team: teamMaterial,
			glove: gloveMaterial,
			pocket: pocketMaterial,
		},
	})
	const { bow = null, hand = null, bowString = null, drawArm = null } = dressed
	// Move geometry, not the animated root: core's capsule centre is still physics.
	torso.geometry.computeBoundingBox()
	torso.geometry.translate(0, discY - torso.geometry.boundingBox.min.y, 0)
	if (dressed.border !== false) {
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
	const armDirection = new THREE.Vector3(),
		armUp = new THREE.Vector3(0, 1, 0)
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
		body.poseAbility?.(null, 0, null, Number.isFinite(lastTick) ? lastTick : 0)
	}
	// Only a real projectile fact arms the snap. Cast disappearance is cancellation.
	body.releaseAbilityPose = (pose, tick) => {
		if ((pose === 'draw' && bow) || dressed.releases?.[pose]) {
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
		const a = look.abilityView
		const release =
			releasePose === 'draw'
				? { snap: a.drawSnap, recover: a.drawRecover }
				: dressed.releases?.[releasePose]
		const snap = release?.snap ?? 0,
			recover = release?.recover ?? 0
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
		animate?.(unit, dressed, {
			pose,
			progress,
			alpha,
			time,
			releasing,
			releasePose,
			fire,
			settle,
			costume,
			mesh: body.mesh,
			team,
		})
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
