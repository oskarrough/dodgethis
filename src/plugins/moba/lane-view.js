import * as THREE from 'three'
import { makeStyleMaterial } from '../../core/stylepass.js'
import { tune } from './tune.js'

export function createLaneView(scene, smooth = null) {
	const bodies = new Set()
	const cameraFacing = new THREE.Quaternion()
	const pitchAxis = new THREE.Vector3(1, 0, 0)
	function makeBody(x, z, team, kind) {
		const v = tune.laneView
		const tower = kind === 'tower'
		const radius = tower ? tune.tower.radius : tune.waves.radius
		const halfHeight = tower ? v.towerHeight / 2 : v.minionHeight / 2
		const mesh = new THREE.Group()
		const visual = new THREE.Group()
		mesh.add(visual)
		const owned = []
		const material = (role) => {
			const m = makeStyleMaterial(role)
			owned.push(m)
			return m
		}
		const teamMaterial = material(team === 'A' ? 'teamA' : 'teamB')
		const ink = material('ink'),
			cream = material('cream')
		function part(geometry, mat, y) {
			owned.push(geometry)
			const object = new THREE.Mesh(geometry, mat)
			object.position.y = y
			object.castShadow = true
			visual.add(object)
			return object
		}
		if (tower) {
			part(
				new THREE.CylinderGeometry(radius, radius, v.drumHeight, v.segments),
				ink,
				-halfHeight + v.drumHeight / 2,
			)
			part(
				new THREE.CylinderGeometry(
					radius * v.shaftTop,
					radius * v.shaftBottom,
					v.shaftHeight,
					v.segments,
				),
				teamMaterial,
				v.shaftY,
			)
			part(new THREE.ConeGeometry(v.flagRadius, v.flagHeight, v.flagSides), teamMaterial, v.flagY)
		} else {
			part(
				new THREE.CapsuleGeometry(radius, v.minionHeight - radius * 2, v.capSegments, v.segments),
				teamMaterial,
				0,
			)
			part(new THREE.BoxGeometry(v.footWidth, v.footHeight, v.footDepth), ink, -halfHeight)
			if (kind === 'wizard')
				part(new THREE.ConeGeometry(v.hatRadius, v.hatHeight, v.flagSides), cream, halfHeight)
			else if (kind === 'ranged') {
				const stick = part(
					new THREE.CylinderGeometry(v.stickRadius, v.stickRadius, v.stickHeight, v.flagSides),
					cream,
					0,
				)
				stick.position.x = radius
			} else {
				const shield = part(
					new THREE.CylinderGeometry(v.shieldRadius, v.shieldRadius, v.shieldDepth, v.segments),
					cream,
					0,
				)
				shield.rotation.x = Math.PI / 2
				shield.position.z = -radius
			}
		}
		let tell = null
		if (!tower) {
			const shape =
				kind === 'melee'
					? new THREE.CircleGeometry(v.tellSize / 2, 3)
					: kind === 'ranged'
						? new THREE.PlaneGeometry(v.tellSize, v.tellSize * v.tellRangedHeight)
						: new THREE.CircleGeometry(v.tellSize / 2, 5)
			owned.push(shape)
			tell = new THREE.Group()
			tell.name = `moba-${kind}-tell`
			tell.rotation.x = -Math.atan2(tune.follow.height, tune.follow.back)
			tell.position.y = halfHeight + v.tellLift
			const back = new THREE.Mesh(shape, ink),
				fill = new THREE.Mesh(shape, cream)
			fill.position.z = v.tellLayer
			tell.add(back, fill)
			tell.visible = false
			mesh.add(tell)
		}
		const pose = {
			position: new THREE.Vector3(x, halfHeight, z),
			quaternion: new THREE.Quaternion(),
		}
		mesh.position.copy(pose.position)
		scene.add(mesh)
		const unsmooth = smooth?.(mesh, () => pose)
		let helpTether = null
		if (!tower) {
			const geometry = new THREE.BoxGeometry(v.tetherWidth, v.tetherHeight, 1)
			owned.push(geometry)
			helpTether = new THREE.Mesh(geometry, teamMaterial)
			helpTether.name = 'moba-help-tether'
			helpTether.visible = false
			scene.add(helpTether)
		}
		const body = {
			position: pose.position,
			mesh,
			visual,
			radius,
			halfHeight,
			retire() {
				if (!tower) {
					mesh.visible = false
					return
				}
				visual.visible = false
				const geometry = new THREE.CylinderGeometry(
					radius * v.rubbleRadius,
					radius,
					v.rubbleHeight,
					v.segments,
				)
				owned.push(geometry)
				const rubble = new THREE.Mesh(geometry, ink)
				rubble.position.y = -halfHeight + v.rubbleHeight / 2
				mesh.add(rubble)
			},
			squeeze: 0,
			recoil: 0,
			squash(amount) {
				body.squeeze = amount
			},
			kick(amount) {
				body.recoil = amount
			},
			face(yaw) {
				pose.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
			},
			dispose() {
				unsmooth?.()
				scene.remove(mesh)
				if (helpTether) scene.remove(helpTether)
				for (const item of owned) item.dispose()
				bodies.delete(body)
			},
			pose,
			tell,
			helpTether,
			aggroFlash: 0,
		}
		bodies.add(body)
		return body
	}
	const group = new THREE.Group()
	scene.add(group)
	const marks = new Map()
	function update(lane, heroes, alpha, locate, dt = 0) {
		const v = tune.laneView
		cameraFacing.setFromAxisAngle(pitchAxis, -Math.atan2(tune.follow.height, tune.follow.back))
		for (const unit of [...lane.structures, ...lane.minions]) {
			unit.body.squeeze *= Math.exp(-v.feedbackDecay * dt)
			unit.body.recoil *= Math.exp(-v.feedbackDecay * dt)
			const progress = unit.attack
				? 1 - Math.max(0, unit.attack.left - alpha) / unit.attack.total
				: 0
			// Separate attack silhouettes: drum charge, shield jab, stick lean, hat lift.
			const visual = unit.body.visual
			visual.scale.set(1, 1, 1)
			visual.rotation.x = 0
			visual.position.y = 0
			if (unit.kind === 'tower') visual.scale.x = visual.scale.z = 1 + progress * v.towerCharge
			else if (unit.kind === 'melee') visual.rotation.x = progress * v.meleePose
			else if (unit.kind === 'ranged') visual.rotation.x = -progress * v.rangedPose
			else visual.position.y = progress * v.wizardPose
			visual.scale.y *= Math.max(0.1, 1 - unit.body.squeeze)
			visual.position.z = unit.body.recoil
			const tell = unit.body.tell
			if (tell) {
				tell.visible = !unit.dead && !!unit.attack
				tell.quaternion.copy(unit.body.mesh.quaternion).invert().multiply(cameraFacing)
				tell.children[1].scale.setScalar(v.tellInset * (v.tellStart + (1 - v.tellStart) * progress))
			}
			unit.body.aggroFlash = Math.max(0, unit.body.aggroFlash - dt)
			const flash = unit.body.aggroFlash / v.aggroLife
			const helpTether = unit.body.helpTether
			if (helpTether) {
				const target = locate(unit.target),
					p = unit.body.mesh.position
				helpTether.visible = !unit.dead && flash > 0 && !!target
				if (target) {
					helpTether.position.set((p.x + target.x) / 2, v.tetherY, (p.z + target.z) / 2)
					helpTether.rotation.y = Math.atan2(target.x - p.x, target.z - p.z)
					helpTether.scale.set(
						1 + flash * v.aggroWidth,
						1,
						Math.hypot(target.x - p.x, target.z - p.z),
					)
				}
			}
			if (unit.kind !== 'tower') continue
			let mark = marks.get(unit.id)
			if (!mark) {
				const material = makeStyleMaterial(unit.team === 'A' ? 'teamA' : 'teamB', { flat: true })
				const geometry = new THREE.RingGeometry(
					1 - v.ringWidth / tune.tower.range,
					1,
					v.ringSegments,
				).rotateX(-Math.PI / 2)
				const ring = new THREE.Mesh(geometry, material)
				const tetherGeometry = new THREE.BoxGeometry(v.tetherWidth, v.tetherHeight, 1)
				const tether = new THREE.Mesh(tetherGeometry, material)
				group.add(ring, tether)
				marks.set(unit.id, (mark = { ring, tether, geometry, tetherGeometry, material }))
			}
			const p = unit.body.mesh.position
			mark.ring.position.set(p.x, v.ringY, p.z)
			mark.ring.scale.setScalar(tune.tower.range)
			mark.ring.visible =
				!unit.dead &&
				heroes.some(
					(h) =>
						!h.dead &&
						h.team !== unit.team &&
						Math.hypot(h.body.mesh.position.x - p.x, h.body.mesh.position.z - p.z) <=
							tune.tower.range + tune.tower.ringNear,
				)
			const target = locate(unit.target)
			mark.tether.visible = !unit.dead && !!target
			mark.tether.scale.x = 1 + flash * v.aggroWidth
			mark.tether.scale.y = 1 + flash * v.aggroWidth
			if (target) {
				const dx = target.x - p.x,
					dz = target.z - p.z
				mark.tether.position.set((p.x + target.x) / 2, v.tetherY, (p.z + target.z) / 2)
				mark.tether.rotation.y = Math.atan2(dx, dz)
				mark.tether.scale.z = Math.hypot(dx, dz)
			}
		}
	}
	return {
		makeBody,
		aggro(body) {
			if (body) body.aggroFlash = tune.laneView.aggroLife
		},
		update,
		dispose() {
			for (const body of bodies) body.dispose()
			for (const mark of marks.values()) {
				mark.geometry.dispose()
				mark.tetherGeometry.dispose()
				mark.material.dispose()
			}
			scene.remove(group)
		},
	}
}
