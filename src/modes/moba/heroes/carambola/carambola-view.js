import * as THREE from 'three'
import { STEP } from '../../../../core/app.js'
import { tune } from '../../tune.js'
import { ticks } from '../../sim-kit.js'
import { poseWindup, poseStrike } from '../../pose-curve.js'
import { makeStyleMaterial } from '../../../../core/stylepass.js'

// Carambola's build, in metres and radians. Forward is -z; heights are above the foot disc.
const view = {
	bodyRadius: 0.58,
	bodyHeight: 0.72,
	bandRadius: 0.62,
	bandHeight: 0.14,
	bandY: 0.42,
	headRadius: 0.43,
	headSquash: 0.82,
	headY: 0.98,
	headZ: -0.04,
	beakY: 1.13,
	beakZ: -0.32,
	clawX: 0.18,
	clawZ: -0.42,
	paddleRadius: 0.36,
	paddleDepth: 0.06,
	notchRadius: 0.09,
	notchAngle: Math.PI / 4,
	paddleX: 0.92,
	paddleY: 0.82,
	paddleZ: -0.32,
	paddleTilt: 0.35,
	handleLength: 0.34,
	handleRadius: 0.05,
	wrapLength: 0.1,
	netRadius: 0.13,
	netLength: 0.78,
	netY: 0.78,
	netZ: 0.36,
	strapWidth: 0.07,
	strapInset: 0.12,
}

// A rounded triangular prism, point forward, centred on the origin.
function prism(radius, height, bevel) {
	const shape = new THREE.Shape()
	for (let i = 0; i < 3; i++) {
		const angle = (i * Math.PI * 2) / 3
		const x = Math.sin(angle) * radius,
			z = -Math.cos(angle) * radius
		if (i === 0) shape.moveTo(x, z)
		else shape.lineTo(x, z)
	}
	shape.closePath()
	return new THREE.ExtrudeGeometry(shape, {
		depth: height,
		bevelEnabled: bevel > 0,
		bevelThickness: bevel,
		bevelSize: bevel,
		bevelSegments: 2,
	})
		.rotateX(Math.PI / 2)
		.translate(0, height / 2, 0)
}

// The blade: a disc with a bite out of its rim, lying flat.
function blade() {
	const { paddleRadius: r, notchRadius: n, notchAngle: a } = view
	const gap = n / r
	const shape = new THREE.Shape()
	shape.absarc(0, 0, r, a + gap, a + Math.PI * 2 - gap, false)
	shape.absarc(Math.cos(a) * r, Math.sin(a) * r, n, a - Math.PI / 2, a - (Math.PI * 3) / 2, true)
	return new THREE.ExtrudeGeometry(shape, { depth: view.paddleDepth, bevelEnabled: false })
		.translate(0, 0, -view.paddleDepth / 2)
		.rotateX(-Math.PI / 2)
}

// Carambola: a stocky stone-beaked bruiser in a cream tunic with a team band, his wooden paddle open at his side.
export function dress({ costume, torso, discY, part, detail, face, own, roots, t, materials }) {
	const { ink, cream, team } = materials
	const stone = own(makeStyleMaterial('sand'))
	const wood = own(makeStyleMaterial('driftwood'))
	const beak = ink
	const y = (h) => discY + h
	torso.material = cream
	torso.geometry = own(prism(view.bodyRadius, view.bodyHeight, t.corner / 2))
	part(prism(view.bandRadius, view.bandHeight, 0), team, 0, y(view.bandY), 0)
	for (const side of [-1, 1])
		part(
			new THREE.ConeGeometry(t.fingerRadius * 0.6, 0.22, 3).rotateX(-Math.PI / 2),
			ink,
			side * view.clawX,
			y(0.06),
			view.clawZ,
		)

	// Head: a faceted stone lump with a heavy brow and a broad chipped beak.
	part(
		new THREE.IcosahedronGeometry(view.headRadius, 0).scale(1, view.headSquash, 1),
		stone,
		0,
		y(view.headY),
		view.headZ,
	)
	face(0.52, y(1.23), -0.24)
	// A chipped cap and broad wedge replace the old little ears and conical nose.
	part(prism(0.39, 0.09, 0), stone, 0, y(1.27), -0.07)
	const bill = new THREE.Shape()
	bill.moveTo(-0.24, 0)
	bill.lineTo(0.19, 0)
	bill.lineTo(0.25, -0.14)
	bill.lineTo(0.06, -0.45)
	bill.lineTo(0, -0.5)
	bill.lineTo(-0.22, -0.18)
	bill.closePath()
	part(
		new THREE.ExtrudeGeometry(bill, { depth: 0.36, bevelEnabled: false }).rotateX(Math.PI / 2),
		beak,
		0,
		y(view.beakY),
		view.beakZ,
	)
	// Low, faceted shoulders keep the tunic's point-forward roof intact.
	for (const side of [-1, 1]) {
		part(
			new THREE.IcosahedronGeometry(0.24, 0).scale(0.72, 1.3, 0.9),
			stone,
			side * 0.43,
			y(0.69),
			0.07,
		).rotation.z = side * 0.18
	}
	detail(
		[
			new THREE.BoxGeometry(0.11, 0.025, 0.035).translate(-0.15, y(1.37), -0.13),
			new THREE.BoxGeometry(0.025, 0.012, 0.15).rotateY(-0.4).translate(0.12, y(1.37), -0.02),
		],
		cream,
	)

	// The paddle, open and out front, its worn handle running back to the fist.
	const paddle = new THREE.Group()
	paddle.position.set(view.paddleX, y(view.paddleY), view.paddleZ)
	paddle.rotation.set(view.paddleTilt, 0, -view.paddleTilt)
	costume.add(paddle)
	roots.push(paddle)
	part(blade(), wood, 0, 0, 0, paddle)
	detail(
		[-1, 1].map((side) =>
			new THREE.BoxGeometry(0.012, 0.008, 0.48).translate(
				side * 0.12,
				view.paddleDepth / 2 + 0.008,
				0,
			),
		),
		ink,
		paddle,
	)
	part(prism(view.bodyRadius, 0.1, 0), wood, 0, y(0.08), 0)
	part(
		new THREE.RingGeometry(
			view.paddleRadius - t.discBorder,
			view.paddleRadius,
			t.segments,
			1,
			view.notchAngle + view.notchRadius / view.paddleRadius,
			Math.PI * 2 - (2 * view.notchRadius) / view.paddleRadius,
		)
			.rotateX(-Math.PI / 2)
			.translate(0, view.paddleDepth / 2 + 0.002, 0),
		ink,
		0,
		0,
		0,
		paddle,
	)
	const back = view.notchAngle + Math.PI
	const reach = view.paddleRadius + view.handleLength / 2
	const handle = new THREE.Group()
	handle.position.set(Math.cos(back) * reach, 0, -Math.sin(back) * reach)
	handle.rotation.y = back
	paddle.add(handle)
	part(
		new THREE.CylinderGeometry(view.handleRadius, view.handleRadius, view.handleLength, 6).rotateZ(
			Math.PI / 2,
		),
		wood,
		0,
		0,
		0,
		handle,
	)
	part(
		new THREE.CylinderGeometry(
			view.handleRadius * 1.25,
			view.handleRadius * 1.25,
			view.wrapLength,
			6,
		).rotateZ(Math.PI / 2),
		ink,
		view.handleLength / 2 - view.wrapLength / 2,
		0,
		0,
		handle,
	)
	part(
		new THREE.SphereGeometry(t.fingerRadius * 0.8, 8, 6),
		ink,
		view.handleLength / 2 + 0.05,
		0,
		0,
		handle,
	)

	// The rolled net slung across his back, strapped at both ends.
	part(
		new THREE.CylinderGeometry(view.netRadius, view.netRadius, view.netLength, 8).rotateZ(
			Math.PI / 2,
		),
		cream,
		0,
		y(view.netY),
		view.netZ,
	)
	for (const side of [-1, 1])
		part(
			new THREE.CylinderGeometry(
				view.netRadius * 1.15,
				view.netRadius * 1.15,
				view.strapWidth,
				8,
			).rotateZ(Math.PI / 2),
			wood,
			side * (view.netLength / 2 - view.strapInset),
			y(view.netY),
			view.netZ,
		)
	const sweep = new THREE.Group()
	// A single cut of cream follows the paddle; its ink edge keeps it legible on stone.
	for (const [material, inner, outer] of [
		[ink, 0.72, 1.12],
		[cream, 0.79, 1.05],
	]) {
		const arc = part(
			new THREE.RingGeometry(inner, outer, 20, 1, 0.1, 1.8).rotateX(-Math.PI / 2),
			material,
			0,
			material === cream ? 0.012 : 0,
			0,
			sweep,
		)
		arc.rotation.y = -1.7
	}
	sweep.position.set(0, y(view.paddleY), -0.25)
	costume.add(sweep)
	roots.push(sweep)
	const motion = tune.heroes.carambola.view
	return {
		paddle,
		paddleY: y(view.paddleY),
		sweep,
		releases: Object.fromEntries(
			['bank', 'lob', 'pinball'].map((key) => [
				key,
				{ snap: motion[key].releaseSnap, recover: motion[key].releaseRecover },
			]),
		),
	}
}

// The body stays planted; the open blade carries the action's silhouette.
export function animate(
	unit,
	rig,
	{ pose, progress, alpha, time, releasing, releasePose, fire, settle, costume },
) {
	const { paddle, paddleY, sweep } = rig
	paddle.position.set(view.paddleX, paddleY, view.paddleZ)
	paddle.rotation.set(view.paddleTilt, 0, -view.paddleTilt)
	sweep.visible = false
	let action = releasing ? releasePose : pose
	let coil = pose ? poseWindup(progress) : releasing ? (1 - fire) * settle : 0
	let strike = releasing ? poseStrike(fire, settle) : 0
	const attack = unit?.attack
	if (!pose && !releasing && attack) {
		action = 'basic'
		const m = tune.heroes.carambola.view.basic
		if (attack.phase === 'windup') {
			const total = attack.total ?? ticks(unit.definition.basic.windup)
			coil = poseWindup(1 - (attack.left - alpha) / Math.max(1, total))
		} else {
			const elapsed = Math.max(0, (time - attack.startedTick) * STEP)
			const f = Math.min(1, elapsed / Math.max(STEP, m.releaseSnap))
			const s = Math.max(
				0,
				1 - Math.max(0, elapsed - m.releaseSnap) / Math.max(STEP, m.releaseRecover),
			)
			coil = (1 - f) * s
			strike = poseStrike(f, s)
		}
	}
	const m = tune.heroes.carambola.view[action]
	if (!m) return
	costume.rotation.y = -m.swingTurn * coil + m.swingTurn * 0.65 * strike
	costume.rotation.x = -m.lean * coil + m.lean * strike
	paddle.position.z += m.reach * coil - m.reach * strike
	paddle.position.x += m.reach * 0.25 * coil - m.reach * 0.4 * strike
	paddle.position.y +=
		action === 'lob' ? -m.height * 0.35 * coil + m.height * strike : m.height * coil
	paddle.rotation.y += -m.swingTurn * coil + m.swingTurn * strike
	paddle.rotation.x += action === 'lob' ? -0.6 * coil + 1.1 * strike : -0.35 * strike
	paddle.rotation.z -= m.lean * coil
	sweep.visible = strike > 0.35
	sweep.scale.setScalar(0.85 + 0.35 * strike)
	sweep.rotation.y = -m.swingTurn * strike
	sweep.rotation.x = action === 'lob' ? -0.8 : 0
}

// Zone and summon releases carry a contact fact; cancellation never produces one.
// Queue at most one per caster until the next presentation update, also on guests.
export function extras() {
	const releases = new Map()
	let last = -Infinity
	return {
		contact(fact) {
			if (fact.part === 'release' && ['lob', 'pinball'].includes(fact.ability))
				releases.set(fact.source, fact)
		},
		update({ units = [], tick }) {
			if (tick < last) releases.clear()
			last = tick
			for (const [id, fact] of releases)
				units.find((u) => u.id === id)?.body.releaseAbilityPose?.(fact.ability, fact.tick)
			releases.clear()
		},
		dispose() {
			releases.clear()
		},
	}
}
