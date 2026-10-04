import * as THREE from 'three'
import { createBody } from '../../../core/body.js'
import { PALETTE } from '../../../core/style.js'
import { STEP } from '../../../core/app.js'
import { makeStyleMaterial } from '../../../core/stylepass.js'
import { createView } from '../view.js'
import { createSkillsView } from '../skills-view.js'
import { heroDefinition } from '../heroes.js'
import { tune as kit } from '../tune.js'
import { tune } from './tune.js'
import { dressPortrait } from './portrait.js'

// The select stage has a fixed camera and planted root. Actions move the child
// pose and their effects, never the actor or its screen scale when switching.
export function createPreview(app, run, heroId = 'fletcher') {
	const definition = heroDefinition(heroId)
	const old = app.scene.children.map((child) => [child, child.visible])
	old.forEach(([child]) => (child.visible = false))
	const scene = new THREE.Group()
	app.scene.add(scene)
	const body = createBody(scene, null, null, { profile: definition.base, replica: true })
	const undress = dressPortrait(body, heroId)
	app.setPalette({
		...Object.fromEntries(
			Object.entries(PALETTE).map(([role, color]) => [
				role,
				['ink', 'cream', 'teamA'].includes(role)
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
	// three.js hides only on visible === false, so these start hidden and are set to booleans.
	heroic.visible = heroicBolt.visible = false
	scene.add(patch, shadow, heroic, heroicBolt)
	const poses = new Map()
	const view = createView(scene, (object, read) => {
		poses.set(object, read)
		return () => poses.delete(object)
	})
	let skills = createSkillsView(scene)
	// Zones play on their own toy-scale stage beside the hero, so a 2.5 m Rain never swallows the frame.
	const zoneStage = new THREE.Group()
	scene.add(zoneStage)
	let zoneSkills = createSkillsView(zoneStage)
	let slot = null
	let ticks = 0
	let acc = 0
	let fired = false
	let shot = null
	let elapsed = 0
	let frozen = false
	const dir = new THREE.Vector3(tune.preview.direction.x, 0, tune.preview.direction.z).normalize()
	const restore = run.setStylePreset({ line: tune.preview.line, hatch: 1, alpha: true })
	const unframe = run.camera.frame(() => ({
		eye: new THREE.Vector3(0, tune.preview.cameraHeight, tune.preview.cameraBack),
		target: new THREE.Vector3(0, 1, 0),
		fov: innerWidth < 700 ? tune.preview.mobileFov : tune.preview.fov,
	}))
	const abilityFor = (key) =>
		definition.abilities[`slot${['Q', 'W', 'E', 'R'].indexOf(key) + 1}`] ??
		(heroId === 'fletcher' && key === 'R'
			? { id: 'volley', kind: 'shot', stats: tune.volley, effects: { pose: 'volley' } }
			: null)
	const durationOf = (ability) =>
		ability?.kind === 'dash'
			? ability.stats.time + (ability.stats.prone ?? 0)
			: ability?.kind === 'zone'
				? ability.stats.delay
				: ability?.kind === 'shot'
					? ability.stats.range / ability.stats.speed
					: (ability?.stats.duration ?? 0)
	function stop() {
		slot = null
		frozen = false
		shot = null
		elapsed = ticks = acc = 0
		fired = false
		view.reset()
		skills.dispose()
		skills = createSkillsView(scene)
		zoneSkills.dispose()
		zoneSkills = createSkillsView(zoneStage)
		body.visual.rotation.set(0, 0, 0)
		body.drawPose(0)
		heroic.visible = heroicBolt.visible = false
	}
	function start(next) {
		if (!abilityFor(next)) {
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
		acc += dt
		while (acc >= STEP) {
			ticks++
			acc -= STEP
		}
		const alpha = acc / STEP
		const t = (elapsed = (ticks + alpha) * STEP)
		const ability = abilityFor(slot)
		const stats = ability?.stats
		const warning = tune.preview.hold + (stats?.castPoint ?? 0)
		const age = Math.max(0, t - warning)
		const flight = durationOf(ability)
		const distance =
			ability?.kind === 'zone'
				? Math.min(stats.range, tune.preview.rainDistance)
				: tune.preview.distance
		const aim = { x: dir.x * distance, z: dir.z * distance }
		if (ability && !fired && t >= warning) {
			fired = true
			const sound = ability.id === 'volley' ? tune.preview.volleySound : kit.sounds[ability.id]
			if (sound) app.audio.blip(sound)
			if (ability.kind === 'shot' && ability.id !== 'volley') {
				shot = {
					id: 'preview',
					ability: ability.id,
					stats,
					team: 'A',
					x: 0,
					z: 0,
					dx: dir.x,
					dz: dir.z,
				}
				view.bolt(shot, { x: 0, z: 0 })
			}
			if (ability.kind === 'dash') skills.vault({ x: 0, z: 0 }, dir, stats)
			if (ability.kind === 'zone') zoneSkills.rain({ x: 0, z: 0 }, stats)
		}
		if (ability && t > warning + flight + tune.preview.settle) slot = null
		app.camera.update(dt)
		const floorTilt = innerWidth < 700 ? tune.preview.mobileFloorTilt : 0
		patch.rotation.x = shadow.rotation.x = floorTilt
		shadow.position.y = tune.preview.shadowY - Math.tan(floorTilt) * tune.preview.shadowOffset
		const camera = app.camera.view
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
		body.mesh.position.set(0, body.radius + body.halfHeight, 0)
		body.face(tune.preview.facing)
		const draw =
			slot && ability?.effects?.pose === 'draw' && t >= tune.preview.hold && t < warning
				? (t - tune.preview.hold) / stats.castPoint
				: 0
		body.animate(dt, draw)
		if (!slot) body.visual.rotation.set(0, 0, 0)
		else if (ability.kind === 'dash')
			body.visual.rotation.z =
				-tune.preview.vaultPose * Math.sin(Math.min(1, age / stats.time) * Math.PI)
		else if (ability.kind === 'zone')
			body.visual.rotation.x =
				-tune.preview.rainPose * Math.sin((Math.min(1, t / warning) * Math.PI) / 2)
		else if (ability.id === 'volley')
			body.visual.rotation.z =
				tune.preview.volleyPose * Math.sin((Math.min(1, t / warning) * Math.PI) / 2)
		if (shot) {
			const travelled = Math.min(shot.stats.range, age * shot.stats.speed)
			shot.x = dir.x * travelled
			shot.z = dir.z * travelled
		}
		for (const [object, read] of poses) {
			const pose = read()
			object.position.copy(pose.position)
			object.quaternion.copy(pose.quaternion)
		}
		view.update(dt, {
			live: new Set(slot && shot && fired && age < flight ? ['preview'] : []),
			hero: body.mesh.position,
			aim,
			held: !!(slot && ability?.held === 'line' && t < tune.preview.hold),
			lineStats: stats ?? kit.loose,
			locate: () => null,
		})
		const cast =
			slot && t >= tune.preview.hold && t < warning
				? {
						ability: ability.id,
						yaw: Math.atan2(dir.x, dir.z) + Math.PI,
						target: aim,
						total: stats.castPoint / STEP,
						left: warning / STEP - ticks,
					}
				: null
		const catchWindow =
			slot && (ability?.id === 'catch' || ability?.id === 'dive') && fired && age < flight
				? {
						radius: stats.radius,
						angle: stats.angle,
						dir,
						duration: flight,
						until: (warning + flight) / STEP,
					}
				: null
		if (heroId !== 'fletcher') {
			// Costume pose hooks read this presentation-only state, not a live hero.
			const poseUnit = {
				abilityState: { pocket: null },
				stance:
					slot && ability?.id === 'catch' && age < flight ? { ability: ability.id, dir } : null,
				body: { dashing: !!(slot && ability?.kind === 'dash' && fired && age < stats.time) },
				dashAbility: ability?.id,
				proneUntil: slot && stats?.prone && age >= stats.time && age < flight ? ticks + 1 : 0,
			}
			body.poseAbility(cast, alpha, poseUnit, ticks)
		}
		const zone = ability?.kind === 'zone'
		const scale = tune.preview.zoneScale
		zoneStage.position.set(aim.x, 0, aim.z)
		zoneStage.scale.setScalar(scale)
		const stageAim = zone ? { x: 0, z: 0 } : aim
		const stage = zone ? zoneSkills : skills
		// The idle stage still steps, so its held markers and fades clear.
		const idle = zone ? skills : zoneSkills
		idle.update(dt, { hero: body.mesh.position, aim: null, held: {}, alpha })
		stage.update(dt, {
			hero: zone ? { x: -aim.x / scale, y: 0, z: -aim.z / scale } : body.mesh.position,
			aim: stageAim,
			unit: { definition },
			tick: ticks,
			held: Object.fromEntries(
				Object.entries(definition.abilities).map(([key, a]) => [
					key,
					!!(slot && a?.id === ability?.id && t < tune.preview.hold),
				]),
			),
			casters:
				cast || catchWindow
					? [
							{
								id: 'preview-caster',
								body,
								definition,
								dead: false,
								cast: cast && zone ? { ...cast, target: stageAim } : cast,
								catchWindow,
							},
						]
					: [],
			zones:
				slot && ability?.kind === 'zone' && fired && age <= flight
					? [
							{
								id: 'preview-zone',
								ability: ability.id,
								stats,
								x: stageAim.x,
								z: stageAim.z,
								left: (warning + stats.delay) / STEP - ticks,
								total: stats.delay / STEP,
							},
						]
					: [],
			alpha,
		})
		heroic.visible = !!(slot && ability?.id === 'volley' && t < warning)
		heroic.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI
		heroic.scale.set(tune.volley.radius * 2, 1, tune.volley.range)
		heroic.position.set(
			(dir.x * tune.volley.range) / 2,
			tune.preview.tellY,
			(dir.z * tune.volley.range) / 2,
		)
		heroic.material = t < tune.preview.hold ? cream : enemy
		heroicBolt.visible = !!(slot && ability?.id === 'volley' && fired && age < flight)
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
		update,
		freeze(value = true) {
			frozen = value
		},
		get state() {
			const ability = abilityFor(slot)
			const warning = tune.preview.hold + (ability?.stats.castPoint ?? 0)
			const bolt = [...poses.keys()][0]
			scene.updateMatrixWorld(true)
			const point = bolt?.getWorldPosition(new THREE.Vector3()).project(app.camera.view)
			const root = body.mesh.getWorldPosition(new THREE.Vector3())
			const screen = root.clone().project(app.camera.view)
			return {
				slot,
				heroId,
				ability: ability?.id ?? null,
				elapsed,
				phase: !slot
					? 'idle'
					: elapsed < tune.preview.hold
						? 'aim'
						: elapsed < warning
							? 'cast'
							: elapsed < warning + durationOf(ability)
								? 'flight'
								: 'settle',
				bolt: !!(slot && ability?.kind === 'shot' && poses.size > 0),
				screenBolt: point
					? { x: ((point.x + 1) * innerWidth) / 2, y: ((1 - point.y) * innerHeight) / 2 }
					: null,
				root: root.toArray(),
				scale: body.mesh.getWorldScale(new THREE.Vector3()).toArray(),
				screenRoot: { x: ((screen.x + 1) * innerWidth) / 2, y: ((1 - screen.y) * innerHeight) / 2 },
				rotation: body.visual.rotation.toArray().slice(0, 3),
				tell: !!scene.getObjectByName('moba-enemy-tell'),
			}
		},
		dispose() {
			restore()
			unframe()
			app.setPalette({})
			view.dispose()
			skills.dispose()
			zoneSkills.dispose()
			undress()
			body.dispose()
			app.scene.remove(scene)
			for (const geometry of [disc, line, heroicBolt.geometry, ...hatchGeometry]) geometry.dispose()
			for (const material of [shadowMaterial, cream, enemy]) material.dispose()
			old.forEach(([child, visible]) => (child.visible = visible))
		},
	}
}
