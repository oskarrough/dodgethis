import * as THREE from 'three'
import { FORWARD_LAYER } from '../../core/stylepass.js'
import { makeStyleMaterial } from '../../core/stylepass.js'
import { tune } from './tune.js'
import { lineReach } from './skills-view.js'
import { projectMap } from './obstacles.js'

// Moba's own scene dressing: click pings, the hover ring, the held-aim indicator and the skillshot meshes. Local presentation only.
export function createView(scene, smooth) {
	const group = new THREE.Group()
	group.name = 'moba-view'
	scene.add(group)
	const owned = [] // geometries and materials to dispose
	function own(x) {
		owned.push(x)
		return x
	}
	const flat = (role) => own(makeStyleMaterial(role, { flat: true }))

	// --- Pings: a ring that contracts over 0.25 s; attack pings sit on the target. ---
	const ringGeometry = own(new THREE.RingGeometry(0.62, 0.8, 40).rotateX(-Math.PI / 2))
	const ringMaterials = { move: flat('teamA'), attack: flat('teamB'), aggro: flat('ink') }
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

	// --- Hover: the enemy an RMB would attack. ---
	const hover = new THREE.Mesh(
		own(new THREE.RingGeometry(0.58, 0.7, 40).rotateX(-Math.PI / 2)),
		flat('teamB'),
	)
	hover.visible = false
	group.add(hover)

	// --- Held aim: Q's line, as long as its range and as wide as the arrow. ---
	const line = new THREE.Mesh(
		own(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5)),
		flat('cream'),
	)
	line.visible = false
	group.add(line)
	const tip = new THREE.Mesh(
		own(new THREE.CircleGeometry(0.35, 3).rotateX(-Math.PI / 2).rotateY(Math.PI / 2)),
		flat('cream'),
	)
	tip.visible = false
	group.add(tip)

	// HP bars tick every 200 HP; they follow rendered poses, not physics ticks.
	const bars = new Map()
	const barGeometry = own(new THREE.PlaneGeometry(1, 0.16))
	const barBack = flat('ink')
	const barColors = { A: flat('teamA'), B: flat('teamB') }
	const tickGeometry = own(new THREE.PlaneGeometry(0.018, 0.16))
	function health(units, localTeam) {
		const live = new Set(units.map((u) => u.id))
		for (const [id, bar] of bars)
			if (!live.has(id)) {
				group.remove(bar.root)
				bars.delete(id)
			}
		for (const unit of units) {
			let bar = bars.get(unit.id)
			if (bar && bar.maxHp !== unit.maxHp) {
				group.remove(bar.root)
				bars.delete(unit.id)
				bar = null
			}
			if (!bar) {
				const root = new THREE.Group()
				root.rotation.x = -Math.atan2(tune.follow.height, tune.follow.back)
				const back = new THREE.Mesh(barGeometry, barBack)
				back.scale.x = 1.8
				const fill = new THREE.Mesh(barGeometry, barColors[unit.team])
				fill.position.z = 0.005
				root.add(back, fill)
				if (unit.structure) {
					const canvas = document.createElement('canvas')
					canvas.width = tune.laneView.xpWidth
					canvas.height = tune.laneView.xpHeight
					const ctx = canvas.getContext('2d')
					ctx.font = `bold ${tune.laneView.xpFont}px monospace`
					ctx.textAlign = 'center'
					ctx.fillStyle = '#fff9e8'
					ctx.fillRect(0, 0, canvas.width, canvas.height)
					ctx.fillStyle = '#26445f'
					ctx.fillText(
						`${unit.team === localTeam ? 'Your' : 'Enemy'} ${unit.kind}`,
						canvas.width / 2,
						canvas.height * tune.laneView.xpBaseline,
					)
					const texture = own(new THREE.CanvasTexture(canvas))
					const material = own(new THREE.SpriteMaterial({ map: texture, depthWrite: false }))
					const label = new THREE.Sprite(material)
					label.name = 'moba-structure-label'
					label.layers.set(FORWARD_LAYER)
					label.scale.set(tune.laneView.labelWidth, tune.laneView.labelHeight, 1)
					label.position.y = tune.laneView.labelLift
					root.add(label)
				}
				for (let hp = 200; hp < unit.maxHp; hp += 200) {
					const tick = new THREE.Mesh(tickGeometry, barBack)
					tick.position.set(-0.9 + (1.8 * hp) / unit.maxHp, 0, 0.01)
					root.add(tick)
				}
				group.add(root)
				bars.set(unit.id, (bar = { root, fill, maxHp: unit.maxHp }))
			}
			bar.root.visible = !unit.dead
			const p = unit.body.mesh.position
			bar.root.position.set(
				p.x,
				p.y + unit.body.halfHeight + (unit.structure ? 0 : unit.body.radius) + 0.4,
				p.z,
			)
			const width = (1.8 * unit.hp) / unit.maxHp
			bar.fill.scale.x = Math.max(0.001, width)
			bar.fill.position.x = -0.9 + width / 2
		}
	}

	const xpLabels = []
	function xp(amount, point) {
		const canvas = document.createElement('canvas')
		canvas.width = tune.laneView.xpWidth
		canvas.height = tune.laneView.xpHeight
		const context = canvas.getContext('2d')
		context.font = `bold ${tune.laneView.xpFont}px monospace`
		context.fillStyle = '#ffd76a'
		context.textAlign = 'center'
		context.fillText(`+${amount} XP`, canvas.width / 2, canvas.height * tune.laneView.xpBaseline)
		const texture = new THREE.CanvasTexture(canvas)
		const material = new THREE.SpriteMaterial({ map: texture, depthWrite: false })
		const mesh = new THREE.Sprite(material)
		mesh.layers.set(FORWARD_LAYER)
		mesh.position.set(point.x, tune.laneView.xpY, point.z)
		mesh.scale.set(tune.laneView.xpScale, tune.laneView.xpScale / 2, 1)
		group.add(mesh)
		xpLabels.push({ mesh, texture, material, life: tune.laneView.xpLife })
	}

	// --- Skillshots: a bright bolt with a trail that grows from the hand. ---
	const boltGeometry = own(new THREE.CapsuleGeometry(0.12, 0.7, 4, 8).rotateX(Math.PI / 2))
	const trailGeometry = own(new THREE.BoxGeometry(0.1, 0.06, 1).translate(0, 0, -0.5))
	const boltMaterial = flat('ammo')
	const trailMaterial = flat('cream')
	const bolts = new Map() // shot id → { mesh, trail, shot, from, pose, unsmooth }
	const UP = new THREE.Vector3(0, 1, 0)
	function bolt(shot, from) {
		const mesh = new THREE.Group()
		const body = new THREE.Mesh(
			boltGeometry,
			shot.slot === 'primary' || ['tower', 'ranged', 'wizard'].includes(shot.slot)
				? barColors[shot.team]
				: boltMaterial,
		)
		if (shot.slot === 'primary') body.scale.setScalar(tune.attack.visualScale)
		if (shot.slot === 'tower') body.scale.setScalar(tune.laneView.orbScale)
		const trail = new THREE.Mesh(trailGeometry, trailMaterial)
		trail.scale.z = 0.001
		mesh.add(body, trail)
		group.add(mesh)
		const pose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() }
		pose.quaternion.setFromAxisAngle(UP, Math.atan2(shot.dx, shot.dz))
		const read = () => {
			pose.position.set(shot.x, tune.loose.height, shot.z)
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
		{
			live,
			hero,
			aim,
			held,
			hovered,
			locate,
			units = [],
			lineStats = tune.loose,
			obstacles,
			localTeam = 'A',
		},
	) {
		health(units, localTeam)
		for (let i = xpLabels.length - 1; i >= 0; i--) {
			const label = xpLabels[i]
			label.life -= dt
			label.mesh.position.y += dt * tune.laneView.xpRise
			if (label.life <= 0) {
				group.remove(label.mesh)
				label.texture.dispose()
				label.material.dispose()
				xpLabels.splice(i, 1)
			}
		}
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

		const showLine = !!(held && aim && hero)
		line.visible = tip.visible = showLine
		if (showLine) {
			const dx = aim.x - hero.x
			const dz = aim.z - hero.z
			const yaw = Math.atan2(dx, dz) + Math.PI
			const length = lineReach(hero, yaw, lineStats, obstacles)
			const end = projectMap(hero, {
				x: hero.x - Math.sin(yaw) * length,
				z: hero.z - Math.cos(yaw) * length,
			})
			line.position.set(hero.x, tune.map.markerLayers.aim, hero.z)
			line.rotation.y = yaw
			line.scale.set(lineStats.radius * 2, 1, length)
			tip.position.set(end.x, tune.map.markerLayers.aimTip, end.z)
			tip.rotation.y = yaw
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
		for (const label of xpLabels) {
			group.remove(label.mesh)
			label.texture.dispose()
			label.material.dispose()
		}
		xpLabels.length = 0
		for (const id of bolts.keys()) unbolt(id)
		for (const p of pings) {
			p.life = 0
			p.mesh.visible = false
		}
		hover.visible = line.visible = tip.visible = false
	}

	function dispose() {
		reset()
		scene.remove(group)
		for (const x of owned) x.dispose()
	}

	return { ping, xp, bolt, unbolt, update, reset, dispose }
}

const PING = 0.25
