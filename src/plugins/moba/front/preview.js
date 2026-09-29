import * as THREE from 'three'
import { createBody } from '../../../core/body.js'
import { PALETTE } from '../../../core/style.js'
import { STEP } from '../../../core/app.js'
import { makeStyleMaterial } from '../../../core/stylepass.js'
import { createView } from '../view.js'
import { createSkillsView } from '../skills-view.js'
import { tune as kit } from '../tune.js'
import { tune } from './tune.js'

// Presentation-only replica, with the match's Q bolt and Q/W/E indicators.
// Its own tick clock can animate while the real sim and input stay suspended.
export function createPreview(app, run) {
	const old = app.scene.children.map((child) => [child, child.visible])
	old.forEach(([child]) => (child.visible = false))
	app.setPalette(
		Object.fromEntries(
			Object.entries(PALETTE).map(([role, color]) => [
				role,
				role === 'ink' || role === 'cream'
					? color
					: new THREE.Color(color)
							.lerp(new THREE.Color(PALETTE.cream), tune.preview.pastel)
							.getHex(),
			]),
		),
	)
	const scene = new THREE.Group()
	app.scene.add(scene)
	const body = createBody(scene, null, null, { profile: kit.hero, replica: true })
	const ink = makeStyleMaterial('ink', { flat: true })
	const cream = makeStyleMaterial('cream', { flat: true })
	const disc = new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2)
	const line = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
	const patch = new THREE.Mesh(disc, cream)
	patch.position.y = tune.preview.patchY
	patch.scale.setScalar(tune.preview.patch)
	const shadow = new THREE.Mesh(disc, ink)
	shadow.position.set(0, tune.preview.shadowY, tune.preview.shadowOffset)
	shadow.scale.set(tune.preview.shadowWidth, 1, tune.preview.shadowLength)
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
	const reduced = matchMedia('(prefers-reduced-motion: reduce)')
	const restore = run.setStylePreset({ line: tune.preview.line, hatch: 1, alpha: true })
	const unframe = run.camera.frame(() => ({
		eye: new THREE.Vector3(0, tune.preview.cameraHeight, tune.preview.cameraBack),
		target: new THREE.Vector3(0, 1, 0),
		fov: innerWidth < 700 ? tune.preview.mobileFov : tune.preview.fov,
	}))
	function start(next) {
		slot = next
		ticks = 0
		acc = 0
		fired = false
		shot = null
		view.reset()
		skills.dispose()
		skills = createSkillsView(scene)
	}
	function update(dt) {
		idle += dt
		acc += dt
		while (acc >= STEP) {
			ticks++
			acc -= STEP
		}
		const alpha = acc / STEP
		const t = (ticks + alpha) * STEP
		const skill =
			slot === 'Q' ? kit.loose : slot === 'W' ? kit.vault : slot === 'E' ? kit.rain : tune.volley
		const warning = tune.preview.hold + (skill.castPoint ?? 0)
		const age = Math.max(0, t - warning)
		const flight =
			slot === 'W' ? skill.time : slot === 'E' ? skill.delay : skill.range / skill.speed
		const aim = { x: 0, z: -Math.min(kit.rain.range, tune.preview.distance) }
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
				shot = { id: 'preview', slot: 'slot1', team: 'A', x: 0, z: 0, dx: 0, dz: -1 }
				view.bolt(shot, { x: 0, z: 0 })
			}
			if (slot === 'W') skills.vault({ x: 0, z: 0 }, { x: 0, z: -1 })
			if (slot === 'E') skills.rain(aim)
		}
		if (t > warning + flight + tune.preview.settle) slot = null
		app.camera.update(dt)
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
			0,
			kit.hero.radius +
				kit.hero.halfHeight +
				(reduced.matches ? 0 : Math.sin(idle * tune.preview.idleRate) * tune.preview.idle),
			slot === 'W' ? -Math.min(1, age / skill.time) * kit.vault.range : 0,
		)
		body.face({ x: 0, z: -1 })
		body.animate(dt, slot === 'Q' && t < warning ? t / warning : 0)
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
			shot.z = -Math.min(kit.loose.range, age * kit.loose.speed)
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
			held: slot === 'Q' && t < warning,
			locate: () => null,
		})
		skills.update(dt, {
			hero: body.mesh.position,
			aim,
			held: {
				slot2: slot === 'W' && t < warning,
				slot3: slot === 'E' && t < warning,
			},
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
		heroic.scale.set(tune.volley.radius * 2, 1, tune.volley.range)
		heroic.position.z = -tune.volley.range / 2
		heroicBolt.visible = slot === 'R' && fired && age < flight
		heroicBolt.scale.setScalar(tune.volley.radius)
		heroicBolt.position.set(
			0,
			kit.loose.height,
			-Math.min(tune.volley.range, age * tune.volley.speed),
		)
	}
	return {
		start,
		update,
		dispose() {
			restore()
			unframe()
			app.setPalette({})
			view.dispose()
			skills.dispose()
			body.dispose()
			app.scene.remove(scene)
			for (const geometry of [disc, line, heroicBolt.geometry]) geometry.dispose()
			for (const material of [ink, cream]) material.dispose()
			old.forEach(([child, visible]) => (child.visible = visible))
		},
	}
}
