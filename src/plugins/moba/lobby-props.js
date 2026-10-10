import * as THREE from 'three'
import { createBody } from '../../core/body.js'
import { PALETTE } from '../../core/style.js'
import { FORWARD_LAYER, makeStyleMaterial } from '../../core/stylepass.js'
import { dressHero } from './hero-view.js'
import { HEROES } from './heroes.js'
import { tune } from './tune.js'
import { closest } from './skillshot.js'
import { createFaceKit, createMagnets } from './lobby-magnets.js'

// DOM-free picking: the sim offers only the footprint that actually happened,
// clipped by cover/body contact, and retains a successful result on its cast token.
export function createDifficultyGallery({ local, difficulty, present, dummies = () => [] }) {
	const v = tune.lobby.gallery
	const standees = ['easy', 'normal', 'hard'].map((id, i) => ({
		id,
		x: v.x + (i - 1) * v.spacing,
		z: v.z,
		radius: v.radius,
		from: id === difficulty ? 0 : -Math.PI / 2,
		to: id === difficulty ? 0 : -Math.PI / 2,
		changedAt: -Infinity,
	}))
	let picked = difficulty
	function angle(stand, tick, step) {
		if (!Number.isFinite(stand.changedAt)) return stand.to
		const age = Math.max(0, Math.min(1, ((tick - stand.changedAt) * step) / v.settleTime))
		const ease = 1 - (1 - age) ** 3
		return stand.from + (stand.to - stand.from) * (ease + Math.sin(age * Math.PI) * v.overshoot)
	}
	function aimsAt(aim, radius = v.aimRadius) {
		return !!aim && standees.some((s) => Math.hypot(aim.x - s.x, aim.z - s.z) <= radius)
	}
	function contact(f) {
		if (f.hero !== local || !aimsAt(f.aim)) return false
		if (f.phase === 'aim') return true
		const centre = f.from ? { x: (f.from.x + f.to.x) / 2, z: (f.from.z + f.to.z) / 2 } : f.point
		let best = null,
			nearest = Infinity
		for (const s of standees) {
			const aimDistance = Math.hypot(f.aim.x - s.x, f.aim.z - s.z)
			if (aimDistance > v.aimRadius) continue
			if (
				dummies().some(
					(d) =>
						!d.dead &&
						Math.hypot(f.aim.x - d.body.position.x, f.aim.z - d.body.position.z) < aimDistance,
				)
			)
				continue
			let distance = f.from
				? closest(f.from.x, f.from.z, f.to.x, f.to.z, s.x, s.z).d - f.radius
				: Math.hypot(s.x - f.point.x, s.z - f.point.z) - f.radius
			if (f.dir && f.angle < 360) {
				const dx = s.x - f.point.x,
					dz = s.z - f.point.z
				const len = Math.hypot(dx, dz)
				const half = (f.angle * Math.PI) / 360
				if ((dx * f.dir.x + dz * f.dir.z) / (len || 1) < Math.cos(half)) {
					distance = Math.min(
						...[-1, 1].map((sign) => {
							const a = Math.atan2(f.dir.x, f.dir.z) + sign * half
							return closest(
								f.point.x,
								f.point.z,
								f.point.x + Math.sin(a) * f.radius,
								f.point.z + Math.cos(a) * f.radius,
								s.x,
								s.z,
							).d
						}),
					)
				}
			}
			if (distance > s.radius) continue
			const d = Math.hypot(s.x - centre.x, s.z - centre.z)
			if (d < nearest || (d === nearest && (!best || s.id < best.id))) {
				best = s
				nearest = d
			}
		}
		if (!best) return false
		select(best.id, f.tick, f.step)
		present({
			type: 'pick',
			hero: local,
			difficulty: picked,
			cast: f.cast,
			ability: f.ability,
			footprint: f.kind,
			point: { x: best.x, y: 0, z: best.z },
			tick: f.tick,
		})
		return true
	}
	function select(id, tick, step) {
		picked = id
		for (const s of standees) {
			s.from = angle(s, tick, step)
			s.to = s.id === picked ? 0 : -Math.PI / 2
			s.changedAt = tick
		}
	}
	return {
		standees,
		select,
		aimsAt,
		contact,
		angle,
		get difficulty() {
			return picked
		},
	}
}

// Handmade toy props, not combatants. All animation reads the interpolated sim clock.
export function createLobbyProps(scene, el, gallery, readySeats, local, audio) {
	const root = new THREE.Group()
	root.name = 'lobby-props'
	scene.add(root)
	const owned = []
	const material = (role) => {
		const m = makeStyleMaterial(role, { flat: true, side: THREE.DoubleSide })
		owned.push(m)
		return m
	}
	const ink = material('ink'),
		cream = material('cream')
	const picked = material('ammo')
	function mesh(geometry, mat, parent) {
		owned.push(geometry)
		const m = new THREE.Mesh(geometry, mat)
		parent.add(m)
		return m
	}
	const definitions = Object.values(HEROES)
	const faces = createFaceKit()
	const magnets = createMagnets(root, gallery, faces, audio)
	const galleryProps = magnets.props.map((p) => {
		const label = document.createElement('div')
		label.className = 'lobby-label lobby-gallery-label'
		label.dataset.difficulty = p.stand.id
		label.append(document.createElement('kbd'), document.createTextNode(p.stand.id))
		el.append(label)
		p.label = label
		return p
	})
	const r = tune.lobby.ready
	const seatColors = { A: material('teamA'), B: material('teamB') }
	// A bot's seat holds a hologram of its hero: see-through, scanlined, rimmed, bobbing above the plate.
	const holo = tune.lobby.ready.hologram
	const holoMaterials = Object.fromEntries(
		['A', 'B'].map((team) => {
			const m = new THREE.ShaderMaterial({
				uniforms: {
					uColor: { value: new THREE.Color(PALETTE[team === 'A' ? 'teamA' : 'teamB']) },
					uTime: { value: 0 },
					uOpacity: { value: holo.opacity },
					uLines: { value: holo.lines },
				},
				vertexShader: `
					varying vec3 vNormal;
					varying vec3 vView;
					varying float vY;
					void main() {
						vec4 world = modelMatrix * vec4(position, 1.0);
						vY = world.y;
						vec4 view = viewMatrix * world;
						vView = normalize(-view.xyz);
						vNormal = normalize(normalMatrix * normal);
						gl_Position = projectionMatrix * view;
					}`,
				fragmentShader: `
					uniform vec3 uColor;
					uniform float uTime;
					uniform float uOpacity;
					uniform float uLines;
					varying vec3 vNormal;
					varying vec3 vView;
					varying float vY;
					void main() {
						float rim = pow(1.0 - abs(dot(normalize(vNormal), vView)), 2.0);
						float scan = 0.5 + 0.5 * sin((vY * uLines - uTime * 0.35) * 6.2832);
						float breathe = 0.85 + 0.15 * sin(uTime * 1.3);
						float alpha = uOpacity * (0.3 + 0.7 * rim) * (0.7 + 0.3 * scan) * breathe;
						gl_FragColor = vec4(mix(uColor, vec3(1.0), rim * 0.55), alpha);
					}`,
				transparent: true,
				depthWrite: false,
			})
			owned.push(m)
			return [team, m]
		}),
	)
	const holoFace = new THREE.MeshBasicMaterial({
		color: PALETTE.cream,
		transparent: true,
		opacity: holo.opacity,
		depthWrite: false,
		side: THREE.DoubleSide,
	})
	owned.push(holoFace)
	const seatProps = readySeats.seats.map((seat) => {
		const group = new THREE.Group()
		group.position.set(seat.x, 0, seat.z)
		root.add(group)
		const border = mesh(new THREE.PlaneGeometry(r.width, r.depth).rotateX(-Math.PI / 2), ink, group)
		border.position.y = r.borderY
		const background = mesh(
			new THREE.PlaneGeometry(r.width - r.borderWidth * 2, r.depth - r.borderWidth * 2).rotateX(
				-Math.PI / 2,
			),
			cream,
			group,
		)
		background.position.y = r.boxY
		// The inset covers the backing print, leaving an ink frame; fill has its own layer.
		const fill = mesh(
			new THREE.PlaneGeometry(r.width - r.borderWidth * 2, r.depth - r.borderWidth * 2).rotateX(
				-Math.PI / 2,
			),
			seatColors[seat.team],
			group,
		)
		fill.position.y = r.fillY
		const holograms = definitions
			.filter((d) => d.playable)
			.map((definition) => {
				const body = createBody(group, null, null, {
					profile: definition.base,
					position: [0, 0, 0],
					replica: true,
				})
				const undress = dressHero(body, definition.id, seat.team)
				const swapped = []
				body.mesh.traverse((o) => {
					if (!o.isMesh) return
					swapped.push([o, o.material])
					o.material = holoMaterials[seat.team]
					o.layers.set(FORWARD_LAYER)
					o.castShadow = false
				})
				body.mesh.rotation.y = Math.PI
				body.mesh.visible = false
				const { radius, halfHeight } = definition.base
				return {
					id: definition.id,
					body,
					undress,
					swapped,
					baseY: body.mesh.position.y,
					head: {
						y: halfHeight + radius * 0.35,
						z: -radius * 0.94 - holo.faceGap,
						size: radius * holo.face,
					},
				}
			})
		const face = new THREE.Group()
		face.rotation.y = Math.PI
		const moods = {}
		for (const s of gallery.standees) {
			const f = faces.face(s.id, 1, holoFace)
			f.traverse((o) => {
				o.layers.set(FORWARD_LAYER)
				o.renderOrder = 1
			})
			face.add(f)
			moods[s.id] = f
		}
		return { seat, fill, holograms, face, moods }
	})
	function syncSeats() {
		for (const p of seatProps) {
			const owner = p.seat.occupant
			let shown = null
			for (const h of p.holograms) {
				h.body.mesh.visible = !!owner?.bot && owner.heroId === h.id
				if (h.body.mesh.visible) shown = h
			}
			if (shown && p.face.parent !== shown.body.mesh) {
				shown.body.mesh.add(p.face)
				p.face.position.set(0, shown.head.y, shown.head.z)
				p.face.scale.setScalar(shown.head.size)
			}
			for (const id in p.moods) p.moods[id].visible = id === gallery.difficulty
			p.fill.material = owner?.id === local ? picked : seatColors[p.seat.team]
		}
	}
	// Presentation-only inspection targets: these never enter the sim's unit database.
	const inspectables = []
	const bounds = new THREE.Box3()
	function inspectTarget(id, card, position, build, visible = () => true) {
		inspectables.push({
			id,
			position,
			card: build,
			visible,
			bounds() {
				card.updateWorldMatrix(true, true)
				bounds.setFromObject(card)
				position.x = (bounds.min.x + bounds.max.x) / 2
				position.y = bounds.max.y
				position.z = (bounds.min.z + bounds.max.z) / 2
				return bounds
			},
		})
	}
	for (const p of seatProps)
		for (const h of p.holograms)
			inspectTarget(
				'bot:' + p.seat.id + ':' + h.id,
				h.body.mesh,
				{ x: p.seat.x, y: r.fillY, z: p.seat.z },
				() => ({ type: 'bot', heroId: h.id, seat: p.seat.id }),
				() => h.body.mesh.visible,
			)
	const point = new THREE.Vector3()
	// Left/top, not a transform: the labels' tilt and scale turn about their own centre,
	// and would swing a transform's screen offset with them.
	function place(label) {
		label.style.left = `${((point.x + 1) * innerWidth) / 2}px`
		label.style.top = `${((1 - point.y) * innerHeight) / 2}px`
	}
	function labels() {
		for (const p of galleryProps) {
			const chosen = p.stand.id === gallery.difficulty
			p.label.dataset.picked = String(chosen)
			p.label.querySelector('kbd').hidden = !chosen
		}
	}
	labels()
	return {
		galleryProps,
		seatProps,
		inspectables,
		syncSeats,
		selectDifficulty: labels,
		setDevice(device) {
			for (const p of galleryProps)
				p.label.querySelector('kbd').textContent = device === 'gamepad' ? '✛↓' : ''
		},
		update(tick, camera, step) {
			syncSeats()
			const time = tick * step
			for (const m of Object.values(holoMaterials)) m.uniforms.uTime.value = time
			for (const p of seatProps) {
				for (const [i, h] of p.holograms.entries()) {
					if (!h.body.mesh.visible) continue
					const phase = time + p.seat.x + p.seat.z + i
					h.body.mesh.position.y =
						h.baseY + r.fillY + holo.float + Math.sin(phase * holo.bobRate) * holo.bob
					h.body.mesh.rotation.y = Math.PI + Math.sin(phase * holo.swayRate) * holo.sway
				}
				const progress = readySeats.progress(p.seat, tick, step)
				p.fill.visible = progress > 0
				p.fill.scale.x = progress
				p.fill.position.x = ((progress - 1) * (r.width - r.borderWidth * 2)) / 2
			}
			magnets.update(time, step)
			for (const p of galleryProps) {
				point.set(p.stand.x, tune.lobby.gallery.labelY, p.stand.z).project(camera)
				p.label.hidden = point.z < -1 || point.z > 1
				place(p.label)
			}
		},
		dispose() {
			root.removeFromParent()
			for (const p of galleryProps) p.label.remove()
			magnets.dispose()
			faces.dispose()
			for (const p of seatProps)
				for (const h of p.holograms) {
					p.face.removeFromParent()
					for (const [o, original] of h.swapped) o.material = original
					h.undress()
					h.body.dispose()
				}
			for (const item of owned) item.dispose()
		},
	}
}
