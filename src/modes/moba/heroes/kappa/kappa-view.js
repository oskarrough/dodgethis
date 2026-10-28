import * as THREE from 'three'
import { makeStyleMaterial } from '../../../../core/stylepass.js'
import { STEP } from '../../../../core/app.js'
import { tune } from '../../tune.js'
import { stateUntil } from '../../statuses.js'
import { createEffects } from '../../effects.js'
import { poseStrike, poseWindup } from '../../pose-curve.js'
import { PALETTE } from '../../../../core/style.js'

// Kappa's pocket ring and glove poses, in metres and radians.
const view = {
	segments: 48,
	pocketY: 0.015,
	pocketRadius: 0.6,
	pocketWidth: 0.055,
	beltY: 0.22, // the team belt round the block, proud of its ink border
	beltHeight: 0.2,
	beltProud: 0.18,
	gloveLift: 0.5,
	gloveTurn: 0.5,
	// Toss: the glove loads back and high with the body coiled behind it, holds taut, then throws through and follows on.
	tossPull: 0.9,
	tossLift: 0.55,
	tossLean: 0.3, // back while loading, forward through the throw
	tossLeanThrough: 0.4,
	tossTwist: 0.6,
	tossTurn: 0.45,
	tossReach: 1.05,
	tossHop: 0.14, // the body steps into the throw
	tossLoad: 0.5, // fraction of the cast point the coil takes to load
	tossSnap: 0.07,
	tossRecover: 0.3,
	// Glove Slap: the hand cocks out and back, lunges across in the last of the windup so it lands as the hit does,
	// holds there a beat, then comes home over the backswing.
	slapCock: { x: 0.38, y: 0.22, z: 0.55 },
	slapReach: { x: -0.5, y: 0.08, z: -1.1 },
	slapTwist: 0.55,
	slapTurn: 1.1,
	slapLunge: 0.12,
	slapLoad: 0.55, // fraction of the windup spent coiling; the rest is the lunge
	slapHold: 0.25, // fraction of the backswing the glove stays out
	slapOvershoot: 0.12,
	// Catch: the palm snaps up, braces, and drops again as the window closes.
	catchRaise: 0.09,
	catchLower: 0.15,
	catchBrace: 0.12,
	// Catching something: the glove clamps, the body rocks back, the shot sits in the palm as a ball.
	clamp: 0.24,
	clampSquash: 0.3,
	clampRock: 0.2,
	ballRadius: 0.2,
	ballRise: 0.14,
	ballBob: 0.03,
	pocketWarn: 1.5, // seconds left when the ball starts to pulse
	cradle: { y: 0.2, z: -0.12 },
	// Dive: a low flat lunge, then lying out, then the spring up as the prone ends.
	diveLean: 1.3,
	diveSnap: 0.06,
	diveReach: 0.95,
	proneTurn: Math.PI / 2,
	getUp: 0.1, // seconds before the prone ends that the body springs back up
	getUpOvershoot: 0.18,
	// The marks the view draws itself.
	catchRing: { from: 2.1, to: 0.55, life: 0.26, width: 0.09 },
	catchFlare: { size: 1.1, life: 0.2, y: 0.9 },
	throwStreak: { from: 0.9, to: 4, width: 0.32, life: 0.15, y: 0.95 },
	diveStreak: { width: 0.55, life: 0.32, y: 0.32 },
	diveScuff: { count: 7, from: 0.4, to: 1.5, inner: 0.35, width: 0.2, life: 0.22 },
	diveLanding: { count: 9, from: 0.5, to: 1.9, inner: 0.4, width: 0.24, life: 0.28, opacity: 0.7 },
	cream: '#fff7e6',
}

const clamp01 = (x) => Math.max(0, Math.min(1, x))
const easeOut = (x) => 1 - (1 - x) ** 3

// Kappa's costume: the rounded block with a team belt, the glove and the pocket ring under his feet.
export function dress({
	costume,
	torso,
	footDisc,
	discY,
	part,
	detail,
	face,
	own,
	rounded,
	roots,
	t,
	materials,
}) {
	const { glove: gloveMaterial, pocket: pocketMaterial, team, ink, skin } = materials
	const shell = rounded(t.kappaWidth, t.kappaDepth, t.kappaHeight)
	const points = shell.attributes.position
	for (let i = 0; i < points.count; i++) {
		const x = points.getX(i),
			z = points.getZ(i)
		if (points.getY(i) > 0) {
			points.setXYZ(i, x * 0.9, 0.2, z * 0.9)
			if (x < -0.22 && z < -0.18) points.setY(i, 0.1)
		}
	}
	shell.computeVertexNormals()
	torso.geometry = own(shell)
	face(0.72, discY + 0.63, -0.37)
	const shellTop = own(makeStyleMaterial('sand'))
	part(
		new THREE.CylinderGeometry(0.34, 0.45, 0.1, 8).scale(1, 1, 0.88),
		shellTop,
		0,
		discY + 0.65,
		0,
	)
	// The horns replace roof height rather than growing the costume's bounds.
	detail(
		[-1, 1].map((side) =>
			new THREE.ConeGeometry(0.075, 0.22, 4).translate(side * 0.29, discY + 0.69, -0.16),
		),
		materials.cream,
	)
	const wear = rounded(t.kappaWidth, t.kappaDepth, 0.12).translate(0, discY + 0.1, 0)
	const normals = wear.attributes.normal
	for (let i = 0; i < normals.count; i++) normals.setXYZ(i, 0, -1, 0)
	part(wear, skin)
	detail(
		[
			new THREE.BoxGeometry(0.02, 0.012, 0.16).rotateY(-0.4).translate(-0.15, discY + 0.703, 0.1),
			new THREE.BoxGeometry(0.12, 0.012, 0.022).rotateY(-0.5).translate(0.13, discY + 0.703, -0.1),
		],
		ink,
	)
	part(
		rounded(t.kappaWidth + view.beltProud, t.kappaDepth + view.beltProud, view.beltHeight),
		team,
		0,
		discY + view.beltY,
		0,
	)
	const glove = new THREE.Group()
	glove.name = 'moba-glove'
	costume.add(glove)
	roots.push(glove)
	detail(
		[-1, 1].map((side) =>
			new THREE.BoxGeometry(0.018, 0.016, t.gloveDepth * 0.72).translate(
				t.gloveX + side * 0.17,
				discY + t.kappaHeight / 2 + t.fingerRadius + 0.01,
				t.gloveZ,
			),
		),
		ink,
		glove,
	)
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
		discY + t.kappaHeight / 2,
		t.gloveZ,
		glove,
	)
	for (let i = 0; i < t.fingerCount; i++)
		part(
			new THREE.SphereGeometry(t.fingerRadius, 8, 6),
			gloveMaterial,
			t.gloveX + (i - (t.fingerCount - 1) / 2) * t.fingerSpacing,
			discY + t.kappaHeight / 2,
			t.gloveZ - t.gloveDepth / 2,
			glove,
		)
	part(
		new THREE.SphereGeometry(t.fingerRadius, 8, 6),
		gloveMaterial,
		t.gloveX - t.gloveWidth / 2 - t.fingerRadius,
		discY + t.kappaHeight / 2,
		t.gloveZ + t.gloveDepth / 2,
		glove,
	)
	// The caught shot, cradled on the palm in the colour of whoever threw it.
	const balls = ['teamA', 'teamB'].map((role) => own(makeStyleMaterial(role, { flat: true })))
	const ballAt = {
		x: t.gloveX,
		y: discY + t.kappaHeight / 2 + t.fingerRadius + view.ballRise,
		z: t.gloveZ,
	}
	const ball = part(
		new THREE.SphereGeometry(view.ballRadius, 12, 8),
		balls[0],
		ballAt.x,
		ballAt.y,
		ballAt.z,
		glove,
	)
	ball.name = 'moba-pocket-ball'
	ball.visible = false
	return {
		glove,
		pocketRing,
		ball,
		balls,
		ballAt,
		releases: { toss: { snap: view.tossSnap, recover: view.tossRecover } },
		// Frame state for the marks that fire on an edge (a catch landing, a dive starting).
		edge: { pocket: undefined, clampAt: -Infinity, diveAt: -Infinity, last: -Infinity },
	}
}

// Releases the view saw, for the marks `extras` draws. Only filled while a scene's extras are listening.
const releases = []
let listening = 0

// Every frame: the ring counts the pocket's life down, the ball sits in the glove while it holds a shot, and the body
// carries Toss, Catch, Dive, prone and the slap. Each pose coils or loads first, strikes past its mark, then settles.
export function animate(
	unit,
	rig,
	{ pose, progress, alpha, time, releasing, releasePose, fire, settle, costume, mesh, team },
) {
	const { glove, pocketRing, ball, balls, ballAt, edge } = rig
	const pocket = unit?.abilityState?.pocket
	if (time < edge.last)
		Object.assign(edge, { pocket: undefined, clampAt: -Infinity, diveAt: -Infinity })
	edge.last = time
	pocketRing.visible = !!pocket
	ball.visible = !!pocket
	if (pocket) {
		const left = (pocket.until - time) * STEP
		const fraction = Math.max(0, Math.min(1, left / tune.catching.pocketLife))
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
		// The ball wears the thrower's colour, bobs, and pulses faster as the pocket runs out.
		ball.material = balls[(pocket.team ?? team) === 'A' ? 0 : 1]
		const warn = left < view.pocketWarn ? 1 - Math.max(0, left) / view.pocketWarn : 0
		const seconds = time * STEP
		ball.position.set(ballAt.x, ballAt.y + view.ballBob * Math.sin(seconds * 6), ballAt.z)
		ball.scale.setScalar(1 + warn * 0.22 * Math.sin(seconds * (14 + warn * 14)))
	}
	// A new pocket is a catch landing: the glove clamps.
	const key = pocket?.until ?? null
	if (key !== edge.pocket) {
		if (key !== null && edge.pocket !== undefined) edge.clampAt = time
		edge.pocket = key
	}
	costume.position.set(0, 0, 0)
	glove.position.set(0, 0, 0)
	glove.rotation.set(0, 0, 0)
	glove.scale.setScalar(1)
	const dashing = !!unit?.body?.dashing && unit.dashAbility === 'dive'
	if (dashing && edge.diveAt === -Infinity) edge.diveAt = time
	if (!dashing) edge.diveAt = -Infinity
	const catching = unit?.stance?.ability === 'catch' && unit.catchWindow
	if (pose === 'toss' || (releasing && releasePose === 'toss')) {
		const loading = pose === 'toss'
		const coil = loading
			? poseWindup(progress, { load: view.tossLoad, overshoot: 0.14 })
			: 1 - easeOut(clamp01(fire))
		const through = loading ? 0 : poseStrike(fire, settle)
		glove.position.set(0, view.tossLift * coil, view.tossPull * coil - view.tossReach * through)
		glove.rotation.y = view.tossTurn * coil - view.tossTurn * through
		glove.rotation.x = -view.tossTurn * through
		costume.rotation.x = view.tossLean * coil - view.tossLeanThrough * through
		costume.rotation.y = -view.tossTwist * coil + view.tossTwist * through
		costume.position.z = 0.08 * coil - view.tossHop * through
		if (!loading && !rig.threw) {
			rig.threw = true
			if (listening) releases.push({ mesh, from: 'toss' })
		}
		if (loading || !releasing) rig.threw = false
	} else if (catching) {
		const duration = tune.catch.duration
		const elapsed = (time - (unit.stance.until - duration / STEP)) * STEP
		const raise = poseStrike(clamp01(elapsed / view.catchRaise), 1, { overshoot: 0.3 })
		const lower = clamp01((duration - elapsed) / view.catchLower)
		glove.position.y = view.gloveLift * raise * lower
		glove.rotation.z = -view.gloveTurn * raise
		const direction = unit.catchWindow?.dir ?? unit.stance.dir
		if (direction)
			glove.rotation.y = Math.atan2(direction.x, direction.z) + Math.PI - mesh.rotation.y
		costume.rotation.x = view.catchBrace * raise * lower
	} else if (dashing) {
		const snap = easeOut(clamp01(((time - edge.diveAt) * STEP) / view.diveSnap))
		costume.rotation.x = -view.diveLean * snap
		glove.position.set(0, 0.05 * snap, -view.diveReach * snap)
		glove.rotation.x = -0.5 * snap
	} else if (time < stateUntil(unit, 'prone')) {
		const left = (stateUntil(unit, 'prone') - time) * STEP
		const rise = clamp01(1 - left / view.getUp)
		const lie = 1 - easeOut(rise)
		costume.rotation.x =
			-view.proneTurn * lie + view.getUpOvershoot * Math.sin(Math.PI * rise) * (rise < 1 ? 1 : 0)
		glove.position.z = -view.diveReach * 0.5 * lie
	} else if (unit?.attack) {
		const { attack } = unit
		let cock = 0, // how far the hand is cocked back, 0 at rest
			strike = 0 // how far it has come across: 1 at the hit, a touch past on the follow-through
		if (attack.phase === 'windup') {
			const p = clamp01(1 - (attack.left - alpha) / Math.max(1, attack.total))
			cock = poseWindup(Math.min(1, p / view.slapLoad), { load: 0.7, overshoot: 0.1 })
			strike = clamp01((p - view.slapLoad) / (1 - view.slapLoad)) ** 2
		} else {
			const back = Math.max(1, Math.round(tune.gloveSlap.backswing / STEP))
			const r = clamp01(1 - (attack.left - alpha) / back)
			const home = clamp01((r - view.slapHold) / (1 - view.slapHold))
			const out = r < view.slapHold ? Math.sin((Math.PI * r) / view.slapHold) : 0
			strike = 1 - home * home * (3 - 2 * home) + view.slapOvershoot * out
		}
		// The cocked hand gives way to the lunge, so the hand travels one arc.
		const held = cock * (1 - Math.min(1, strike))
		for (const axis of ['x', 'y', 'z'])
			glove.position[axis] = view.slapCock[axis] * held + view.slapReach[axis] * strike
		glove.rotation.y = view.slapTurn * held - view.slapTurn * strike
		costume.rotation.y = -view.slapTwist * held + view.slapTwist * strike
		costume.position.z = -view.slapLunge * strike
	} else if (pocket) {
		glove.position.set(0, view.cradle.y, view.cradle.z)
	}
	// Catching something: the glove snaps shut and the body rocks back from the weight of it.
	const clampK = ((time - edge.clampAt) * STEP) / view.clamp
	if (clampK >= 0 && clampK < 1) {
		glove.scale.setScalar(
			1 - view.clampSquash * Math.sin(clampK * Math.PI * 2.2) * Math.sqrt(1 - clampK),
		)
		costume.rotation.x += view.clampRock * (1 - clampK) ** 2
	}
}

// The marks Kappa draws for himself: the catch ring pulling in, the line a throw leaves, the dive's launch, streak and landing.
// Built from the units each frame, so a guest draws the same ones from its snapshot.
export function extras(scene) {
	const effects = createEffects(scene)
	const seen = new Map() // hero id → { pocket, diving, from }
	const forward = new THREE.Vector3()
	const live = new Set()
	let last = -Infinity
	listening++
	return {
		update({ units = [], tick, alpha = 0, dt }) {
			const now = tick + alpha
			if (now < last) {
				releases.length = 0
				effects.reset()
				seen.clear()
			}
			last = now
			live.clear()
			for (const unit of units) {
				if (unit.heroId !== 'kappa' || unit.dead) continue
				live.add(unit.id)
				const p = unit.body.position
				const state = seen.get(unit.id) ?? { pocket: undefined, diving: false, from: null }
				seen.set(unit.id, state)
				const pocket = unit.abilityState?.pocket
				const key = pocket?.until ?? null
				if (state.pocket !== undefined && key !== null && key !== state.pocket) {
					const color = PALETTE[(pocket.team ?? unit.team) === 'A' ? 'teamA' : 'teamB']
					const at = { x: p.x, z: p.z }
					effects.ring(at, { color, ...view.catchRing, y: 0.07 })
					effects.flare(at, { color: view.cream, streak: 0, ...view.catchFlare })
				}
				state.pocket = key
				const diving = !!unit.body.dashing && unit.dashAbility === 'dive'
				if (diving && !state.diving) {
					state.from = { x: p.x, z: p.z }
					effects.spokes(state.from, { color: view.cream, ...view.diveScuff, turn: tick * 0.7 })
				} else if (!diving && state.diving && state.from) {
					const to = { x: p.x, z: p.z }
					effects.streak(state.from, to, { color: view.cream, ...view.diveStreak })
					effects.spokes(to, { color: view.cream, ...view.diveLanding, turn: tick * 0.7 })
				}
				state.diving = diving
			}
			for (const id of seen.keys()) if (!live.has(id)) seen.delete(id)
			for (const release of releases.splice(0)) {
				const { mesh } = release
				mesh.getWorldDirection(forward)
				const at = mesh.position
				const point = (d) => ({ x: at.x - forward.x * d, z: at.z - forward.z * d })
				effects.streak(point(view.throwStreak.from), point(view.throwStreak.to), {
					color: view.cream,
					width: view.throwStreak.width,
					life: view.throwStreak.life,
					y: view.throwStreak.y,
				})
			}
			effects.update(dt)
		},
		dispose() {
			listening--
			releases.length = 0
			effects.dispose()
		},
	}
}
