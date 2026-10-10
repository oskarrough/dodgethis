import * as THREE from 'three'
import { FORWARD_LAYER, makeStyleMaterial } from '../../core/stylepass.js'
import { STEP } from '../../core/app.js'
import { tune } from './tune.js'
import { look } from './look.js'
import { convexHull } from './match-terrain.js'

// `layout.structureStyle === 'stone'` (Overthrow by day) builds towers and the core in stone
// with team colour only on banners and crystals, and prints each one's shadow on the court.
export function createLaneView(scene, smooth = null, layout = null) {
	const bodies = new Set()
	const stone = layout?.structureStyle === 'stone'
	function makeBody(x, z, team, kind) {
		const v = look.laneView
		const tower = Object.hasOwn(tune, kind) && !Object.hasOwn(tune.minions, kind)
		const radius = tower ? tune[kind].radius : kind === 'brute' ? v.bruteRadius : tune.waves.radius
		const height = kind === 'brute' ? v.bruteHeight : v.minionHeight
		const halfHeight = tower ? tune[kind].height / 2 : height / 2
		const mesh = new THREE.Group()
		const visual = new THREE.Group()
		mesh.add(visual)
		const owned = []
		const material = (role, flat = false) => {
			const m = makeStyleMaterial(role, { flat })
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
		let crystal = null
		const cracks = []
		let shadow = null
		if (stone && tower) {
			const s = look.laneView.stone
			const pale = material('scenery'),
				grey = material('courtShade')
			const base = -halfHeight
			const prism = (top, bottom, height, sides, mat, y, turn = 0) =>
				part(new THREE.CylinderGeometry(top, bottom, height, sides).rotateY(turn), mat, y)
			if (kind === 'core') {
				// A stepped stone plinth under the faceted team crystal.
				prism(radius * 0.97, radius, s.plinth, s.sides, pale, base + s.plinth / 2)
				prism(
					radius * s.step,
					radius * s.step,
					s.plinth * 0.8,
					s.sides,
					grey,
					base + s.plinth * 1.4,
					Math.PI / s.sides,
				)
				crystal = part(
					new THREE.OctahedronGeometry(radius * v.coreWidth).scale(1, v.coreAspect, 1),
					teamMaterial,
					0,
				)
				for (const sign of [-1, 1]) {
					const crack = part(new THREE.BoxGeometry(v.domeWidth, radius, v.domeWidth), ink, 0)
					crack.position.z = -radius / 2
					crack.position.x = (sign * radius) / 2
					crack.rotation.z = (sign * Math.PI) / 4
					cracks.push(crack)
				}
			} else {
				// Drum, tapered shaft, crenellated crown, crystal tip; the banner hangs toward the camera.
				prism(radius * 0.94, radius * 1.04, s.drum, s.sides, pale, base + s.drum / 2)
				const shaftBottom = base + s.drum
				prism(
					radius * s.shaftTop,
					radius * s.shaftBottom,
					s.shaft,
					s.sides,
					grey,
					shaftBottom + s.shaft / 2,
				)
				const crown = shaftBottom + s.shaft
				prism(
					radius * s.crown,
					radius * s.shaftTop,
					s.crownHeight,
					s.sides,
					pale,
					crown + s.crownHeight / 2,
				)
				for (let i = 0; i < s.crenels; i++) {
					const angle = ((i + 0.5) / s.crenels) * Math.PI * 2
					const crenel = part(
						new THREE.BoxGeometry(s.crenelSize, s.crenelSize, s.crenelSize),
						pale,
						crown + s.crownHeight + s.crenelSize / 2,
					)
					crenel.position.x = Math.cos(angle) * radius * s.crown * 0.82
					crenel.position.z = Math.sin(angle) * radius * s.crown * 0.82
					crenel.rotation.y = -angle
				}
				crystal = part(
					new THREE.OctahedronGeometry(s.tip).scale(1, s.tipAspect, 1),
					teamMaterial,
					crown + s.crownHeight + s.tip * s.tipAspect,
				)
				const banner = part(
					new THREE.BoxGeometry(s.bannerWidth, s.bannerHeight, s.bannerDepth),
					teamMaterial,
					crown - s.bannerHeight / 2 - 0.05,
				)
				// Lean with the shaft's taper so it lies flat on the stone.
				const lean = Math.atan((radius * (s.shaftBottom - s.shaftTop)) / s.shaft)
				const at = (crown - banner.position.y) / s.shaft
				banner.position.z =
					radius * (s.shaftTop + (s.shaftBottom - s.shaftTop) * at) + s.bannerDepth
				banner.rotation.x = -lean
				const rod = part(new THREE.BoxGeometry(s.bannerWidth * 1.25, 0.08, 0.08), ink, crown - 0.05)
				rod.position.z = banner.position.z
			}
			shadow = printShadow(x, z, radius, tune[kind].height)
		} else if (kind === 'core') {
			part(
				new THREE.CylinderGeometry(radius, radius, v.drumHeight, v.crenels),
				ink,
				-halfHeight + v.drumHeight / 2,
			)
			crystal = part(
				new THREE.OctahedronGeometry(radius * v.coreWidth).scale(1, v.coreAspect, 1),
				teamMaterial,
				0,
			)
			for (const sign of [-1, 1]) {
				const crack = part(new THREE.BoxGeometry(v.domeWidth, radius, v.domeWidth), ink, 0)
				crack.position.z = -radius / 2
				crack.position.x = (sign * radius) / 2
				crack.rotation.z = (sign * Math.PI) / 4
				cracks.push(crack)
			}
		} else if (tower) {
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
				new THREE.CapsuleGeometry(radius, height - radius * 2, v.capSegments, v.segments),
				teamMaterial,
				0,
			)
			part(new THREE.BoxGeometry(v.footWidth, v.footHeight, v.footDepth), ink, -halfHeight)
			if (kind === 'brute')
				part(new THREE.BoxGeometry(v.bruteHelmet, v.bruteHelmet, v.bruteHelmet), cream, halfHeight)
			else if (kind === 'wizard')
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
		let dome = null
		if (tower) {
			dome = new THREE.Group()
			dome.name = 'moba-invulnerability-dome'
			for (let i = 0; i < v.domeSegments; i++) {
				const arc = new THREE.TorusGeometry(
					halfHeight + radius,
					v.domeWidth,
					v.capSegments,
					v.segments,
					Math.PI / v.domeSegments,
				)
				owned.push(arc)
				for (const tilt of [0, Math.PI / 2]) {
					const dash = new THREE.Mesh(arc, cream)
					dash.rotation.z = (i * Math.PI * 2) / v.domeSegments
					const axis = new THREE.Group()
					axis.rotation.y = tilt
					axis.add(dash)
					dome.add(axis)
				}
			}
			mesh.add(dome)
		}
		// The low sun's printed shadow: base circle swept toward the tip, never a shadow map.
		function printShadow(px, pz, r, height) {
			const light = tune.overthrowTerrain.light
			const [lx, ly, lz] = light.dir
			const reach = (light.shadowLength / Math.max(0.05, ly)) * height
			const points = []
			for (let i = 0; i < 24; i++) {
				const a = (i / 24) * Math.PI * 2
				points.push({ x: Math.cos(a) * r, z: Math.sin(a) * r })
				points.push({
					x: -lx * reach + Math.cos(a) * r * 0.35,
					z: -lz * reach + Math.sin(a) * r * 0.35,
				})
			}
			const shape = new THREE.Shape(convexHull(points).map((p) => new THREE.Vector2(p.x, -p.z)))
			const geometry = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2)
			const print = new THREE.MeshBasicMaterial({
				color: light.shadow,
				transparent: true,
				opacity: light.shadowStrength,
				depthWrite: false,
			})
			owned.push(geometry, print)
			const mesh = new THREE.Mesh(geometry, print)
			mesh.name = 'moba-structure-shadow'
			mesh.position.set(px, look.laneView.stone.shadowY, pz)
			mesh.layers.set(FORWARD_LAYER)
			mesh.renderOrder = -3
			scene.add(mesh)
			return mesh
		}
		const pose = {
			position: new THREE.Vector3(x, halfHeight, z),
			quaternion: new THREE.Quaternion(),
		}
		mesh.position.copy(pose.position)
		scene.add(mesh)
		const unsmooth = smooth?.(mesh, () => pose)
		let shatter = null
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
				if (kind === 'core') {
					crystal.visible = false
					for (const crack of cracks) crack.visible = false
					shatter = { age: 0, pieces: [] }
					for (let i = 0; i < v.shatterPieces; i++) {
						const geometry = new THREE.OctahedronGeometry(v.shatterSize)
						owned.push(geometry)
						const piece = new THREE.Mesh(geometry, teamMaterial)
						piece.name = 'core-shard'
						mesh.add(piece)
						shatter.pieces.push(piece)
					}
				} else {
					mesh.remove(visual)
					visual.visible = false
				}
				if (dome) dome.visible = false
				if (shadow) shadow.visible = false
				const geometry = new THREE.CylinderGeometry(
					radius * v.rubbleRadius,
					radius,
					v.rubbleHeight,
					v.segments,
				)
				owned.push(geometry)
				const rubble = new THREE.Mesh(geometry, stone ? material('scenery') : ink)
				rubble.position.y = -halfHeight + v.rubbleHeight / 2
				mesh.add(rubble)
			},
			animateShatter(dt) {
				if (!shatter) return
				shatter.age += Math.max(0, dt)
				const progress = Math.min(1, shatter.age / Math.max(STEP, look.laneView.shatterLife))
				for (const [i, piece] of shatter.pieces.entries()) {
					const angle = (i * Math.PI * 2) / shatter.pieces.length
					piece.position.set(
						Math.cos(angle) * look.laneView.shatterSpread * progress,
						(-halfHeight + look.laneView.shatterSize) * progress * progress +
							look.laneView.shatterLift * Math.sin(Math.PI * progress),
						Math.sin(angle) * look.laneView.shatterSpread * progress,
					)
					piece.rotation.set(progress * look.laneView.shatterSpin, angle, progress * angle)
				}
			},
			squeeze: 0,
			recoil: 0,
			strike: 0,
			windup: 0,
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
				if (shadow) scene.remove(shadow)
				if (helpTether) scene.remove(helpTether)
				for (const item of owned) item.dispose()
				bodies.delete(body)
			},
			pose,
			dome,
			crystal,
			cracks,
			helpTether,
			aggroFlash: 0,
			shieldFlash: 0,
		}
		bodies.add(body)
		return body
	}
	const group = new THREE.Group()
	scene.add(group)
	const marks = new Map()
	const globeMarks = new Map()
	function update(lane, heroes, alpha, locate, dt = 0, localTeam = null) {
		const v = look.laneView
		for (const unit of [...lane.structures, ...lane.minions]) {
			unit.body.animateShatter?.(dt)
			unit.body.squeeze *= Math.exp(-v.feedbackDecay * dt)
			unit.body.recoil *= Math.exp(-v.feedbackDecay * dt)
			unit.body.strike *= Math.exp(-v.strikeDecay * dt)
			const progress = unit.attack
				? 1 - Math.max(0, unit.attack.left - alpha) / unit.attack.total
				: 0
			const visual = unit.body.visual
			visual.scale.set(1, 1, 1)
			visual.rotation.x = 0
			visual.rotation.z = 0
			visual.position.y = 0
			if (unit.body.dome) {
				unit.body.dome.visible = !unit.dead && !lane.vulnerable(unit)
				unit.body.shieldFlash = Math.max(0, unit.body.shieldFlash - dt)
				unit.body.dome.scale.setScalar(1 + (v.shieldPulse * unit.body.shieldFlash) / v.shieldLife)
			}
			if (unit.body.crystal) {
				unit.body.crystal.rotation.y = (lane.time + alpha) * STEP * v.coreSpin
				for (const [i, crack] of unit.body.cracks.entries())
					crack.visible = unit.hp <= unit.maxHp * (1 - (i + 1) * v.coreCrack)
			}
			if (unit.kind === 'tower') visual.scale.x = visual.scale.z = 1 + progress * v.towerCharge
			else if (unit.kind === 'fort') visual.rotation.z = progress * v.fortPose
			else if (unit.kind === 'core') visual.position.y = progress * v.corePose
			else {
				if (!unit.attack && unit.body.windup > v.strikeFrom) unit.body.strike = 1
				unit.body.windup = progress
				const held = Math.min(1, progress / v.windupHold)
				const back = held * held * (3 - 2 * held)
				const swing = unit.body.strike * v.strikeReach - back
				const crouch = back * v.windupSquash
				visual.scale.set(1 + crouch / 2, 1 - crouch, 1 + crouch / 2)
				if (unit.kind === 'melee') visual.rotation.x = swing * v.meleePose
				else if (unit.kind === 'brute') visual.rotation.z = swing * v.brutePose
				else if (unit.kind === 'ranged') visual.rotation.x = swing * v.rangedPose
				else visual.position.y = unit.body.strike * v.wizardPose
			}
			visual.scale.y *= Math.max(0.1, 1 - unit.body.squeeze)
			visual.position.z = unit.body.recoil
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
			if (!unit.structure) continue
			const stats = tune[unit.kind]
			let mark = marks.get(unit.id)
			if (!mark) {
				const material = makeStyleMaterial(unit.team === 'A' ? 'teamA' : 'teamB', { flat: true })
				const geometry = new THREE.RingGeometry(
					1 - v.ringWidth / stats.range,
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
			mark.ring.scale.setScalar(stats.range)
			mark.ring.visible =
				!unit.dead &&
				heroes.some(
					(h) =>
						!h.dead &&
						h.team !== unit.team &&
						Math.hypot(h.body.mesh.position.x - p.x, h.body.mesh.position.z - p.z) <=
							stats.range + stats.ringNear,
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
		const live = new Set(lane.globes.map((g) => g.id))
		for (const [id, globe] of globeMarks)
			if (!live.has(id)) {
				group.remove(globe)
				globe.geometry.dispose()
				globe.material.dispose()
				globeMarks.delete(id)
			}
		for (const globe of lane.globes) {
			let mesh = globeMarks.get(globe.id)
			if (!mesh) {
				mesh = new THREE.Mesh(
					new THREE.OctahedronGeometry(tune.globes.radius),
					makeStyleMaterial(
						globe.team === localTeam ? (globe.team === 'A' ? 'teamA' : 'teamB') : 'ink',
					),
				)
				group.add(mesh)
				globeMarks.set(globe.id, mesh)
			}
			mesh.position.set(globe.pos.x, tune.globes.height, globe.pos.z)
			mesh.rotation.y = (lane.time + alpha) * STEP * tune.globes.spin
		}
	}
	return {
		makeBody,
		shield(body) {
			if (body) body.shieldFlash = look.laneView.shieldLife
		},
		aggro(body) {
			if (body) body.aggroFlash = look.laneView.aggroLife
		},
		update,
		dispose() {
			for (const body of bodies) body.dispose()
			for (const globe of globeMarks.values()) {
				globe.geometry.dispose()
				globe.material.dispose()
			}
			for (const mark of marks.values()) {
				mark.geometry.dispose()
				mark.tetherGeometry.dispose()
				mark.material.dispose()
			}
			scene.remove(group)
		},
	}
}
