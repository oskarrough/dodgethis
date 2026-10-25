import * as THREE from 'three'
import { FORWARD_LAYER, makeStyleMaterial } from '../../../../core/stylepass.js'
import { tune } from '../../tune.js'
import { SLOTS } from '../../sim-kit.js'
import { createEffects, glowMaterial, link, linkGeometry, shellMaterial } from '../../effects.js'

// A hooded herb-gatherer: a round cloth skirt, pointed sage hood and bark satchel.
export function dress({ torso, part, detail, face, own, discY, materials }) {
	const cloth = [
		[0, 0],
		[0.46, 0],
		[0.53, 0.16],
		[0.48, 0.62],
		[0.34, 1.12],
		[0, 1.24],
	]
	torso.geometry = own(
		new THREE.LatheGeometry(
			cloth.map(([r, y]) => new THREE.Vector2(r, y)),
			10,
		).toNonIndexed(),
	)
	torso.geometry.computeVertexNormals()
	const sage = own(makeStyleMaterial('leafDeep'))
	const leaf = own(makeStyleMaterial('leaf'))
	const bark = own(makeStyleMaterial('driftwood'))
	const hood = new THREE.ConeGeometry(0.43, 0.65, 7).toNonIndexed()
	const points = hood.attributes.position
	for (let i = 0; i < points.count; i++)
		if (points.getY(i) > 0) points.setXYZ(i, -0.16, points.getY(i), 0.12)
	hood.computeVertexNormals()
	part(hood, sage, 0, discY + 1.175, 0.04)
	face(0.6, discY + 1.11, -0.35)
	// The skirt's worn hem and the satchel strap are broad enough to read from above.
	detail(
		[
			new THREE.CylinderGeometry(0.51, 0.47, 0.12, 10).translate(0, discY + 0.07, 0),
			new THREE.BoxGeometry(0.075, 0.76, 0.04).rotateZ(-0.53).translate(0.04, discY + 0.64, -0.43),
		],
		bark,
	)
	const satchel = part(
		new THREE.SphereGeometry(1, 8, 5).scale(0.23, 0.28, 0.23),
		bark,
		0.47,
		discY + 0.55,
		0,
	)
	part(new THREE.BoxGeometry(0.3, 0.09, 0.32), sage, 0, 0.2, 0, satchel)
	// Only the small clasp takes the team's colour; cloth and sage are always her own.
	part(new THREE.BoxGeometry(0.13, 0.075, 0.15), materials.team, 0, 0.25, -0.04, satchel)
	const sprigs = []
	for (let i = 0; i < 4; i++) {
		const x = (i - 1.5) * 0.09
		sprigs.push(
			new THREE.OctahedronGeometry(0.17, 0)
				.scale(0.55, 1.3, 0.3)
				.rotateZ(-0.3 + i * 0.24)
				.translate(x, 0.36 + (i % 2) * 0.08, 0.07),
		)
	}
	detail(sprigs, leaf, satchel)
	const hand = part(
		new THREE.SphereGeometry(0.12, 8, 5),
		materials.cream,
		-0.43,
		discY + 0.62,
		-0.13,
	)
	// Keep the cast origin attached to the raised sage instead of the old trumpet.
	const mouth = new THREE.Object3D()
	mouth.position.set(0, 0.48, 0.07)
	satchel.add(mouth)
	return {
		satchel,
		hand,
		mouth,
		restY: discY + 0.62,
		satchelY: discY + 0.55,
		border: false,
		// Preserve the shipped board's disc exactly while changing the costume silhouette.
		footprintRadius: Math.hypot(Math.fround(0.65), Math.fround(0.125)),
	}
}

export function animate(unit, rig, { pose, progress, costume }) {
	rig.hand.position.set(-0.43, rig.restY, -0.13)
	rig.satchel.position.y = rig.satchelY
	rig.satchel.rotation.z = 0
	if (pose === 'salviaMend') {
		rig.hand.position.y += 0.38 * progress
		rig.satchel.position.y += 0.2 * progress
		rig.satchel.rotation.z = -0.22 * progress
	} else if (pose === 'salviaWard') {
		rig.hand.position.z -= 0.24 * progress
		costume.rotation.z = -0.12 * progress
	} else if (pose === 'mandadorBasic') costume.rotation.x = (progress * Math.PI) / 12
}

const easeOut = (x) => 1 - (1 - x) ** 3
const ARCS = 48

// Who Mend or Ward would hit now, Mend's beam and filling ring, its landing, and Ward's bubble.
export function extras(scene) {
	const group = new THREE.Group()
	scene.add(group)
	const effects = createEffects(group)
	const owned = []
	const own = (o) => {
		owned.push(o)
		return o
	}
	const add = (geometry, material) => {
		const mesh = new THREE.Mesh(geometry, material)
		mesh.layers.set(FORWARD_LAYER)
		mesh.visible = false
		group.add(mesh)
		return mesh
	}
	const mv = tune.mend.view
	const wv = tune.ward.view
	const glow = () => own(glowMaterial(mv.color))
	const ring = own(new THREE.RingGeometry(1 - mv.preview.width, 1, 48).rotateX(-Math.PI / 2))
	const bar = own(linkGeometry())
	const ball = own(new THREE.SphereGeometry(1, 16, 10))
	const sphere = own(new THREE.SphereGeometry(1, 32, 20))
	const arcs = [] // quantised filling rings, built on first use
	const arc = (k) => {
		const i = Math.max(1, Math.min(ARCS, Math.round(k * ARCS)))
		return (arcs[i] ??= own(
			new THREE.RingGeometry(
				mv.fill.radius - mv.fill.width,
				mv.fill.radius,
				48,
				1,
				Math.PI / 2 - (i / ARCS) * Math.PI * 2,
				(i / ARCS) * Math.PI * 2,
			).rotateX(-Math.PI / 2),
		))
	}

	const preview = add(ring, glow())
	const previewLine = add(bar, glow())
	const rigs = []
	let used = 0
	const nextRig = () =>
		(rigs[used++] ??= {
			beam: add(bar, glow()),
			bead: add(ball, glow()),
			fill: add(arc(1), glow()),
			base: add(ring, glow()),
		})
	const bubbles = new Map() // unit id → { mesh, material, amount, max, age, flash, at }
	const seen = new Map() // caster id → { targetId, progress }

	function shield(unit, tick) {
		return unit.statuses?.find(
			(s) =>
				s.key === 'ward.shield' &&
				!s.removed &&
				(s.until == null || s.until > tick) &&
				(s.amount ?? 0) > 0,
		)
	}

	return {
		update({ units = [], unit, aim, tick, alpha, dt = 0 }) {
			const at = (u) => u.body.mesh?.position ?? u.body.position
			const mouth = new THREE.Vector3()
			const time = performance.now() / 1000
			effects.update(dt)

			// Aim preview: your Salvia always shows whom the next Mend or Ward would pick.
			preview.visible = previewLine.visible = false
			const kit = unit?.definition?.abilities ?? {}
			const spell = Object.entries(kit).find(
				([slot, a]) =>
					(a?.id === 'mend' || a?.id === 'ward') && !(unit.cd?.[SLOTS.indexOf(slot)] > 0),
			)?.[1]
			if (spell && aim && !unit.dead && !unit.cast) {
				const target = spell.targetUnit({
					hero: unit,
					sim: { heroes: units },
					target: aim,
					ability: spell,
				})
				if (target) {
					const p = at(target)
					const pulse = 1 + 0.06 * Math.sin(time * mv.preview.pulse)
					preview.position.set(p.x, mv.ground, p.z)
					preview.scale.setScalar(mv.preview.radius * pulse)
					preview.material.opacity = mv.preview.opacity
					preview.visible = true
					link(previewLine, at(unit), p, mv.ground, mv.beam.width)
					previewLine.material.opacity = mv.preview.line
				}
			}

			// Mend's cast: a beam that thickens, a bead that travels to the target, a ring that fills under them.
			for (const rig of rigs) for (const mesh of Object.values(rig)) mesh.visible = false
			used = 0
			const casting = new Set()
			for (const u of units) {
				if (u.dead || u.cast?.ability !== 'mend') continue
				const ally = units.find((a) => a.id === u.cast.targetId)
				if (!ally || ally.dead) continue
				casting.add(u.id)
				const k = Math.max(0, Math.min(1, 1 - (u.cast.left - alpha) / Math.max(1, u.cast.total)))
				seen.set(u.id, { targetId: ally.id, progress: k })
				const from = u.body.mouth?.getWorldPosition(mouth) ?? at(u),
					fromY = u.body.mouth ? from.y : mv.height,
					to = at(ally)
				const rig = nextRig()
				link(rig.beam, from, to, fromY, mv.beam.width + mv.beam.grow * k, mv.height)
				rig.beam.material.opacity = mv.beam.opacity + mv.beam.glow * k
				const along = easeOut(k)
				rig.bead.position.set(
					from.x + (to.x - from.x) * along,
					fromY + (mv.height - fromY) * along,
					from.z + (to.z - from.z) * along,
				)
				rig.bead.scale.setScalar(mv.beam.bead * (0.6 + 0.6 * k))
				rig.bead.visible = true
				rig.fill.geometry = arc(k)
				rig.fill.position.set(to.x, mv.ground + 0.002, to.z)
				rig.fill.material.opacity = 0.95
				rig.fill.visible = true
				rig.base.position.set(to.x, mv.ground, to.z)
				rig.base.scale.setScalar(mv.fill.radius)
				rig.base.material.opacity = 0.25
				rig.base.visible = true
			}
			// A cast that vanished near its end landed: flash the target.
			for (const [id, last] of seen) {
				if (casting.has(id)) continue
				seen.delete(id)
				const ally = units.find((a) => a.id === last.targetId)
				if (last.progress < 0.85 || !ally || ally.dead) continue
				effects.ring(at(ally), { color: mv.color, ...mv.land.ring })
				effects.column(at(ally), { color: mv.color, ...mv.land.column })
			}

			// Ward: a bubble while the shield holds, a flash when it soaks a hit, a pop when it goes.
			const shielded = new Set()
			for (const u of units) {
				const status = u.dead ? null : shield(u, tick)
				if (!status) continue
				shielded.add(u.id)
				let b = bubbles.get(u.id)
				if (!b) {
					const material = shellMaterial(wv.color, wv.opacity)
					b = { mesh: add(sphere, material), material, age: 0, flash: 0 }
					b.amount = b.max = status.amount
					bubbles.set(u.id, b)
				}
				if (status.amount > b.max) b.max = status.amount
				if (status.amount < b.amount - 0.5) b.flash = wv.flash
				b.amount = status.amount
				b.age += dt
				b.flash = Math.max(0, b.flash - dt)
				b.at = at(u)
				const grow = Math.min(1, b.age / wv.grow)
				const punch = 1 + 0.12 * (b.flash / wv.flash)
				const back = 1 + 2.7 * (grow - 1) ** 3 + 1.7 * (grow - 1) ** 2
				b.mesh.position.set(b.at.x, wv.height, b.at.z)
				b.mesh.scale.setScalar(Math.max(0.01, wv.radius * back * punch))
				b.material.uniforms.uOpacity.value =
					wv.opacity * (0.45 + 0.55 * (b.amount / Math.max(1, b.max))) + (b.flash / wv.flash) * 0.6
				b.mesh.visible = true
			}
			for (const [id, b] of bubbles) {
				if (shielded.has(id)) continue
				bubbles.delete(id)
				if (b.at)
					effects.shell(b.at, {
						color: wv.color,
						from: wv.radius,
						to: wv.radius * wv.pop.to,
						life: wv.pop.life,
						y: wv.height,
					})
				group.remove(b.mesh)
				b.material.dispose()
			}
		},
		dispose() {
			scene.remove(group)
			effects.dispose()
			for (const o of owned) o.dispose()
			for (const b of bubbles.values()) b.material.dispose()
			bubbles.clear()
			seen.clear()
		},
	}
}
