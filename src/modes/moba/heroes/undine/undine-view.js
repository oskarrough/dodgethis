import * as THREE from 'three'
import { tune } from '../../tune.js'
import { STEP } from '../../../../core/app.js'
import { makeStyleMaterial } from '../../../../core/stylepass.js'
import { poseWindup, poseStrike } from '../../pose-curve.js'

export function dress({ torso, part, detail, face, own, discY, materials }) {
	const v = tune.heroes.undine.view
	// Bake the pot's proportions into the geometry: hero-view grounds the torso and clones its geometry
	// for the ink border, and a mesh scale would leave that border as a full-size ink ball.
	const enamel = new THREE.SphereGeometry(1, 12, 8).scale(v.width, v.height, v.depth).toNonIndexed()
	enamel.computeVertexNormals()
	torso.geometry = own(enamel)
	face(0.9, discY + 1.29, -0.36)
	const chip = new THREE.BufferGeometry()
	chip.setAttribute(
		'position',
		new THREE.Float32BufferAttribute(
			[
				-0.43, 1.2, -0.25, -0.3, 1.18, -0.43, -0.18, 1.31, -0.29, 0.32, 1.22, 0.2, 0.45, 1.14, 0.24,
				0.5, 1.13, 0.06,
			],
			3,
		),
	)
	chip.computeVertexNormals()
	part(chip.translate(0, discY, 0), materials.cream)
	const hem = new THREE.CylinderGeometry(0.55, 0.43, 0.14, 12).translate(0, discY + 0.18, 0)
	const normals = hem.attributes.normal
	for (let i = 0; i < normals.count; i++) normals.setXYZ(i, 0, -1, 0)
	part(hem, materials.skin)
	part(
		new THREE.CylinderGeometry(v.neckRadius, v.neckRadius, v.neckHeight, 12),
		materials.cream,
		0,
		discY + v.neckY,
		0,
	)
	const spoutShape = new THREE.CylinderGeometry(v.spoutRadius, v.spoutRadius, v.spoutLength, 6)
	const lip = spoutShape.attributes.position
	for (let i = 0; i < lip.count; i++)
		if (lip.getY(i) > 0 && lip.getX(i) < v.spoutRadius * 0.5) lip.setY(i, lip.getY(i) - 0.12)
	spoutShape.computeVertexNormals()
	const spout = part(spoutShape, materials.cream, v.spoutX, discY + v.spoutY, 0)
	spout.rotation.z = -Math.PI / 3
	detail(
		[
			new THREE.CylinderGeometry(v.spoutRadius * 0.68, v.spoutRadius * 0.68, 0.016, 6).translate(
				0,
				v.spoutLength / 2 - 0.13,
				0,
			),
		],
		materials.ink,
		spout,
	)
	part(
		new THREE.TorusGeometry(v.handleRadius, v.handleTube, 6, 16),
		materials.ink,
		v.handleX,
		discY + v.handleY,
		0,
	)
	return {
		spout,
		slideEnd: -Infinity,
		lastTime: -Infinity,
		releases: {
			balloon: { snap: v.releaseSnap, recover: v.releaseRecover },
			sprinkler: { snap: v.releaseSnap, recover: v.releaseRecover },
		},
	}
}
export function animate(
	unit,
	rig,
	{ costume, pose, progress, alpha, time, releasing, releasePose, fire, settle },
) {
	const v = tune.heroes.undine.view
	rig.spout.rotation.z = -Math.PI / 3
	costume.scale.set(1, 1, 1)
	if (time < rig.lastTime || !unit || unit.dead) rig.slideEnd = -Infinity
	rig.lastTime = time
	const sliding = unit?.body?.dashing && unit.dashAbility === 'slide'
	if (sliding) rig.slideEnd = time
	const slide = sliding ? 1 : Math.max(0, 1 - ((time - rig.slideEnd) * STEP) / v.slideRecover)
	if (slide > 0) {
		costume.rotation.x = v.slideTilt * slide
		costume.scale.set(1, 1 - v.castSquash * slide, 1 + v.castSquash * slide)
		return
	}
	const coil = poseWindup(progress)
	const strike = releasing ? poseStrike(fire, settle) : 0
	if (releasing) pose = releasePose
	if (pose === 'balloon') {
		// An instant lob: the loaded jug tips through release without locking the player.
		costume.rotation.x = v.balloonTilt * (releasing ? strike - (1 - fire) * settle : -coil)
		costume.rotation.z = -v.flickLean * strike
	} else if (pose === 'sprinkler') {
		costume.rotation.z = v.sprinklerTilt * (releasing ? -strike : coil)
		const press = releasing ? strike : coil
		costume.scale.set(1 + v.castSquash * press, 1 - v.castSquash * press, 1)
	} else if (unit?.attack || pose === 'waterFlick') {
		const attack = unit?.attack
		const winding = attack?.phase === 'windup'
		const reach = winding ? poseWindup(1 - (attack.left - alpha) / Math.max(1, attack.total)) : coil
		const elapsed = attack?.phase === 'backswing' ? (time - attack.startedTick) * STEP : 0
		const snap =
			attack?.phase === 'backswing'
				? poseStrike(elapsed / v.releaseSnap, 1 - elapsed / tune.waterFlick.backswing)
				: 0
		rig.spout.rotation.z += v.flickTilt * (reach - snap)
		costume.rotation.z = v.flickLean * (reach - snap)
		costume.rotation.y = -v.flickLean * reach
	}
}

// The jug's wake and wet hems use replicated bodies/statuses, never a local cast timer.
export function extras(scene) {
	const group = new THREE.Group()
	scene.add(group)
	const owned = []
	const own = (resource) => {
		owned.push(resource)
		return resource
	}
	const ink = own(makeStyleMaterial('ink', { flat: true }))
	const water = own(makeStyleMaterial('cream', { flat: true }))
	const v = tune.heroes.undine.view
	const arc = own(
		new THREE.RingGeometry(1 - v.wakeWidth, 1, 24, 1, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2),
	)
	const droplet = new THREE.Shape()
	droplet.moveTo(0, 1.5)
	droplet.lineTo(1, -0.5)
	droplet.lineTo(0, -1)
	droplet.lineTo(-1, -0.5)
	droplet.closePath()
	const drop = own(new THREE.ShapeGeometry(droplet))
	const live = new Map()
	let last = -Infinity
	let summonsSeen = new Set()
	const clear = () => {
		group.clear()
		live.clear()
		summonsSeen.clear()
	}
	return {
		update({ units = [], summons = [], tick, alpha = 0 }) {
			const now = tick + alpha
			if (now < last) clear()
			last = now
			// Instant summons have no projectile fact to arm hero-view's release pose.
			// Their replicated birth tick supplies that same hook without a new net fact.
			for (const summon of summons) {
				if (summonsSeen.has(summon.id) || !['balloon', 'sprinkler'].includes(summon.key)) continue
				if ((now - summon.from) * STEP >= v.releaseSnap + v.releaseRecover) continue
				const owner = units.find((unit) => unit.id === summon.owner)
				if (owner && !owner.dead) owner.body.releaseAbilityPose?.(summon.key, summon.from)
			}
			summonsSeen = new Set(summons.map((summon) => summon.id))
			const shown = new Set()
			for (const unit of units) {
				if (unit.dead) continue
				const sliding = unit.dashAbility === 'slide' && unit.body?.dashing
				const soaked = unit.statuses?.some(
					(status) => status.key === 'balloon.soak' && status.until > now,
				)
				if (!sliding && !soaked) continue
				shown.add(unit.id)
				let rig = live.get(unit.id)
				if (!rig) {
					const root = new THREE.Group()
					const wake = new THREE.Group()
					const border = new THREE.Mesh(arc, ink)
					const crest = new THREE.Mesh(arc, water)
					crest.position.y = 0.008
					crest.scale.setScalar(0.94)
					wake.add(border, crest)
					const drops = [new THREE.Mesh(drop, ink), new THREE.Mesh(drop, ink)]
					for (const mesh of drops) {
						const fill = new THREE.Mesh(drop, water)
						fill.scale.setScalar(0.72)
						fill.position.z = 0.02
						mesh.add(fill)
					}
					root.add(wake, ...drops)
					group.add(root)
					rig = { root, wake, drops }
					live.set(unit.id, rig)
				}
				const at = unit.body.mesh?.position ?? unit.body.position
				rig.root.position.set(at.x, v.waterGround, at.z)
				rig.wake.visible = sliding
				if (sliding) {
					const dir = unit.body.dashDirection
					rig.wake.rotation.y = -Math.atan2(dir.z, dir.x)
					rig.wake.scale.set(v.wakeLength, 1, v.wakeRadius)
				}
				for (const [i, mesh] of rig.drops.entries()) {
					mesh.visible = soaked
					const fall = ((now * STEP) / v.soakPeriod + i / rig.drops.length) % 1
					mesh.position.set((i ? 1 : -1) * v.soakRadius, v.soakHeight * (1 - fall), 0)
					mesh.scale.set(v.soakSize, v.soakSize * (1 + fall), v.soakSize)
				}
			}
			for (const [id, rig] of live)
				if (!shown.has(id)) {
					group.remove(rig.root)
					live.delete(id)
				}
		},
		dispose() {
			clear()
			scene.remove(group)
			for (const resource of owned) resource.dispose()
		},
	}
}
