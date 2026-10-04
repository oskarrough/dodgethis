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
	function part(g, material, x = 0, y = 0, z = 0, parent = body.visual) {
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
		body.visual.geometry = own(
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
			body.visual.add(arrow)
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
		body.visual.geometry = own(rounded(t.mittsWidth, t.mittsDepth, t.mittsHeight))
		glove = new THREE.Group()
		glove.name = 'moba-glove'
		body.visual.add(glove)
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
		body.visual.geometry = own(
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
		body.visual.geometry = own(new THREE.BoxGeometry(t.skipWidth, t.skipHeight, t.skipDepth))
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
	body.visual.geometry.computeBoundingBox()
	body.visual.geometry.translate(0, discY - body.visual.geometry.boundingBox.min.y, 0)
	if (heroId !== 'fletcher') {
		const border = part(body.visual.geometry.clone(), ink)
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
	body.drawPose = (progress) => {
		progress = Math.max(0, Math.min(1, progress))
		drawn.visible = progress > 0
		if (!drawn.visible) return
		body.visual.rotation.x = -tune.abilityView.drawLean * progress
		body.visual.rotation.z = -tune.abilityView.drawTurn * progress
		drawn.position.z = -t.arrowHeight / 2 + tune.abilityView.drawPull * progress
	}
	body.poseAbility = (cast, alpha = 0) => {
		const ability = castAbility({ cast, definition: heroDefinition(heroId) })
		body.drawPose(
			ability?.effects?.pose === 'draw'
				? Math.max(1 / Math.max(1, cast.total), 1 - (cast.left - alpha) / Math.max(1, cast.total))
				: 0,
		)
		if (!glove) return
		const unit = body.mobaUnit,
			tick = (body.mobaTick ?? 0) + alpha,
			v = tune.mittsView
		const pocket = unit?.abilityState.pocket
		gloveMaterial.uniforms.uStyleId.value = styleId(
			(pocket?.team ?? team) === 'A' ? 'teamA' : 'teamB',
		)
		gloveMaterial.uniforms.uFlat.value = pocket ? 1 : 0
		pocketRing.visible = !!pocket
		if (pocket) {
			const fraction = Math.max(
				0,
				Math.min(1, ((pocket.until - tick) * STEP) / tune.catching.pocketLife),
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
		body.visual.rotation.x = 0
		body.visual.rotation.z = 0
		const pose = ability?.effects?.pose
		const progress = cast
			? Math.max(0, Math.min(1, 1 - (cast.left - alpha) / Math.max(1, cast.total)))
			: 0
		if (pose === 'toss') {
			glove.position.z = v.tossPull * progress
			glove.rotation.y = v.gloveTurn * progress
		} else if (unit?.stance?.ability === 'catch') {
			glove.position.y = v.gloveLift
			glove.rotation.z = -v.gloveTurn
		} else if (unit?.body.dashing && unit.dashAbility === 'dive') {
			body.visual.rotation.x = -v.diveLean
			glove.position.z = -v.tossPull
		} else if (tick < (unit?.proneUntil ?? 0)) {
			body.visual.rotation.x = -v.proneTurn
		} else if (unit?.attack) {
			const attack = unit.attack
			const reach =
				attack.phase === 'windup' ? 1 - (attack.left - alpha) / Math.max(1, attack.total) : 1
			glove.position.z = -v.slapReach * Math.max(0, Math.min(1, reach))
		}
	}
	let disposed = false
	return () => {
		if (disposed) return
		disposed = true
		for (const root of roots) root.removeFromParent()
		for (const g of geometries) g.dispose()
		for (const material of [teamMaterial, cream, fins, ink, foot, gloveMaterial, pocketMaterial])
			material.dispose()
		delete body.drawPose
		delete body.poseAbility
		body.visual.geometry = original
		hidden.forEach(([part, visible]) => (part.visible = visible))
	}
}
