import * as THREE from 'three'
import { FORWARD_LAYER, makeStyleMaterial } from '../../core/stylepass.js'
import { STEP } from '../../core/app.js'
import { tune } from './tune.js'
import { look } from './look.js'
import { convexHull } from './match-terrain.js'
import { hologramMaterial } from './hologram.js'

// `layout.structureStyle === 'stone'` (both isles; `layout.light` picks sun or moon) builds towers and the core in stone
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
		const teamMaterial = material(team === 'A' ? 'teamA' : team === 'B' ? 'teamB' : 'cream')
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
		let float = null
		const cracks = []
		let shadow = null
		let laser = null
		if (kind === 'laser') {
			// Two stone posts with team emitters, a flickering hologram sheet strung between them.
			const l = v.laser
			const pale = material('scenery')
			const base = -halfHeight
			const capped = tune.laser.height - l.cap
			laser = { tops: [], beam: null }
			for (const side of [-1, 1]) {
				const stub = part(
					new THREE.BoxGeometry(l.post * 2, l.stub, l.post * 2),
					pale,
					base + l.stub / 2,
				)
				const top = part(
					new THREE.BoxGeometry(l.post * 2, capped - l.stub, l.post * 2),
					pale,
					base + (l.stub + capped) / 2,
				)
				const cap = part(
					new THREE.BoxGeometry(l.post * 2.2, l.cap, l.post * 2.2),
					teamMaterial,
					base + capped + l.cap / 2,
				)
				for (const piece of [stub, top, cap]) piece.position.z = side * radius
				laser.tops.push(top, cap)
			}
			const sheet = capped - l.beamInset * 2
			const glow = hologramMaterial(team, {
				opacity: l.opacity,
				lines: l.lines,
				flicker: l.flicker,
				side: THREE.DoubleSide,
				blending: THREE.AdditiveBlending,
			})
			const geometry = new THREE.PlaneGeometry(radius * 2 - l.post * 2, sheet).rotateY(Math.PI / 2)
			owned.push(glow, geometry)
			laser.beam = new THREE.Mesh(geometry, glow)
			laser.beam.name = 'moba-laser-beam'
			laser.beam.position.y = base + l.beamInset + sheet / 2
			laser.beam.layers.set(FORWARD_LAYER)
			visual.add(laser.beam)
		} else if (stone && tower) {
			const s = look.laneView.stone
			const pale = material('scenery'),
				grey = material('courtShade')
			const base = -halfHeight
			const prism = (top, bottom, height, sides, mat, y, turn = 0) =>
				part(new THREE.CylinderGeometry(top, bottom, height, sides).rotateY(turn), mat, y)
			if (kind === 'core') {
				// A stepped plinth of old, chipped stone; the upper step sits a little off-centre.
				const rand = seeded(s.seed + (team === 'B' ? 101 : 0))
				const wear = (geometry, height) =>
					chisel(geometry, rand, {
						jitter: s.jitter,
						chip: s.chip,
						chipChance: s.chipChance,
						top: height - s.bevel - 1e-3,
					})
				const upper = s.plinth * 0.8
				part(
					wear(stoneCourse(radius, radius * 0.97, s.plinth, s.sides, s.bevel), s.plinth),
					pale,
					base,
				)
				const step = part(
					wear(
						stoneCourse(radius * s.step, radius * s.step * 0.97, upper, s.sides + 1, s.bevel),
						upper,
					),
					grey,
					base + s.plinth - 0.02,
				)
				step.position.x = s.stepShift[0]
				step.position.z = s.stepShift[1]
				step.rotation.y = Math.PI / s.sides
				// Ink cracks zigzag up the lower course's faces that turn toward the camera (+z).
				const apothem = radius * 0.985 * Math.cos(Math.PI / s.sides)
				for (let i = 0; i < s.cracks; i++) {
					const face = i - Math.floor(s.cracks / 2) // one per face, either side of the front
					const phi = ((face + 0.5) / s.sides) * Math.PI * 2
					let u = (rand() - 0.5) * radius * 0.25,
						y = s.plinth * (0.05 + rand() * 0.15)
					const legs = 3
					for (let leg = 0; leg < legs && y < s.plinth - s.bevel; leg++) {
						const du = (rand() - 0.5) * 0.4,
							dv = Math.min(s.plinth - s.bevel - y, 0.18 + rand() * 0.14)
						const crack = part(
							new THREE.BoxGeometry(s.crackWidth, Math.hypot(du, dv), s.jitter * 3 + 0.04),
							ink,
							0,
						)
						crack.castShadow = false
						const mu = u + du / 2,
							mv = y + dv / 2
						crack.position.set(
							Math.sin(phi) * apothem + Math.cos(phi) * mu,
							base + mv,
							Math.cos(phi) * apothem - Math.sin(phi) * mu,
						)
						crack.rotation.set(0, phi, 0)
						crack.rotateZ(Math.atan2(-du, dv))
						u += du
						y += dv
					}
				}
				// The crystal floats over the plinth: a lean, unequal halves, every facet a little off.
				const width = radius * v.coreWidth
				const gem = new THREE.OctahedronGeometry(width)
				const position = gem.getAttribute('position')
				for (let i = 0; i < position.count; i++) {
					const y = position.getY(i)
					position.setY(i, y * v.coreAspect * (y < 0 ? v.coreLower : 1))
				}
				const lower = width * v.coreAspect * v.coreLower
				const pivot = new THREE.Group()
				pivot.position.y = base + s.plinth + upper + v.coreGap + lower
				pivot.rotation.set(v.coreLean[1], 0, v.coreLean[0] * (team === 'B' ? -1 : 1))
				visual.add(pivot)
				crystal = part(chisel(gem, rand, { jitter: width * v.coreJitter }), teamMaterial, 0)
				pivot.add(crystal)
				// The crystal's own printed shadow on the plinth, under the gap.
				const light = layout?.light ?? tune.overthrowTerrain.light
				const print = new THREE.MeshBasicMaterial({
					color: light.shadow,
					transparent: true,
					opacity: light.shadowStrength,
					depthWrite: false,
				})
				const blot = new THREE.CircleGeometry(width * 0.55, s.sides).rotateX(-Math.PI / 2)
				owned.push(print, blot)
				const under = new THREE.Mesh(blot, print)
				under.name = 'core-crystal-shadow'
				under.position.set(s.stepShift[0], base + s.plinth + upper + 0.02, s.stepShift[1])
				under.layers.set(FORWARD_LAYER)
				under.renderOrder = -2
				visual.add(under)
				float = { pivot, rest: pivot.position.y, under }
				for (const sign of [-1, 1]) {
					const crack = part(new THREE.BoxGeometry(v.domeWidth, radius, v.domeWidth), ink, 0)
					crack.position.z = -radius / 2
					crack.position.x = (sign * radius) / 2
					crack.rotation.z = (sign * Math.PI) / 4
					pivot.add(crack)
					cracks.push(crack)
				}
			} else {
				// Drum, tapered shaft, crenellated crown, crystal tip; the banner hangs toward the camera.
				const rand = seeded(s.seed + Math.round(x * 7 + z * 13))
				part(
					chisel(stoneCourse(radius * 1.04, radius * 0.94, s.drum, s.sides, s.bevel), rand, {
						jitter: s.jitter,
						chip: s.chip,
						chipChance: s.chipChance,
						top: s.drum - s.bevel - 1e-3,
					}),
					pale,
					base,
				)
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
			// One role prop, sized to read from the match camera; the body faces -z.
			if (kind === 'brute') {
				// A chipped stone helm with a crest, an ink visor slit across the front.
				const stoneMaterial = material('scenery')
				const helm = part(
					chisel(
						stoneCourse(v.helmRadius, v.helmRadius * 0.78, v.helmHeight, 6, 0.08),
						seeded(look.laneView.stone.seed + 3),
						{ jitter: 0.03 },
					),
					stoneMaterial,
					halfHeight - v.helmHeight * 0.75,
				)
				helm.rotation.y = Math.PI / 6
				const crest = part(
					new THREE.BoxGeometry(v.helmBrow, v.helmBrow * 1.5, v.helmRadius * 1.6),
					stoneMaterial,
					halfHeight + v.helmHeight * 0.25 + v.helmBrow * 0.5,
				)
				crest.castShadow = false
				const slit = part(
					new THREE.BoxGeometry(v.helmRadius * 1.3, v.helmBrow * 0.6, 0.1),
					ink,
					halfHeight - v.helmHeight * 0.4,
				)
				slit.position.z = -v.helmRadius * 0.86
			} else if (kind === 'wizard') {
				// A dark pointed hood with two cream horns sweeping out and up.
				part(
					new THREE.ConeGeometry(v.hoodRadius, v.hoodHeight, 5),
					ink,
					halfHeight - 0.08 + v.hoodHeight / 2,
				)
				for (const side of [-1, 1]) {
					const sweep = 1.0
					const horn = part(
						new THREE.ConeGeometry(v.hornRadius, v.hornLength, 4),
						cream,
						halfHeight + Math.cos(sweep) * (v.hornLength / 2),
					)
					horn.position.x = side * (v.hoodRadius * 0.7 + Math.sin(sweep) * (v.hornLength / 2))
					horn.rotation.z = -side * sweep
				}
			} else if (kind === 'ranged') {
				// A tall ink staff past the head, a cream gem on top: a dot off the shoulder from above.
				const staff = new THREE.Group()
				staff.position.set(radius + v.staffOut, -halfHeight, -0.04)
				staff.rotation.z = -0.22
				visual.add(staff)
				staff.add(
					part(
						new THREE.CylinderGeometry(v.staffRadius, v.staffRadius, v.staffHeight, 5),
						ink,
						v.staffHeight / 2,
					),
				)
				const gem = part(
					new THREE.OctahedronGeometry(v.staffGem).scale(1, 1.6, 1),
					cream,
					v.staffHeight + v.staffGem,
				)
				staff.add(gem)
			} else {
				// A kite shield in front, tipped back so its face shows to the sky; ink plate behind for a rim.
				const kite = new THREE.Shape()
				const w = v.shieldWidth / 2,
					h = v.shieldHeight
				kite.moveTo(0, -h * 0.62)
				kite.lineTo(w, h * 0.08)
				kite.lineTo(w * 0.8, h * 0.38)
				kite.lineTo(-w * 0.8, h * 0.38)
				kite.lineTo(-w, h * 0.08)
				kite.closePath()
				const shield = new THREE.Group()
				shield.position.set(0, -0.02, -radius - 0.06)
				shield.rotation.set(v.shieldTilt, Math.PI, 0)
				visual.add(shield)
				const face = part(
					new THREE.ExtrudeGeometry(kite, { depth: 0.05, bevelEnabled: false }),
					cream,
					0,
				)
				face.position.z = 0.03
				const back = part(
					new THREE.ExtrudeGeometry(kite, { depth: 0.04, bevelEnabled: false }).scale(
						1.18,
						1.14,
						1,
					),
					ink,
					0,
				)
				shield.add(face, back)
			}
		}
		let dome = null
		if (tower) {
			dome = new THREE.Group()
			dome.name = 'moba-invulnerability-dome'
			// Dashed rings stacked into a dome from the ground up; horizontal, so none is ever seen edge-on.
			const dashMaterial = material('cream', true)
			const reach = radius + v.domeReach
			const rise = halfHeight * 2 + v.domeLift
			for (const latitude of v.domeRings) {
				const ring = reach * Math.cos(latitude)
				const dashes = Math.max(6, Math.round(v.domeSegments * Math.cos(latitude)))
				const arc = new THREE.TorusGeometry(
					ring,
					v.domeDash,
					v.capSegments,
					v.segments,
					Math.PI / dashes,
				).rotateX(Math.PI / 2)
				owned.push(arc)
				for (let i = 0; i < dashes; i++) {
					const dash = new THREE.Mesh(arc, dashMaterial)
					dash.rotation.y = (i * Math.PI * 2) / dashes
					dash.position.y = -halfHeight + v.domeDash + rise * Math.sin(latitude)
					dome.add(dash)
				}
			}
			mesh.add(dome)
		}
		// The low sun's printed shadow: base circle swept toward the tip, never a shadow map.
		function printShadow(px, pz, r, height) {
			const light = layout.light ?? tune.overthrowTerrain.light
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
				if (laser) {
					// The beam collapses; the posts stay as broken stubs.
					laser.beam.visible = false
					for (const piece of laser.tops) piece.visible = false
					if (dome) dome.visible = false
					return
				}
				if (kind === 'core') {
					crystal.visible = false
					if (float) float.under.visible = false
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
			float,
			laser,
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
			if (unit.body.laser)
				unit.body.laser.beam.material.uniforms.uTime.value = (lane.time + alpha) * STEP
			if (unit.body.crystal) {
				const t = (lane.time + alpha) * STEP
				unit.body.crystal.rotation.y = t * v.coreSpin
				const float = unit.body.float
				if (float) {
					const bob = Math.sin(t * v.coreBobSpeed)
					float.pivot.position.y = float.rest + bob * v.coreBob
					float.under.scale.setScalar(1 - bob * 0.06)
				}
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
			if (!stats.range) continue // gates have no gun, so no range ring
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
		// Health globes a dead wizard leaves for its killers' team: a gem bobbing over its printed
		// shadow inside a ring the size of its pickup reach. Yours in team colour, the enemy's in ink.
		const live = new Set(lane.globes.map((g) => g.id))
		for (const [id, globe] of globeMarks)
			if (!live.has(id)) {
				disposeGlobe(globe)
				globeMarks.delete(id)
			}
		for (const globe of lane.globes) {
			let mark = globeMarks.get(globe.id)
			if (!mark) {
				const role = globe.team === localTeam ? (globe.team === 'A' ? 'teamA' : 'teamB') : 'ink'
				const light = layout?.light ?? tune.overthrowTerrain.light
				const shade = new THREE.MeshBasicMaterial({
					color: light.shadow,
					transparent: true,
					opacity: light.shadowStrength,
					depthWrite: false,
				})
				const gem = new THREE.Mesh(
					new THREE.OctahedronGeometry(tune.globes.radius).scale(1, 1.3, 1),
					makeStyleMaterial(role),
				)
				const ring = new THREE.Mesh(
					new THREE.RingGeometry(
						tune.globes.pickup - v.globeRing,
						tune.globes.pickup,
						v.ringSegments,
					).rotateX(-Math.PI / 2),
					makeStyleMaterial(role, { flat: true }),
				)
				ring.position.y = v.globeRingY
				const shadow = new THREE.Mesh(
					new THREE.CircleGeometry(tune.globes.radius * 0.9, v.segments).rotateX(-Math.PI / 2),
					shade,
				)
				shadow.position.y = v.globeRingY
				shadow.layers.set(FORWARD_LAYER)
				shadow.renderOrder = -2
				const root = new THREE.Group()
				root.name = 'moba-health-globe'
				root.add(gem, ring, shadow)
				group.add(root)
				globeMarks.set(globe.id, (mark = { root, gem, shadow }))
			}
			const t = (lane.time + alpha) * STEP
			const bob = Math.sin(t * v.globeBobSpeed + globe.id)
			mark.root.position.set(globe.pos.x, 0, globe.pos.z)
			mark.gem.position.y = tune.globes.height + bob * v.globeBob
			mark.gem.rotation.y = t * tune.globes.spin
			mark.shadow.scale.setScalar(1 - bob * 0.15)
		}
	}
	function disposeGlobe(mark) {
		group.remove(mark.root)
		mark.root.traverse((o) => {
			o.geometry?.dispose()
			o.material?.dispose()
		})
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
			for (const globe of globeMarks.values()) disposeGlobe(globe)
			for (const mark of marks.values()) {
				mark.geometry.dispose()
				mark.tetherGeometry.dispose()
				mark.material.dispose()
			}
			scene.remove(group)
		},
	}
}

// Deterministic, so every client chips the same stone and grows the same crystal.
function seeded(seed) {
	let a = seed >>> 0 || 1
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

// Nudge every distinct vertex (shared corners move together, so faces never tear): `jitter` sideways,
// and from `top` up a `chipChance` of dropping by up to `chip`, which reads as a knocked-off rim.
// Returns flat-shaded, non-indexed geometry so each facet prints as one plane.
function chisel(geometry, rand, { jitter = 0, chip = 0, chipChance = 0, top = Infinity } = {}) {
	const position = geometry.getAttribute('position')
	const offsets = new Map()
	for (let i = 0; i < position.count; i++) {
		const x = position.getX(i),
			y = position.getY(i),
			z = position.getZ(i)
		const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`
		let offset = offsets.get(key)
		if (!offset) {
			const r = Math.hypot(x, z)
			if (r < 1e-3) offset = [0, (rand() - 0.5) * jitter, 0] // apexes and cap centres stay on the axis
			else {
				const drop = y >= top && rand() < chipChance ? chip * (0.4 + 0.6 * rand()) : 0
				offset = [
					(rand() - 0.5) * 2 * jitter - (x / r) * drop * 0.6, // a chip bites inward as well as down
					(y > 0.01 ? (rand() - 0.5) * jitter : 0) - drop,
					(rand() - 0.5) * 2 * jitter - (z / r) * drop * 0.6,
				]
			}
			offsets.set(key, offset)
		}
		position.setXYZ(i, x + offset[0], y + offset[1], z + offset[2])
	}
	const flat = geometry.index ? geometry.toNonIndexed() : geometry
	if (flat !== geometry) geometry.dispose()
	flat.deleteAttribute('normal')
	flat.computeVertexNormals()
	return flat
}

// A stone course: a prism from its foot (y 0) up to a chamfered rim, `sides` flat faces.
function stoneCourse(bottom, top, height, sides, bevel) {
	const b = Math.min(bevel, height / 2, top / 2)
	return new THREE.LatheGeometry(
		[
			new THREE.Vector2(bottom, 0),
			new THREE.Vector2(top, height - b),
			new THREE.Vector2(top - b, height),
			new THREE.Vector2(0, height),
		],
		sides,
	)
}
