import * as THREE from 'three'
import { STEP } from '../../../../core/app.js'
import { makeStyleMaterial } from '../../../../core/stylepass.js'
import { tune } from '../../tune.js'
import { look } from '../../look.js'
import { poseWindup, poseStrike } from '../../pose-curve.js'
import { createMandadorCutouts } from './mandador-cutout-view.js'
import { createMandadorMarks } from './mandador-marks.js'

// The original flat bar and megaphone, with a separate raised hand for the save.
export function dress({ torso, part, detail, face, own, discY, t, materials }) {
	const board = new THREE.Shape()
	const x = t.mandadorWidth / 2,
		h = t.mandadorHeight
	board.moveTo(-x, 0)
	board.lineTo(x, 0)
	board.lineTo(x, h - 0.14)
	board.lineTo(x - 0.16, h)
	board.lineTo(0.05, h)
	board.lineTo(-0.02, h - 0.12)
	board.lineTo(-0.12, h)
	board.lineTo(-x, h)
	board.closePath()
	torso.geometry = own(
		new THREE.ExtrudeGeometry(board, { depth: t.mandadorDepth, bevelEnabled: false }).translate(
			0,
			0,
			-t.mandadorDepth / 2,
		),
	)
	const wood = own(makeStyleMaterial('driftwood'))
	face(0.88, discY + h - 0.14, -0.13)
	detail(
		[
			new THREE.BoxGeometry(0.025, h - 0.32, 0.014).translate(-0.3, discY + h * 0.46, -0.132),
			new THREE.BoxGeometry(0.022, h - 0.42, 0.014).translate(0.37, discY + h * 0.44, -0.132),
			new THREE.BoxGeometry(t.mandadorWidth, 0.13, t.mandadorDepth + 0.012).translate(
				0,
				discY + 0.09,
				0,
			),
		],
		wood,
	)
	// A hollow speaking-trumpet, with its mouth and rolled lip parented to the flare.
	const cone = part(
		new THREE.CylinderGeometry(t.megaphoneRadius, 0.075, t.megaphoneLength, 12, 1, true).rotateX(
			-Math.PI / 2,
		),
		materials.team,
		0,
		t.megaphoneY,
		t.megaphoneZ,
	)
	part(
		new THREE.TorusGeometry(t.megaphoneRadius - 0.018, 0.025, 4, 12),
		materials.team,
		0,
		0,
		-t.megaphoneLength / 2,
		cone,
	)
	part(
		new THREE.CircleGeometry(t.megaphoneRadius - 0.045, 12),
		materials.ink,
		0,
		0,
		-t.megaphoneLength / 2 + 0.025,
		cone,
	).rotation.y = Math.PI
	const hand = part(
		new THREE.SphereGeometry(t.fingerRadius, t.segments, 6),
		materials.cream,
		t.mandadorWidth / 2,
		discY + t.mandadorHeight * 0.6,
		0,
	)
	// The ink pass outlines the board; the old expanded shell hid its entire painted face.
	return { cone, hand, border: false }
}
const POSES = { mandadorPass: 'pass', mandadorTag: 'tag', mandadorRed: 'rally' }
// A cast that reached its last stretch counts as released when it ends; an earlier end was a cancel and snaps nothing.
const RELEASED = 0.6
const memory = new WeakMap() // unit → the cast it last posed: { kind, progress, time, releasedAt }
const clamp01 = (x) => Math.max(0, Math.min(1, x))

// What the board is doing now: the spec it follows and how far it has coiled (0..1+) and struck. Casts coil with their
// progress and snap when they end; the basic coils over its windup and snaps into its backswing. null: at rest.
function actionOf(unit, pose, progress, time, alpha) {
	const poses = tune.heroes.mandador.view.pose
	const attack = unit?.attack
	if (attack?.phase === 'windup') {
		const p = 1 - (attack.left - alpha) / Math.max(1, attack.total ?? 1)
		return { spec: poses.basic, coil: poseWindup(p), strike: 0, hop: 0 }
	}
	if (attack?.phase === 'backswing') {
		const spec = poses.basic
		const ticks = Math.round(tune.tennisBall.backswing / STEP)
		return released(spec, (ticks - attack.left + alpha) * STEP)
	}
	const kind = POSES[pose]
	if (!unit)
		return kind ? { spec: poses[kind], coil: poseWindup(progress), strike: 0, hop: 0 } : null
	let rec = memory.get(unit)
	if (rec && time < rec.time) rec = null // a replay seek or a restart
	if (kind) {
		memory.set(unit, { kind, progress, time, releasedAt: null })
		return { spec: poses[kind], coil: poseWindup(progress), strike: 0, hop: 0 }
	}
	if (!rec) return null
	if (rec.releasedAt == null && rec.kind && rec.progress >= RELEASED && time - rec.time < 6)
		rec.releasedAt = time
	rec.time = time
	rec.kind = rec.releasedAt == null ? null : rec.kind
	memory.set(unit, rec)
	if (rec.releasedAt == null) return null
	const out = released(poses[rec.kind], (time - rec.releasedAt) * STEP)
	if (!out) memory.delete(unit)
	return out
}

// `seconds` after the release: the snap runs to 1 and the coil it came from lets go; null once settled.
function released(spec, seconds) {
	const fire = clamp01(seconds / Math.max(STEP, spec.snap))
	const settle = 1 - clamp01((seconds - spec.snap) / Math.max(STEP, spec.recover))
	if (settle <= 0) return null
	return {
		spec,
		coil: (1 - fire) * settle,
		strike: poseStrike(fire, settle),
		hop: Math.sin(Math.PI * fire) * settle,
	}
}

export function animate(unit, rig, { pose, progress, alpha, time, costume }) {
	const t = look.silhouettes
	const base = -t.mandadorHeight / 2 + t.mandadorHeight * 0.6
	rig.hand.position.y = base
	rig.hand.position.z = 0
	rig.cone.rotation.x = 0
	costume.position.set(0, 0, 0)
	costume.scale.set(1, 1, 1)
	const action = actionOf(unit, pose, progress, time, alpha)
	if (!action) return
	const { spec, coil, strike, hop } = action
	costume.rotation.x = spec.back * coil - spec.forward * strike
	costume.rotation.z = (spec.roll ?? 0) * coil - (spec.rollStrike ?? 0) * strike
	rig.hand.position.z = (spec.handBack ?? 0) * coil - (spec.handReach ?? 0) * strike
	rig.hand.position.y = base + (spec.handLift ?? 0) * coil - (spec.handDrop ?? 0) * strike
	rig.cone.rotation.x = (spec.cone ?? 0) * coil + (spec.coneStrike ?? 0) * strike
	const crouch = (spec.crouch ?? 0) * coil
	costume.scale.set(1 + crouch * 0.4, 1 - crouch + (spec.stretch ?? 0) * strike, 1)
	costume.position.y = (spec.hop ?? 0) * hop
}

// Everything the hero draws beyond its body: the swap tether and marks, the status marks, and the out-of-play cutouts.
export function extras(scene) {
	const cutouts = createMandadorCutouts(scene)
	const marks = createMandadorMarks(scene)
	return {
		update(frame) {
			cutouts.update(frame)
			marks.update(frame)
		},
		contact: (fact) => marks.contact(fact),
		dispose() {
			cutouts.dispose()
			marks.dispose()
		},
	}
}
