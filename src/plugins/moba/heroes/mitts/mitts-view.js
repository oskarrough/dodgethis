import * as THREE from 'three'
import { styleId } from '../../../../core/stylepass.js'
import { STEP } from '../../../../core/app.js'
import { tune } from '../../tune.js'

// Mitts's pocket ring and glove poses, in metres and radians.
const view = {
	segments: 48,
	pocketY: 0.015,
	pocketRadius: 0.6,
	pocketWidth: 0.055,
	gloveLift: 0.5,
	gloveTurn: 0.5,
	tossPull: 0.65,
	tossLift: 0.32,
	tossLean: 0.22,
	tossTurn: 0.38,
	tossReach: 0.85,
	tossSnap: 0.08,
	tossRecover: 0.2,
	slapReach: 0.5,
	diveLean: 0.7,
	proneTurn: Math.PI / 2,
}

// Mitts's costume: the rounded block, the glove and the pocket ring under his feet.
export function dress({
	costume,
	torso,
	footDisc,
	discY,
	part,
	own,
	rounded,
	roots,
	t,
	materials,
}) {
	const { glove: gloveMaterial, pocket: pocketMaterial } = materials
	torso.geometry = own(rounded(t.mittsWidth, t.mittsDepth, t.mittsHeight))
	const glove = new THREE.Group()
	glove.name = 'moba-glove'
	costume.add(glove)
	roots.push(glove)
	const pocketRing = part(
		new THREE.RingGeometry(
			view.pocketRadius - view.pocketWidth,
			view.pocketRadius,
			view.segments,
		).rotateX(-Math.PI / 2),
		pocketMaterial,
		0,
		view.pocketY,
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
	return {
		glove,
		pocketRing,
		gloveMaterial,
		releases: { toss: { snap: view.tossSnap, recover: view.tossRecover } },
	}
}

// Every frame: the glove wears the pocketed shot's team, the ring counts its life down, and
// the glove follows Toss, Catch, Dive, prone and the slap.
export function animate(
	unit,
	rig,
	{ pose, progress, alpha, time, releasing, releasePose, fire, settle, costume, mesh, team },
) {
	const { glove, pocketRing, gloveMaterial } = rig
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
		for (let i = 0; i <= view.segments; i++) {
			const angle = (i / view.segments) * Math.PI * 2 * fraction
			for (let row = 0; row < 2; row++) {
				const radius = view.pocketRadius - (1 - row) * view.pocketWidth
				positions.setXYZ(
					row * (view.segments + 1) + i,
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
		glove.position.z = view.tossPull * windup - view.tossReach * fire * settle
		glove.position.y = view.tossLift * windup
		glove.rotation.y = view.gloveTurn * windup - view.tossTurn * fire * settle
		glove.rotation.x = -view.tossTurn * fire * settle
		costume.rotation.x = -view.tossLean * windup + view.tossLean * fire * settle
		costume.rotation.y = -view.tossTurn * windup + view.tossTurn * fire * settle
	} else if (unit?.stance?.ability === 'catch') {
		glove.position.y = view.gloveLift
		glove.rotation.z = -view.gloveTurn
		const direction = unit.catchWindow?.dir ?? unit.stance.dir
		if (direction)
			glove.rotation.y = Math.atan2(direction.x, direction.z) + Math.PI - mesh.rotation.y
	} else if (unit?.body?.dashing && unit.dashAbility === 'dive') {
		costume.rotation.x = -view.diveLean
		glove.position.z = -view.tossPull
	} else if (time < (unit?.proneUntil ?? 0)) {
		costume.rotation.x = -view.proneTurn
	} else if (unit?.attack) {
		const attack = unit.attack
		const reach =
			attack.phase === 'windup' ? 1 - (attack.left - alpha) / Math.max(1, attack.total) : 1
		glove.position.z = -view.slapReach * Math.max(0, Math.min(1, reach))
	}
}
