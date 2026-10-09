import * as THREE from 'three'
import { makeStyleMaterial } from '../../core/stylepass.js'
import { tune } from './tune.js'
import { STEP } from '../../core/app.js'

// A sparring dummy's body: a burlap sack on a coil spring, a painted target, one X eye and one button eye.
// Same contract as dressHero: it hides the mannequin, keeps the inked collision disc, and returns an undress.
// Hits throw it into an underdamped wobble; strafing makes it hop and rock instead of walk.
export function dressDummy(body, _heroId, team = 'B') {
	const t = tune.silhouettes
	const v = tune.dummyView
	const original = body.visual.geometry
	const hidden = body.visual.children.map((part) => [part, part.visible])
	hidden.forEach(([part]) => (part.visible = false))
	body.visual.geometry = new THREE.BufferGeometry()
	const empty = body.visual.geometry
	body.mesh.name = 'moba-dummy'
	const costume = new THREE.Group()
	costume.name = 'moba-cast-pose'
	body.visual.add(costume)
	const teamRole = team === 'A' ? 'teamA' : 'teamB'
	const burlap = makeStyleMaterial('ammoShaft')
	const paint = makeStyleMaterial(teamRole, { flat: true })
	const cream = makeStyleMaterial('cream', { flat: true })
	const ink = makeStyleMaterial('ink', { flat: true })
	const straw = makeStyleMaterial('ammo')
	const foot = makeStyleMaterial(teamRole, { flat: true })
	const materials = [burlap, paint, cream, ink, straw, foot]
	const geometries = []
	const roots = []
	function part(g, material, x = 0, y = 0, z = 0, parent = costume) {
		geometries.push(g)
		const mesh = new THREE.Mesh(g, material)
		mesh.position.set(x, y, z)
		mesh.castShadow = true
		parent.add(mesh)
		roots.push(mesh)
		return mesh
	}
	function group(parent, x = 0, y = 0, z = 0) {
		const g = new THREE.Group()
		g.position.set(x, y, z)
		parent.add(g)
		roots.push(g)
		return g
	}

	const discY = -body.radius - body.halfHeight + t.discY
	part(
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

	// Everything above the disc pivots at the spring's foot, so a wobble rocks the whole dummy.
	const rig = group(costume, 0, discY, 0)
	rig.name = 'moba-dummy-rig'
	const helix = new THREE.Curve()
	helix.getPoint = (u, target = new THREE.Vector3()) => {
		const angle = u * v.springTurns * Math.PI * 2
		return target.set(
			Math.cos(angle) * v.springRadius,
			u * v.springHeight,
			Math.sin(angle) * v.springRadius,
		)
	}
	part(new THREE.TubeGeometry(helix, v.springTurns * 12, v.springTube, 5, false), ink, 0, 0, 0, rig)

	// The sack is a unit sphere scaled into an egg, so the painted caps follow its curve exactly.
	const sackY = v.springHeight + v.sackHalfHeight - v.springTube * 2
	const sack = group(rig, 0, sackY, 0)
	sack.scale.set(v.sackRadius, v.sackHalfHeight, v.sackRadius)
	part(new THREE.SphereGeometry(1, v.segments, v.segments), burlap, 0, 0, 0, sack)
	v.targetRings.forEach((angle, i) => {
		const cap = part(
			new THREE.SphereGeometry(1 + 0.02 * (i + 1), v.segments, 4, 0, Math.PI * 2, 0, angle).rotateX(
				-Math.PI / 2 + v.targetLift,
			),
			i === 1 ? cream : paint,
			0,
			0,
			0,
			sack,
		)
		cap.castShadow = false
	})
	// Side seams: short ink stitches across each flank, top to bottom.
	for (const side of [-1, 1])
		for (let i = 0; i < v.seamStitches; i++) {
			const polar = ((i + 1) / (v.seamStitches + 1)) * Math.PI
			const x = Math.sin(polar) * v.sackRadius,
				y = Math.cos(polar) * v.sackHalfHeight
			const stitch = part(
				new THREE.BoxGeometry(v.stitchWidth * 2, v.stitchWidth, v.stitchLength),
				ink,
				side * x,
				sackY + y,
				0,
				rig,
			)
			stitch.castShadow = false
		}

	const sackTop = sackY + v.sackHalfHeight
	part(
		new THREE.TorusGeometry(v.neckRadius, v.neckTube, 6, v.segments).rotateX(Math.PI / 2),
		ink,
		0,
		sackTop - v.neckTube,
		0,
		rig,
	)
	const headY = sackTop + v.headRadius * 0.75
	const head = group(rig, 0, headY, 0)
	part(new THREE.SphereGeometry(v.headRadius, v.segments, v.segments), burlap, 0, 0, 0, head)
	// Faces -z, like the mannequin's nose.
	const faceZ = (x, y) => -Math.sqrt(Math.max(0, v.headRadius ** 2 - x * x - y * y))
	for (const turn of [1, -1]) {
		const bar = part(
			new THREE.BoxGeometry(v.eyeSize, v.stitchWidth, v.stitchWidth * 2),
			ink,
			-v.eyeX,
			v.eyeY,
			faceZ(v.eyeX, v.eyeY),
			head,
		)
		bar.rotation.z = (turn * Math.PI) / 4
	}
	part(
		new THREE.CylinderGeometry(v.buttonRadius, v.buttonRadius, v.stitchWidth * 2, 10).rotateX(
			Math.PI / 2,
		),
		ink,
		v.eyeX,
		v.eyeY,
		faceZ(v.eyeX, v.eyeY),
		head,
	)
	part(
		new THREE.BoxGeometry(v.mouthWidth, v.stitchWidth * 0.8, v.stitchWidth * 2),
		ink,
		0,
		v.mouthY,
		faceZ(0, v.mouthY),
		head,
	)
	for (let i = 0; i < 3; i++) {
		const x = (i - 1) * v.mouthWidth * 0.35
		part(
			new THREE.BoxGeometry(v.stitchWidth * 0.8, v.stitchWidth * 2.4, v.stitchWidth * 2),
			ink,
			x,
			v.mouthY,
			faceZ(x, v.mouthY),
			head,
		)
	}
	for (let i = 0; i < v.strawCount; i++) {
		const offset = i - (v.strawCount - 1) / 2
		const tuft = part(
			new THREE.ConeGeometry(v.strawRadius, v.strawLength, 5).translate(0, v.strawLength / 2, 0),
			straw,
			0,
			v.headRadius * 0.85,
			v.headRadius * 0.15,
			head,
		)
		tuft.rotation.set(-0.25, 0, offset * v.strawFan)
	}

	// Stub arms hinge at the shoulder; the shape hangs off the hinge.
	const arms = [-1, 1].map((side) => {
		const shoulder = group(
			rig,
			side * v.sackRadius * 0.82,
			sackY - v.sackHalfHeight + v.sackHalfHeight * 2 * v.armY,
			0,
		)
		part(
			new THREE.CapsuleGeometry(v.armRadius, v.armLength, 4, 10)
				.rotateZ(Math.PI / 2)
				.translate((side * v.armLength) / 2, 0, 0),
			burlap,
			0,
			0,
			0,
			shoulder,
		)
		return { shoulder, side }
	})

	// Wobble is the top's tilt in world x/z; it's turned into the dummy's own frame each frame.
	const wobble = { x: 0, z: 0, vx: 0, vz: 0 }
	let lastTime = null,
		hop = 0,
		lean = 0
	const last = new THREE.Vector3().copy(body.mesh.position)
	function push(direction, speed) {
		const length = Math.hypot(direction.x, direction.z)
		if (!(length > 1e-4) || !Number.isFinite(speed)) return
		wobble.vx += (direction.x / length) * speed
		wobble.vz += (direction.z / length) * speed
	}
	function step(dt) {
		const w = v.wobbleFrequency,
			c = 2 * v.wobbleDamping * w
		// Semi-implicit Euler in small steps stays stable across slow frames.
		for (let left = dt; left > 1e-6; left -= 1 / 240) {
			const h = Math.min(left, 1 / 240)
			wobble.vx += (-w * w * wobble.x - c * wobble.vx) * h
			wobble.vz += (-w * w * wobble.z - c * wobble.vz) * h
			wobble.x += wobble.vx * h
			wobble.z += wobble.vz * h
		}
		const tilt = Math.hypot(wobble.x, wobble.z)
		if (tilt > v.wobbleMax) {
			wobble.x *= v.wobbleMax / tilt
			wobble.z *= v.wobbleMax / tilt
		}
	}

	// A hit rocks the top away from the shot.
	body.wobble = (direction) => push(direction ?? { x: 0, z: 1 }, v.wobbleHit)
	body.resetAbilityPose = () => {
		wobble.x = wobble.z = wobble.vx = wobble.vz = 0
		lean = 0
		rig.rotation.set(0, 0, 0)
		rig.position.y = discY
		for (const arm of arms) arm.shoulder.rotation.set(0, 0, -arm.side * v.armDroop)
	}
	// The Loose leaves with a lurch toward its target.
	body.releaseAbilityPose = () => {
		const yaw = body.mesh.rotation.y
		push({ x: -Math.sin(yaw), z: -Math.cos(yaw) }, v.wobbleRelease)
	}
	body.poseAbility = (cast, alpha = 0, unit = null, tick = 0) => {
		if (unit?.dead) return
		const time = (tick + alpha) * STEP
		const dt = lastTime === null ? 0 : Math.max(0, Math.min(0.1, time - lastTime))
		lastTime = time
		step(dt)
		const p = body.mesh.position
		const moved = Math.hypot(p.x - last.x, p.z - last.z)
		last.copy(p)
		const moving = dt > 0 && moved < 1 ? Math.min(1, moved / dt / tune.dummies.speed) : 0
		hop += moved < 1 ? (moved / v.hopStride) * Math.PI : 0
		const progress = cast
			? Math.max(0, Math.min(1, 1 - (cast.left - alpha) / Math.max(1, cast.total)))
			: 0
		lean += ((cast ? progress : 0) - lean) * (1 - Math.exp(-12 * dt))
		const yaw = body.mesh.rotation.y,
			c = Math.cos(yaw),
			s = Math.sin(yaw)
		// World tilt into local: x' = c·x − s·z, z' = s·x + c·z.
		const localX = c * wobble.x - s * wobble.z,
			localZ = s * wobble.x + c * wobble.z
		const bounce = Math.abs(Math.sin(hop))
		rig.position.y = discY + bounce * v.hopHeight * moving
		rig.rotation.set(localZ + v.castLean * lean, 0, -localX + Math.sin(hop) * v.hopRock * moving)
		const flail = Math.hypot(wobble.vx, wobble.vz) * v.armFlail
		arms.forEach(({ shoulder, side }, i) => {
			const swing = Math.sin(time * v.wobbleFrequency * 1.3 + i * Math.PI) * flail
			shoulder.rotation.set(0, 0, -side * (v.armDroop - v.castArms * lean - swing))
		})
	}
	body.resetAbilityPose()

	let disposed = false
	return () => {
		if (disposed) return
		disposed = true
		for (const root of roots) root.removeFromParent()
		for (const g of geometries) g.dispose()
		for (const material of materials) material.dispose()
		costume.removeFromParent()
		empty.dispose()
		delete body.wobble
		delete body.resetAbilityPose
		delete body.releaseAbilityPose
		delete body.poseAbility
		body.visual.geometry = original
		hidden.forEach(([part, visible]) => (part.visible = visible))
	}
}
