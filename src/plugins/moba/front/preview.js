import * as THREE from 'three'
import { createBody } from '../../../core/body.js'
import { PALETTE } from '../../../core/style.js'
import { STEP } from '../../../core/app.js'
import { makeStyleMaterial } from '../../../core/stylepass.js'
import { createView } from '../view.js'
import { createSkillsView } from '../skills-view.js'
import { tune as kit } from '../tune.js'
import { tune } from './tune.js'
import { dressPortrait } from './portrait.js'

// Presentation-only replica, with the match's Q bolt and Q/W/E indicators.
// Its own tick clock can animate while the real sim and input stay suspended.
export function createPreview(app, run) {
	const old = app.scene.children.map((child) => [child, child.visible])
	old.forEach(([child]) => (child.visible = false))
	const scene = new THREE.Group()
	app.scene.add(scene)
	const body = createBody(scene, null, null, { profile: kit.hero, replica: true })
	const undress = dressPortrait(body)
	app.setPalette({
		...Object.fromEntries(
			Object.entries(PALETTE).map(([role, color]) => [
				role,
				role === 'ink' || role === 'cream' || role === 'teamA'
					? color
					: new THREE.Color(color)
							.lerp(new THREE.Color(PALETTE.cream), tune.preview.pastel)
							.getHex(),
			]),
		),
		courtShade: new THREE.Color(PALETTE.cream)
			.lerp(new THREE.Color(PALETTE.ink), tune.preview.shadowInk)
			.getHex(),
	})
	const shadowMaterial = makeStyleMaterial('courtShade', { flat: true })
	const enemy = makeStyleMaterial('teamB', { flat: true })
	const cream = makeStyleMaterial('cream', { flat: true })
	const disc = new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2)
	const line = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
	const patch = new THREE.Mesh(disc, cream)
	patch.position.y = tune.preview.patchY
	patch.scale.setScalar(tune.preview.patch)
	const shadow = new THREE.Group()
	shadow.position.set(0, tune.preview.shadowY, tune.preview.shadowOffset)
	const hatchGeometry = []
	for (
		let z = -tune.preview.shadowLength;
		z < tune.preview.shadowLength;
		z += tune.preview.shadowStep
	) {
		const width =
			tune.preview.shadowWidth *
			2 *
			Math.sqrt(Math.max(0, 1 - (z / tune.preview.shadowLength) ** 2))
		const geometry = new THREE.PlaneGeometry(width, tune.preview.shadowStroke).rotateX(-Math.PI / 2)
		const stripe = new THREE.Mesh(geometry, shadowMaterial)
		stripe.position.z = z
		shadow.add(stripe)
		hatchGeometry.push(geometry)
	}
	const heroic = new THREE.Mesh(line, cream)
	heroic.position.y = tune.preview.tellY
	const heroicBolt = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), cream)
	scene.add(patch, shadow, heroic, heroicBolt)
	const poses = new Map()
	const view = createView(scene, (object, read) => {
		poses.set(object, read)
		return () => poses.delete(object)
	})
	let skills = createSkillsView(scene)
	let slot = null
	let ticks = 0
	let acc = 0
	let idle = 0
	let fired = false
	let shot = null
	let elapsed = 0
	let frozen = false
	let zoom = 0
	const dir = new THREE.Vector3(tune.preview.direction.x, 0, tune.preview.direction.z).normalize()
	const reduced = matchMedia('(prefers-reduced-motion: reduce)')
	const restore = run.setStylePreset({ line: tune.preview.line, hatch: 1, alpha: true })
	const unframe = run.camera.frame(() => ({
		eye: new THREE.Vector3(0, tune.preview.cameraHeight, tune.preview.cameraBack),
		target: new THREE.Vector3(0, 1, 0),
		fov:
			innerWidth < 700
				? tune.preview.mobileFov + zoom * (tune.preview.mobileSkillFov - tune.preview.mobileFov)
				: tune.preview.fov + zoom * (tune.preview.skillFov - tune.preview.fov),
	}))
	function stop() {
		slot = null
		frozen = false
		shot = null
		elapsed = ticks = acc = 0
		fired = false
		view.reset()
		skills.dispose()
		skills = createSkillsView(scene)
		body.visual.rotation.set(0, 0, 0)
	}
	function start(next) {
		if (next === 'Trait') {
			stop()
			return false
		}
		if (slot === next && elapsed < tune.preview.hold) return false
		stop()
		slot = next
		return true
	}
	function update(dt) {
		if (frozen) return
		idle += dt
		acc += dt
		while (acc >= STEP) {
			ticks++
			acc -= STEP
		}
		const alpha = acc / STEP
		const t = (elapsed = (ticks + alpha) * STEP)
		const skill =
			slot === 'Q' ? kit.loose : slot === 'W' ? kit.vault : slot === 'E' ? kit.rain : tune.volley
		const warning = tune.preview.hold + (skill.castPoint ?? 0)
		const age = Math.max(0, t - warning)
		const flight =
			slot === 'W' ? skill.time : slot === 'E' ? skill.delay : skill.range / skill.speed
		const distance =
			slot === 'E' ? Math.min(kit.rain.range, tune.preview.rainDistance) : tune.preview.distance
		const aim = { x: dir.x * distance, z: dir.z * distance }
		if (slot && !fired && t >= warning) {
			fired = true
			app.audio.blip(
				slot === 'Q'
					? kit.sounds.loose
					: slot === 'W'
						? kit.sounds.vault
						: slot === 'E'
							? kit.sounds.rain
							: tune.preview.volleySound,
			)
			if (slot === 'Q') {
				shot = { id: 'preview', slot: 'slot1', team: 'A', x: 0, z: 0, dx: dir.x, dz: dir.z }
				view.bolt(shot, { x: 0, z: 0 })
			}
			if (slot === 'W') skills.vault({ x: 0, z: 0 }, dir)
			if (slot === 'E') skills.rain(aim)
		}
		if (t > warning + flight + tune.preview.settle) slot = null
		zoom = slot
			? Math.min(1, t / tune.preview.hold) *
				(1 - Math.max(0, Math.min(1, (age - flight) / tune.preview.settle)))
			: 0
		app.camera.update(dt)
		const floorTilt = innerWidth < 700 ? tune.preview.mobileFloorTilt : 0
		patch.rotation.x = shadow.rotation.x = floorTilt
		shadow.position.y = tune.preview.shadowY - Math.tan(floorTilt) * tune.preview.shadowOffset
		const camera = app.camera.view
		// Full-size alpha canvas: project the replica, never stretch its silhouette.
		const ndc = new THREE.Vector3(
			innerWidth < 700 ? tune.preview.mobileX : tune.preview.x,
			innerWidth < 700 ? tune.preview.mobileY : tune.preview.y,
			0.5,
		).unproject(camera)
		const direction = ndc.sub(camera.position)
		const anchor = camera.position
			.clone()
			.addScaledVector(direction, -camera.position.z / direction.z)
		scene.position.set(anchor.x, anchor.y - 1, 0)
		body.mesh.position.set(
			slot === 'W' ? dir.x * Math.min(1, age / skill.time) * kit.vault.range : 0,
			kit.hero.radius +
				kit.hero.halfHeight +
				(reduced.matches ? 0 : Math.sin(idle * tune.preview.idleRate) * tune.preview.idle),
			slot === 'W' ? dir.z * Math.min(1, age / skill.time) * kit.vault.range : 0,
		)
		body.face(tune.preview.facing)
		body.animate(
			dt,
			slot === 'Q' && t >= tune.preview.hold && t < warning
				? (t - tune.preview.hold) / skill.castPoint
				: 0,
		)
		if (!slot) body.visual.rotation.set(0, 0, 0)
		if (slot === 'W')
			body.visual.rotation.z =
				-tune.preview.vaultPose * Math.sin(Math.min(1, age / skill.time) * Math.PI)
		if (slot === 'E')
			body.visual.rotation.x =
				-tune.preview.rainPose * Math.sin((Math.min(1, t / warning) * Math.PI) / 2)
		if (slot === 'R')
			body.visual.rotation.z =
				tune.preview.volleyPose * Math.sin((Math.min(1, t / warning) * Math.PI) / 2)
		if (shot) {
			const travelled = Math.min(kit.loose.range, age * kit.loose.speed)
			shot.x = dir.x * travelled
			shot.z = dir.z * travelled
		}
		for (const [object, read] of poses) {
			const pose = read()
			object.position.copy(pose.position)
			object.quaternion.copy(pose.quaternion)
		}
		view.update(dt, {
			live: new Set(slot === 'Q' && fired && age < flight ? ['preview'] : []),
			hero: body.mesh.position,
			aim,
			held: slot === 'Q' && t < tune.preview.hold,
			locate: () => null,
		})
		skills.update(dt, {
			hero: body.mesh.position,
			aim,
			held: {
				slot2: slot === 'W' && t < tune.preview.hold,
				slot3: slot === 'E' && t < tune.preview.hold,
			},
			casters:
				slot === 'Q' && t >= tune.preview.hold && t < warning
					? [
							{
								id: 'preview-caster',
								body,
								dead: false,
								cast: {
									slot: 'slot1',
									yaw: Math.atan2(dir.x, dir.z) + Math.PI,
									total: kit.loose.castPoint / STEP,
									left: warning / STEP - ticks,
								},
							},
						]
					: [],
			zones:
				slot === 'E' && fired && age <= flight
					? [
							{
								id: 'preview-rain',
								x: aim.x,
								z: aim.z,
								left: (warning + kit.rain.delay) / STEP - ticks,
								total: kit.rain.delay / STEP,
							},
						]
					: [],
			alpha,
		})
		heroic.visible = slot === 'R' && t < warning
		heroic.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI
		heroic.scale.set(tune.volley.radius * 2, 1, tune.volley.range)
		heroic.position.set(
			(dir.x * tune.volley.range) / 2,
			tune.preview.tellY,
			(dir.z * tune.volley.range) / 2,
		)
		heroic.material = t < tune.preview.hold ? cream : enemy
		heroicBolt.visible = slot === 'R' && fired && age < flight
		heroicBolt.scale.setScalar(tune.volley.radius)
		heroicBolt.position.set(
			dir.x * Math.min(tune.volley.range, age * tune.volley.speed),
			kit.loose.height,
			dir.z * Math.min(tune.volley.range, age * tune.volley.speed),
		)
	}
	return {
		start,
		stop,
		freeze(value = true) {
			frozen = value
		},
		get state() {
			const skill =
				slot === 'Q' ? kit.loose : slot === 'W' ? kit.vault : slot === 'E' ? kit.rain : tune.volley
			const warning = tune.preview.hold + (skill.castPoint ?? 0)
			const duration =
				slot === 'W' ? skill.time : slot === 'E' ? skill.delay : skill.range / skill.speed
			const bolt = [...poses.keys()][0]
			scene.updateMatrixWorld(true)
			const point = bolt?.getWorldPosition(new THREE.Vector3()).project(app.camera.view)
			return {
				slot,
				elapsed,
				phase: !slot
					? 'idle'
					: elapsed < tune.preview.hold
						? 'aim'
						: elapsed < warning
							? 'cast'
							: elapsed < warning + duration
								? 'flight'
								: 'settle',
				bolt: slot === 'Q' && poses.size > 0,
				screenBolt: point
					? { x: ((point.x + 1) * innerWidth) / 2, y: ((1 - point.y) * innerHeight) / 2 }
					: null,
				rotation: body.visual.rotation.toArray().slice(0, 3),
				tell: !!scene.getObjectByName('moba-enemy-tell'),
			}
		},
		update,
		dispose() {
			restore()
			unframe()
			app.setPalette({})
			view.dispose()
			skills.dispose()
			undress()
			body.dispose()
			app.scene.remove(scene)
			for (const geometry of [disc, line, heroicBolt.geometry, ...hatchGeometry]) geometry.dispose()
			for (const material of [shadowMaterial, cream, enemy]) material.dispose()
			old.forEach(([child, visible]) => (child.visible = visible))
		},
	}
}
