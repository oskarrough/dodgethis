import * as THREE from 'three'
import { makeStyleMaterial } from '../../core/stylepass.js'
import { chippedBlock } from './carve.js'
import { createEffects } from './effects.js'
import { channelAt } from './maps/lobby/lobby-layout.js'
import { tune } from './tune.js'

// What the lobby's props do when you use them: the bell swings in its arch when something rings it
// (lobby-props.js `createBell`), and the acequia rings round anyone wading through it.
// `onPresent` listeners live as long as the run, so a disposed view just stops answering.
export function createLobbyPropsView({ scene, sim, gallery, onPresent }) {
	const v = tune.lobby.bell
	const c = tune.lobby.channel
	const group = new THREE.Group()
	scene.add(group)
	const effects = createEffects(group)
	const owned = []
	const own = (thing) => (owned.push(thing), thing)
	const wall = own(makeStyleMaterial('cream'))
	const clay = own(makeStyleMaterial('terracotta'))
	const verdigris = own(makeStyleMaterial('seaTeal', { side: THREE.DoubleSide }))
	const ink = own(makeStyleMaterial('ink', { flat: true }))
	const wood = own(makeStyleMaterial('driftwood'))

	// An espadaña: one whitewashed wall under a pointed gable with three stone balls, opened by an
	// arch nearly its own width and turned toward the camera, so the bell hanging in it is what you see.
	const arch = new THREE.Group()
	arch.position.set(v.x, 0, v.z)
	arch.rotation.y = v.yaw
	group.add(arch)
	const outline = new THREE.Shape()
	outline.moveTo(-0.78, 0)
	outline.lineTo(0.78, 0)
	outline.lineTo(0.78, 2.5)
	outline.lineTo(0, 3.05)
	outline.lineTo(-0.78, 2.5)
	outline.closePath()
	const hole = new THREE.Path()
	hole.moveTo(-0.5, 0.62)
	hole.lineTo(0.5, 0.62)
	hole.lineTo(0.5, 1.82)
	hole.absarc(0, 1.82, 0.5, 0, Math.PI, false)
	hole.closePath()
	outline.holes.push(hole)
	const wallGeo = own(
		new THREE.ExtrudeGeometry(outline, { depth: 0.28, bevelEnabled: false, curveSegments: 18 }),
	)
	wallGeo.translate(0, 0.3, -0.14)
	arch.add(new THREE.Mesh(wallGeo, wall))
	const step = own(new THREE.BoxGeometry(1, 1, 1))
	for (const [w, h, d, y] of [
		[2, 0.15, 0.85, 0.075],
		[1.75, 0.15, 0.55, 0.225],
	]) {
		const block = new THREE.Mesh(step, clay)
		block.scale.set(w, h, d)
		block.position.y = y
		arch.add(block)
	}
	const cornice = new THREE.Mesh(step, clay)
	cornice.scale.set(1.72, 0.08, 0.36)
	cornice.position.y = 2.8
	arch.add(cornice)
	const ball = own(new THREE.SphereGeometry(0.11, 14, 10))
	for (const [x, y] of [
		[-0.74, 2.92],
		[0.74, 2.92],
		[0, 3.47],
	]) {
		const finial = new THREE.Mesh(ball, clay)
		finial.position.set(x, y, 0)
		arch.add(finial)
	}
	const beam = new THREE.Mesh(step, wood)
	beam.scale.set(1.04, 0.09, 0.12)
	beam.position.y = 2.36
	arch.add(beam)
	// The bell swings from the beam; its clapper hangs inside the mouth.
	const pivot = new THREE.Group()
	pivot.name = 'lobby-bell'
	pivot.position.y = 2.32
	arch.add(pivot)
	const profile = [
		[0, 0],
		[0.09, 0],
		[0.15, -0.05],
		[0.19, -0.17],
		[0.21, -0.36],
		[0.27, -0.52],
		[0.36, -0.6],
		[0.35, -0.64],
		[0.27, -0.61],
	].map(([r, y]) => new THREE.Vector2(r, y))
	pivot.add(new THREE.Mesh(own(new THREE.LatheGeometry(profile, 32)), verdigris))
	const clapper = new THREE.Mesh(own(new THREE.SphereGeometry(0.075, 10, 8)), ink)
	clapper.position.y = -0.56
	pivot.add(clapper)

	// The difficulty plates: three worn stones bedded in the brick, easy to hard as sandstone, red clay and
	// basalt (their colours are the lobby palette's `portal*` roles, set in portal-lobby.js). The picked one
	// is pressed a touch lower and a hairline groove round its face lights up; the others stay quiet stone.
	const g = tune.lobby.gallery
	const lamp = own(makeStyleMaterial('cream', { flat: true }))
	const w = g.plate.halfX * 2
	const d = g.plate.halfZ * 2
	// A flat frame: the groove's outline minus its inside, a hand's breadth in from the stone's edge.
	const frame = new THREE.Shape()
	const groove = g.plate.groove
	const rect = (path, hx, hz) => {
		path.moveTo(-hx, -hz)
		path.lineTo(hx, -hz)
		path.lineTo(hx, hz)
		path.lineTo(-hx, hz)
		path.closePath()
	}
	rect(frame, g.plate.halfX - g.plate.inset, g.plate.halfZ - g.plate.inset)
	const inner = new THREE.Path()
	rect(inner, g.plate.halfX - g.plate.inset - groove, g.plate.halfZ - g.plate.inset - groove)
	frame.holes.push(inner)
	const grooveGeo = own(new THREE.ShapeGeometry(frame))
	grooveGeo.rotateX(-Math.PI / 2)
	const slabs = gallery.standees.map((stand, i) => {
		let seed = 7919 * (i + 3)
		const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
		const stone = own(makeStyleMaterial(g.stones[stand.id].role))
		const body = own(chippedBlock(w * 0.96, g.plate.height, d * 0.96, g.plate.wear, rand))
		const slab = new THREE.Group()
		slab.name = `lobby-plate-${stand.id}`
		slab.position.set(stand.x, 0, stand.z)
		slab.rotation.y = (rand() - 0.5) * g.plate.skew
		group.add(slab)
		const stoneMesh = new THREE.Mesh(body, stone)
		slab.add(stoneMesh)
		const light = new THREE.Mesh(grooveGeo, lamp)
		slab.add(light)
		return { stand, slab, stoneMesh, light }
	})
	function setPlates() {
		for (const { stand, stoneMesh, light } of slabs) {
			const on = stand.id === gallery.difficulty
			const top = g.plate.top - (on ? g.plate.sink : 0)
			stoneMesh.position.y = top - g.plate.height / 2
			light.position.y = top + 0.004
			light.visible = on
		}
	}
	setPlates()
	onPresent?.((fact) => {
		if (!live || fact.type !== 'pick') return
		setPlates()
		effects.ring(fact.point, { color: c.colors.glint, from: 0.5, to: 1.8, life: 0.4, width: 0.08 })
	})

	// A ring sets the bell swinging away from whatever struck it, harder while it is still moving.
	let swing = null
	let time = 0
	let live = true
	const up = new THREE.Vector3(0, 1, 0)
	const across = new THREE.Vector3()
	onPresent?.((fact) => {
		if (!live || fact.type !== 'bell') return
		across.set((fact.from?.x ?? v.x) - v.x, 0, (fact.from?.z ?? v.z) - v.z)
		across.applyAxisAngle(up, -arch.rotation.y)
		const side = Math.abs(across.x) > 0.05 ? -Math.sign(across.x) : 1
		const left = swing ? Math.abs(swing.amp) * Math.exp(-(time - swing.at) / v.settle) : 0
		swing = { at: time, amp: Math.min(1.5, left + 1) * side }
		const at = { x: v.x, z: v.z }
		effects.ring(at, { color: c.colors.glint, from: 0.6, to: 2.3, life: 0.55, width: 0.08 })
		effects.ring(at, {
			color: c.colors.glint,
			from: 0.6,
			to: 1.7,
			life: 0.5,
			width: 0.06,
			delay: 0.12,
		})
	})

	// Waders leave rings in the water; a dash over leaves none.
	const wet = new Map()
	const last = new Map()
	function ripple() {
		for (const h of sim.heroes) {
			const p = h.body.position
			const before = last.get(h)
			last.set(h, { x: p.x, z: p.z })
			if (h.dead || h.body.dashing || !channelAt(p.x, p.z).wet) {
				wet.delete(h)
				continue
			}
			const moved = before && Math.hypot(p.x - before.x, p.z - before.z) > 1e-3
			const since = wet.get(h)
			if (since !== undefined && (time - since < c.ripple || !moved)) continue
			wet.set(h, time)
			effects.ring(p, {
				color: c.colors.glint,
				from: 0.25,
				to: since === undefined ? 1.2 : 0.8,
				life: 0.5,
				width: 0.07,
				y: 0.03,
				opacity: 0.85,
			})
		}
	}

	return {
		update(dt) {
			time += dt
			if (swing) {
				const t = time - swing.at
				const k = Math.exp(-t / v.settle)
				const s = Math.sin(t * 8)
				pivot.rotation.z = v.swing * swing.amp * k * s
				clapper.position.x = 0.06 * swing.amp * k * Math.sin(t * 8 - 0.9)
				if (k < 0.02) {
					swing = null
					pivot.rotation.z = clapper.position.x = 0
				}
			}
			ripple()
			effects.update(dt)
		},
		dispose() {
			live = false
			effects.dispose()
			scene.remove(group)
			for (const thing of owned) thing.dispose()
		},
	}
}
