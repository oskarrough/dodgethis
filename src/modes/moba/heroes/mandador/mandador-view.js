import * as THREE from 'three'
import { makeStyleMaterial } from '../../../../core/stylepass.js'
import { tune } from '../../tune.js'
import { look } from '../../look.js'
import { sweepObstacles, mapExit } from '../../obstacles.js'
import { mandadorThrowOrigin } from './mandador-cutout.js'

// The original flat bar and megaphone, with a separate raised hand for the save.
export function dress({ torso, part, detail, face, own, discY, t, materials }) {
	const board = new THREE.Shape()
	const x = t.mandadorWidth / 2,
		h = t.mandadorHeight
	board.moveTo(-x, 0)
	board.lineTo(x, 0)
	board.lineTo(x, h - 0.14)
	board.lineTo(x - 0.16, h)
	board.lineTo(0.05, h)
	board.lineTo(-0.02, h - 0.12)
	board.lineTo(-0.12, h)
	board.lineTo(-x, h)
	board.closePath()
	torso.geometry = own(
		new THREE.ExtrudeGeometry(board, { depth: t.mandadorDepth, bevelEnabled: false }).translate(
			0,
			0,
			-t.mandadorDepth / 2,
		),
	)
	const wood = own(makeStyleMaterial('driftwood'))
	face(0.88, discY + h - 0.14, -0.13)
	detail(
		[
			new THREE.BoxGeometry(0.025, h - 0.32, 0.014).translate(-0.3, discY + h * 0.46, -0.132),
			new THREE.BoxGeometry(0.022, h - 0.42, 0.014).translate(0.37, discY + h * 0.44, -0.132),
			new THREE.BoxGeometry(t.mandadorWidth, 0.13, t.mandadorDepth + 0.012).translate(
				0,
				discY + 0.09,
				0,
			),
		],
		wood,
	)
	// A hollow speaking-trumpet, with its mouth and rolled lip parented to the flare.
	const cone = part(
		new THREE.CylinderGeometry(t.megaphoneRadius, 0.075, t.megaphoneLength, 12, 1, true).rotateX(
			-Math.PI / 2,
		),
		materials.team,
		0,
		t.megaphoneY,
		t.megaphoneZ,
	)
	part(
		new THREE.TorusGeometry(t.megaphoneRadius - 0.018, 0.025, 4, 12),
		materials.team,
		0,
		0,
		-t.megaphoneLength / 2,
		cone,
	)
	part(
		new THREE.CircleGeometry(t.megaphoneRadius - 0.045, 12),
		materials.ink,
		0,
		0,
		-t.megaphoneLength / 2 + 0.025,
		cone,
	).rotation.y = Math.PI
	const hand = part(
		new THREE.SphereGeometry(t.fingerRadius, t.segments, 6),
		materials.cream,
		t.mandadorWidth / 2,
		discY + t.mandadorHeight * 0.6,
		0,
	)
	// The ink pass outlines the board; the old expanded shell hid its entire painted face.
	return { cone, hand, border: false }
}
export function animate(unit, rig, { pose, progress, costume }) {
	const t = look.silhouettes
	rig.hand.position.y = -t.mandadorHeight / 2 + t.mandadorHeight * 0.6
	rig.cone.rotation.x = 0
	rig.hand.position.z = 0
	if (pose === 'mandadorTag') rig.hand.position.y += t.mandadorHeight * progress
	else if (pose === 'mandadorRed') {
		costume.rotation.y = Math.PI
		rig.cone.rotation.x = (-progress * Math.PI) / 3
	} else if (pose === 'mandadorPass') {
		costume.rotation.z = (-progress * Math.PI) / 8
		rig.hand.position.z = -progress * t.megaphoneLength
	} else if (pose === 'mandadorBasic') costume.rotation.x = (progress * Math.PI) / 12
	else rig.hand.position.z = 0
}

// Extra bodies belong to the hero folder; the view runner just forwards the sim lists.
export function extras(scene) {
	const group = new THREE.Group()
	group.name = 'mandador-cutouts-and-tethers'
	scene.add(group)
	const t = look.silhouettes
	const grey = makeStyleMaterial('scenery', { flat: true })
	const ink = makeStyleMaterial('ink', { flat: true })
	const red = makeStyleMaterial('teamB', { flat: true })
	const cream = makeStyleMaterial('cream', { flat: true })
	const body = new THREE.BoxGeometry(t.mandadorWidth, t.mandadorHeight, t.mandadorDepth)
	const cone = new THREE.CylinderGeometry(
		t.megaphoneRadius,
		t.arrowRadius,
		t.megaphoneLength,
		t.segments,
	).rotateX(-Math.PI / 2)
	const line = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5)
	const cutouts = new Map(),
		tethers = new Map()
	function strip(parent, material, from, to, width) {
		const m = new THREE.Mesh(line, material)
		m.position.set(from.x, tune.map.markerLayers.aim, from.z)
		m.rotation.y = Math.atan2(to.x - from.x, to.z - from.z) + Math.PI
		m.scale.set(width, 1, Math.hypot(to.x - from.x, to.z - from.z))
		parent.add(m)
	}
	return {
		update({ cutouts: live = [], units = [], bounds, obstacles = [], alpha = 0 }) {
			const ids = new Set(live.map((c) => c.id))
			for (const [id, r] of cutouts)
				if (!ids.has(id)) {
					group.remove(r, r.userData.tell)
					cutouts.delete(id)
				}
			for (const c of live) {
				let root = cutouts.get(c.id)
				if (!root) {
					root = new THREE.Group()
					const bar = new THREE.Mesh(body, grey)
					bar.position.y = t.mandadorHeight / 2
					root.add(bar)
					const megaphone = new THREE.Mesh(cone, ink)
					megaphone.position.set(0, t.mandadorHeight / 2, t.megaphoneZ)
					root.add(megaphone)
					root.userData.tell = new THREE.Group()
					group.add(root.userData.tell, root)
					cutouts.set(c.id, root)
				}
				root.position.set((c.prevX ?? c.x) + (c.x - (c.prevX ?? c.x)) * alpha, 0, c.z)
				root.rotation.y = c.cast?.yaw ?? (c.flank < 0 ? Math.PI : 0)
				const tell = root.userData.tell
				tell.clear()
				if (c.cast) {
					const from = mandadorThrowOrigin({ ...c, x: root.position.x }, bounds, obstacles)
					const end = {
						x: from.x + c.cast.dir.x * tune.outThrow.range,
						z: from.z + c.cast.dir.z * tune.outThrow.range,
					}
					const length =
						tune.outThrow.range *
						Math.min(
							sweepObstacles(from, end, tune.outThrow.radius, obstacles) ?? 1,
							mapExit(from, end, tune.outThrow.radius, bounds) ?? 1,
						)
					const to = { x: from.x + c.cast.dir.x * length, z: from.z + c.cast.dir.z * length }
					strip(tell, red, from, to, tune.outThrow.radius * 2)
					const progress = 1 - (c.cast.left - alpha) / Math.max(1, c.cast.total)
					strip(
						tell,
						cream,
						from,
						{ x: from.x + (to.x - from.x) * progress, z: from.z + (to.z - from.z) * progress },
						tune.outThrow.radius,
					)
				}
			}
			for (const r of tethers.values()) group.remove(r)
			tethers.clear()
			for (const u of units) {
				if (u.dead || u.cast?.ability !== 'tagOut') continue
				const ally = units.find((a) => a.id === u.cast.targetId)
				if (!ally || ally.dead) continue
				const from = u.body.mesh.position,
					to = ally.body.mesh.position
				const length = Math.hypot(to.x - from.x, to.z - from.z),
					spacing = tune.tagOut.view.dashSpacing
				const tether = new THREE.Group()
				for (let along = 0; along < length; along += spacing) {
					const end = Math.min(length, along + spacing * tune.tagOut.view.dashFill)
					strip(
						tether,
						red,
						{
							x: from.x + ((to.x - from.x) * along) / length,
							z: from.z + ((to.z - from.z) * along) / length,
						},
						{
							x: from.x + ((to.x - from.x) * end) / length,
							z: from.z + ((to.z - from.z) * end) / length,
						},
						tune.tagOut.radius * 2,
					)
				}
				group.add(tether)
				tethers.set(u.id, tether)
			}
		},
		dispose() {
			scene.remove(group)
			for (const owned of [grey, ink, red, cream, body, cone, line]) owned.dispose()
		},
	}
}
