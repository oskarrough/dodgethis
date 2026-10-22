import * as THREE from 'three'
import { makeStyleMaterial } from '../../core/stylepass.js'
import { STEP } from '../../core/app.js'
import { tune } from './tune.js'
import { look } from './look.js'
import { clampMap } from './obstacles.js'

// Opaque print geometry; tick interpolation owns every fill and projectile position.
export function createBallView(scene, rng = Math.random) {
	const v = tune.ballView
	const owned = []
	const root = new THREE.Group()
	scene.add(root)
	const material = (role) => {
		const m = makeStyleMaterial(role, { flat: true })
		owned.push(m)
		return m
	}
	const cream = material('cream'),
		ink = material('ink'),
		accent = material('ammo')
	const teams = { A: material('teamA'), B: material('teamB') }
	function mesh(geometry, mat, parent = root) {
		owned.push(geometry)
		const m = new THREE.Mesh(geometry, mat)
		parent.add(m)
		return m
	}
	function ring(radius, y, mat) {
		const m = mesh(new THREE.RingGeometry(radius - v.ringWidth, radius, v.segments), mat)
		m.rotation.x = -Math.PI / 2
		m.position.y = y
		return m
	}
	const warning = ring(tune.map.plazaRadius, v.ringY, ink)
	const fill = ring(tune.map.plazaRadius - v.ringBorder, v.fillY, accent)
	const channel = ring(v.channelRadius, v.fillY, accent)
	const ball = new THREE.Group()
	root.add(ball)
	mesh(new THREE.SphereGeometry(v.radius, v.segments, v.segments / 2), cream, ball)
	for (const rotation of [0, Math.PI / 2]) {
		const seam = mesh(new THREE.TorusGeometry(v.radius, v.seamWidth, 8, v.segments), ink, ball)
		seam.rotation.y = rotation
	}
	const shadow = mesh(new THREE.CircleGeometry(v.radius, v.segments), ink)
	shadow.rotation.x = -Math.PI / 2
	shadow.position.y = v.shadowY
	const teamRing = mesh(
		new THREE.TorusGeometry(v.teamRingRadius, v.teamRingWidth, 8, v.segments),
		cream,
		ball,
	)
	const aim = mesh(new THREE.PlaneGeometry(1, 1), cream)
	aim.rotation.x = -Math.PI / 2
	aim.position.y = v.aimFillY
	const aimOutline = mesh(new THREE.PlaneGeometry(1, 1), ink)
	aimOutline.rotation.x = -Math.PI / 2
	aimOutline.position.y = v.aimY
	const gags = new Map()
	const confetti = new THREE.Group()
	root.add(confetti)
	const chips = Array.from({ length: look.ballConfetti.count }, (_, i) => {
		const chip = mesh(
			new THREE.BoxGeometry(look.ballConfetti.size, look.ballConfetti.size, v.seamWidth),
			[cream, teams.A, teams.B][i % 3],
			confetti,
		)
		return chip
	})
	let burst = null
	let flights = []
	let previous = null
	let current = null
	let lastTick = -1
	function sweep(m, fraction) {
		const progress = Math.max(0, Math.min(1, fraction))
		const positions = m.geometry.attributes.position
		const { innerRadius, outerRadius } = m.geometry.parameters
		for (let i = 0; i < positions.count; i++) {
			const angle = Math.min((i % (v.segments + 1)) / v.segments, progress) * Math.PI * 2
			const radius = i <= v.segments ? innerRadius : outerRadius
			positions.setXY(i, Math.cos(angle) * radius, Math.sin(angle) * radius)
		}
		positions.needsUpdate = true
	}
	return {
		root,
		get markerPosition() {
			return ball.visible ? ball.position : null
		},
		present(fact) {
			if (fact.type === 'ballHit' && fact.kind === 'structure') {
				burst = { point: fact.point, tick: fact.tick }
				const c = look.ballConfetti
				flights = chips.map(() => {
					const angle = rng() * Math.PI * 2
					const speed = c.speed * (c.speedMin + (1 - c.speedMin) * rng())
					return {
						vx: Math.cos(angle) * speed,
						vz: Math.sin(angle) * speed,
						vy: c.lift * (c.liftMin + (1 - c.liftMin) * rng()),
						spin: (rng() * 2 - 1) * c.spin,
						angle,
					}
				})
			}
		},
		update(sim, alpha, local, target, camera = null, effectTick = sim.tick + alpha) {
			const state = sim.ball.state
			if (sim.tick !== lastTick) {
				previous = current
				current = state ? { id: state.id, pos: { ...state.pos }, state: state.state } : null
				lastTick = sim.tick
			}
			warning.visible = fill.visible = state?.state === 'warning'
			ball.visible = !!state && state.state !== 'warning'
			shadow.visible = !!state && ['loose', 'flying'].includes(state.state)
			teamRing.visible = !!state?.team && ['carried', 'flying'].includes(state.state)
			if (teamRing.visible) teamRing.material = teams[state.team]
			if (camera) teamRing.quaternion.copy(camera.quaternion)
			channel.visible = state?.state === 'channel'
			aim.visible = aimOutline.visible = false
			if (state) {
				if (state.state === 'warning')
					sweep(fill, (sim.tick + alpha - state.warnAt) / Math.max(1, state.spawnAt - state.warnAt))
				const carrier = sim.heroes.find((h) => h.id === state.carrier)
				const from = sim.ball.buffered
					? state.pos
					: state.state === 'flying' && state.releaseTick === sim.tick
						? state.releasePos
						: previous?.id === state.id
							? previous.pos
							: state.pos
				const x = carrier
					? carrier.body.mesh.position.x
					: THREE.MathUtils.lerp(from.x, state.pos.x, alpha)
				const z = carrier
					? carrier.body.mesh.position.z
					: THREE.MathUtils.lerp(from.z, state.pos.z, alpha)
				const descent =
					state.state === 'flying'
						? Math.max(
								0,
								Math.min(
									1,
									((sim.tick - state.releaseTick + alpha) * STEP) / Math.max(STEP, v.flightEase),
								),
							)
						: 1
				const eased = descent * descent * (3 - 2 * descent)
				ball.position.set(
					x,
					carrier ? v.carryHeight : THREE.MathUtils.lerp(v.carryHeight, v.height, eased),
					z,
				)
				shadow.position.x = x
				shadow.position.z = z
				channel.position.x = x
				channel.position.z = z
				if (state.channel)
					sweep(
						channel,
						(sim.tick + alpha - state.channel.startTick) /
							Math.max(1, state.channel.endTick - state.channel.startTick),
					)
				const throwing = sim.heroes.find((h) => h.ballThrow)
				const aimer = throwing ?? (carrier?.id === local ? carrier : null)
				if (aimer) {
					const p = aimer.body.mesh.position
					const dir =
						throwing?.ballThrow.dir ?? (target ? { x: target.x - p.x, z: target.z - p.z } : null)
					if (dir) {
						const length = Math.hypot(dir.x, dir.z) || 1
						const progress = throwing
							? (sim.tick + alpha - throwing.ballThrow.startTick) /
								Math.max(1, throwing.ballThrow.endTick - throwing.ballThrow.startTick)
							: 1
						const fullEnd = clampMap({
							x: p.x + (dir.x / length) * tune.ball.range,
							z: p.z + (dir.z / length) * tune.ball.range,
						})
						aimOutline.visible = true
						aimOutline.scale.y = tune.ball.radius * 2 + v.aimBorder * 2
						aim.material = teams[aimer.team]
						aim.scale.y = tune.ball.radius * 2
						aimOutline.scale.x = Math.hypot(fullEnd.x - p.x, fullEnd.z - p.z)
						aimOutline.rotation.z = -Math.atan2(fullEnd.z - p.z, fullEnd.x - p.x)
						aimOutline.position.set((p.x + fullEnd.x) / 2, v.aimY, (p.z + fullEnd.z) / 2)
						const reach = tune.ball.range * Math.max(0, Math.min(1, progress))
						const end = clampMap({
							x: p.x + (dir.x / length) * reach,
							z: p.z + (dir.z / length) * reach,
						})
						aim.visible = true
						aim.scale.x = Math.hypot(end.x - p.x, end.z - p.z)
						aim.rotation.z = -Math.atan2(end.z - p.z, end.x - p.x)
						aim.position.set((p.x + end.x) / 2, v.aimFillY, (p.z + end.z) / 2)
					}
				}
			}
			const age = burst ? (effectTick - burst.tick) * STEP : Infinity
			confetti.visible = age >= 0 && age < look.ballConfetti.life
			if (confetti.visible) {
				const c = look.ballConfetti
				confetti.position.set(burst.point.x, burst.point.y, burst.point.z)
				for (const [i, chip] of chips.entries()) {
					const f = flights[i]
					chip.position.set(f.vx * age, f.vy * age - (c.gravity * age * age) / 2, f.vz * age)
					chip.rotation.set(age * f.spin, f.angle + age * f.spin, f.angle)
				}
			}
			for (const u of sim.lane.structures) {
				if (!gags.has(u.id)) {
					const group = new THREE.Group()
					root.add(group)
					for (const sign of [-1, 1]) {
						const tape = mesh(
							new THREE.BoxGeometry(v.gagWidth, v.gagHeight, v.gagHeight),
							cream,
							group,
						)
						tape.rotation.z = sign * v.gagAngle
					}
					group.position.set(u.body.position.x, tune[u.kind].height, u.body.position.z)
					gags.set(u.id, group)
				}
				const gag = gags.get(u.id)
				gag.visible = !u.dead && sim.tick + alpha < u.silentUntil
				gag.scale.setScalar(
					Math.max(0, Math.min(1, (u.silentUntil - sim.tick - alpha) / (tune.ball.silence / STEP))),
				)
			}
		},
		dispose() {
			root.removeFromParent()
			for (const item of owned) item.dispose()
		},
	}
}
