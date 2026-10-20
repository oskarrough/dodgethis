import * as THREE from 'three'
import { makeStyleMaterial } from '../../core/stylepass.js'
import { tune } from './tune.js'
import { look } from './look.js'
import { abilityOf } from './ability.js'
import { lineReach, bouncedLinePath } from './skills-view.js'
import { projectMap } from './obstacles.js'
import { createHealthBars } from './health-bars.js'
import { createDamageNumbers } from './damage-numbers.js'

// Moba's own scene dressing: click pings, the hover ring, the held-aim indicator and the skillshot meshes. Local presentation only.
export function createView(scene, smooth) {
	const group = new THREE.Group()
	group.name = 'moba-view'
	scene.add(group)
	const owned = []
	function own(x) {
		owned.push(x)
		return x
	}
	const flat = (role) => own(makeStyleMaterial(role, { flat: true }))

	// --- Pings: a ring that contracts over 0.25 s; attack pings sit on the target. ---
	const ringGeometry = own(new THREE.RingGeometry(0.62, 0.8, 40).rotateX(-Math.PI / 2))
	const ringMaterials = {
		move: flat('teamA'),
		attack: flat('teamB'),
		'attack-move': flat('teamB'),
		aggro: flat('ink'),
	}
	const pings = Array.from({ length: 10 }, () => {
		const mesh = new THREE.Mesh(ringGeometry, ringMaterials.move)
		mesh.visible = false
		group.add(mesh)
		return { mesh, life: 0, size: 1, follow: null }
	})
	let nextPing = 0
	function ping(kind, point, { follow = null, size = 1 } = {}) {
		const p = pings[nextPing]
		nextPing = (nextPing + 1) % pings.length
		p.mesh.material = ringMaterials[kind]
		p.mesh.position.set(point.x, tune.map.markerLayers.ping, point.z)
		p.life = PING
		p.size = size
		p.follow = follow
		p.mesh.visible = true
	}

	const hover = new THREE.Mesh(
		own(new THREE.RingGeometry(0.58, 0.7, 40).rotateX(-Math.PI / 2)),
		flat('teamB'),
	)
	hover.visible = false
	group.add(hover)

	// The OS hides its pointer during key repeat, so the reticle is drawn.
	const reticle = new THREE.Mesh(
		own(
			new THREE.RingGeometry(tune.map.reticle.inner, tune.map.reticle.outer, 32).rotateX(
				-Math.PI / 2,
			),
		),
		flat('ink'),
	)
	reticle.visible = false
	group.add(reticle)

	const line = new THREE.Mesh(
		own(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5)),
		flat('cream'),
	)
	line.visible = false
	group.add(line)
	const lineMaterial = line.material
	const dotted = flat('cream')
	dotted.uniforms.uAimRadius = { value: look.abilityView.bouncedAimRadius }
	dotted.uniforms.uAimSpacing = { value: look.abilityView.bouncedAimSpacing }
	// Cut world-sized dots out of each strip, so a long reflected leg doesn't stretch them.
	dotted.vertexShader =
		'varying vec2 vAimCoordinates;\n' +
		dotted.vertexShader.replace(
			'void main() {',
			`void main() {
				vAimCoordinates = vec2((uv.x - 0.5) * length(modelMatrix[0].xyz), uv.y * length(modelMatrix[2].xyz));`,
		)
	dotted.fragmentShader =
		'uniform float uAimRadius;\nuniform float uAimSpacing;\nvarying vec2 vAimCoordinates;\n' +
		dotted.fragmentShader.replace(
			'void main() {',
			`void main() {
				vec2 dotOffset = vec2(vAimCoordinates.x, mod(vAimCoordinates.y + uAimSpacing * 0.5, uAimSpacing) - uAimSpacing * 0.5);
				if (length(dotOffset) > uAimRadius) discard;`,
		)
	const lines = [line] // Reuse one strip per leg, with shared geometry and materials.
	const tip = new THREE.Mesh(
		own(new THREE.CircleGeometry(0.35, 3).rotateX(-Math.PI / 2).rotateY(Math.PI / 2)),
		flat('cream'),
	)
	tip.visible = false
	group.add(tip)

	const health = createHealthBars()
	const barColors = { A: flat('teamA'), B: flat('teamB') }

	const numbers = createDamageNumbers(group)

	const boltGeometry = own(new THREE.CapsuleGeometry(0.12, 0.7, 4, 8).rotateX(Math.PI / 2))
	const trailGeometry = own(new THREE.BoxGeometry(0.1, 0.06, 1).translate(0, 0, -0.5))
	const boltMaterial = flat('ammo')
	// Ricochet's celluloid ball: cream, so gold stays the Ball's and the ammo's.
	const celluloidGeometry = own(new THREE.SphereGeometry(0.2, 12, 8))
	const celluloidMaterial = flat('cream')
	const trailMaterial = flat('cream')
	const bolts = new Map() // shot id → { mesh, trail, shot, from, pose, unsmooth }
	const UP = new THREE.Vector3(0, 1, 0)
	function bolt(shot, from) {
		const mesh = new THREE.Group()
		const spherical = shot.ability === 'bank' || abilityOf(shot.ability)?.projectileShape === 'ball'
		const body = new THREE.Mesh(
			spherical ? celluloidGeometry : boltGeometry,
			spherical
				? celluloidMaterial
				: shot.slot === 'primary' || ['tower', 'ranged', 'wizard'].includes(shot.slot)
					? barColors[shot.team]
					: boltMaterial,
		)
		if (shot.slot === 'primary') body.scale.setScalar(tune.attack.visualScale)
		if (shot.slot === 'tower') body.scale.setScalar(look.laneView.orbScale)
		const trail = new THREE.Mesh(trailGeometry, trailMaterial)
		trail.scale.z = 0.001
		mesh.add(body, trail)
		group.add(mesh)
		const pose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() }
		pose.quaternion.setFromAxisAngle(UP, Math.atan2(shot.dx, shot.dz))
		const read = () => {
			pose.position.set(shot.x, tune.projectile.height, shot.z)
			pose.quaternion.setFromAxisAngle(UP, Math.atan2(shot.dx, shot.dz))
			return pose
		}
		read()
		mesh.position.copy(pose.position)
		mesh.quaternion.copy(pose.quaternion)
		const unsmooth = smooth(mesh, read)
		bolts.set(shot.id, { mesh, trail, shot, from: { x: from.x, z: from.z }, unsmooth })
	}
	function unbolt(id) {
		const b = bolts.get(id)
		if (!b) return null
		b.unsmooth()
		group.remove(b.mesh)
		bolts.delete(id)
		return b
	}

	// Per rendered frame. `live` is the set of shot ids still flying; the rest are returned so feedback can fizzle them.
	function update(
		dt,
		{ live, hero, aim, held, hovered, target, locate, lineStats = tune.loose, obstacles, bounds },
	) {
		numbers.update(dt)
		for (const p of pings) {
			if (p.life <= 0) continue
			p.life -= dt
			if (p.life <= 0) {
				p.mesh.visible = false
				continue
			}
			if (p.follow) {
				const at = locate(p.follow)
				if (at) p.mesh.position.set(at.x, tune.map.markerLayers.ping, at.z)
			}
			const s = p.life / PING
			p.mesh.scale.setScalar(p.size * (0.3 + 0.9 * s))
		}
		hover.visible = !!hovered
		if (hovered) hover.position.set(hovered.x, tune.map.markerLayers.hover, hovered.z)
		reticle.visible = !!target
		if (target) reticle.position.set(target.x, tune.map.markerLayers.reticle, target.z)

		const showLine = !!(held && aim && hero)
		for (const leg of lines) leg.visible = false
		tip.visible = showLine
		if (showLine) {
			const dx = aim.x - hero.x
			const dz = aim.z - hero.z
			const yaw = Math.atan2(dx, dz) + Math.PI
			if (lineStats.bounce) {
				dotted.uniforms.uAimRadius.value = look.abilityView.bouncedAimRadius
				dotted.uniforms.uAimSpacing.value = look.abilityView.bouncedAimSpacing
				tip.scale.setScalar(look.abilityView.bouncedAimTipScale)
				const path = bouncedLinePath(hero, yaw, lineStats, obstacles, bounds)
				for (const [i, { from, to }] of path.entries()) {
					if (!lines[i]) {
						lines[i] = new THREE.Mesh(line.geometry, line.material)
						group.add(lines[i])
					}
					const leg = lines[i]
					leg.material = dotted
					const turn = Math.atan2(to.x - from.x, to.z - from.z) + Math.PI
					leg.visible = true
					leg.position.set(from.x, tune.map.markerLayers.aim, from.z)
					leg.rotation.y = turn
					leg.scale.set(
						look.abilityView.bouncedAimRadius * 2,
						1,
						Math.hypot(to.x - from.x, to.z - from.z),
					)
					tip.position.set(to.x, tune.map.markerLayers.aimTip, to.z)
					tip.rotation.y = turn
				}
				tip.visible = path.length > 0
			} else {
				line.material = lineMaterial
				tip.scale.setScalar(1)
				const length = lineReach(hero, yaw, lineStats, obstacles, bounds)
				const end = projectMap(
					hero,
					{
						x: hero.x - Math.sin(yaw) * length,
						z: hero.z - Math.cos(yaw) * length,
					},
					bounds,
				)
				line.visible = true
				line.position.set(hero.x, tune.map.markerLayers.aim, hero.z)
				line.rotation.y = yaw
				line.scale.set(lineStats.radius * 2, 1, length)
				tip.position.set(end.x, tune.map.markerLayers.aimTip, end.z)
				tip.rotation.y = yaw
			}
		}

		const gone = []
		for (const [id, b] of bolts) {
			if (!live.has(id)) {
				gone.push(unbolt(id))
				continue
			}
			const p = b.mesh.position
			b.trail.scale.z = Math.max(
				0.001,
				Math.min(1.8, Math.hypot(p.x - b.from.x, p.z - b.from.z) - 0.3),
			)
		}
		return gone
	}

	function reset() {
		health.reset()
		numbers.reset()
		for (const id of bolts.keys()) unbolt(id)
		for (const p of pings) {
			p.life = 0
			p.mesh.visible = false
		}
		for (const leg of lines) leg.visible = false
		hover.visible = reticle.visible = tip.visible = false
	}

	function dispose() {
		reset()
		health.dispose()
		scene.remove(group)
		for (const x of owned) x.dispose()
	}

	return {
		ping,
		pop: numbers.pop,
		damage: numbers.hit,
		heal: numbers.heal,
		xp: numbers.xp,
		bolt,
		unbolt,
		update,
		health: health.update,
		reset,
		dispose,
	}
}

const PING = 0.25
