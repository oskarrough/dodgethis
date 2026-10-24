import * as THREE from 'three'
import { FORWARD_LAYER } from '../../../../core/stylepass.js'
import { look } from '../../look.js'
import { tune } from '../../tune.js'
import { SLOTS } from '../../sim-kit.js'
import { createEffects, glowMaterial, link, linkGeometry, shellMaterial } from '../../effects.js'

// Mandador's bar and megaphone, without the touchline cutout.
export function dress({ torso, part, own, discY, t, materials }) {
	torso.geometry = own(new THREE.BoxGeometry(t.mandadorWidth, t.mandadorHeight, t.mandadorDepth))
	const cone = part(
		new THREE.CylinderGeometry(
			t.megaphoneRadius,
			t.arrowRadius,
			t.megaphoneLength,
			t.segments,
		).rotateX(-Math.PI / 2),
		materials.team,
		0,
		t.megaphoneY,
		t.megaphoneZ,
	)
	part(
		new THREE.CircleGeometry(t.megaphoneMouth, t.segments),
		materials.ink,
		0,
		t.megaphoneY,
		t.megaphoneZ - t.megaphoneLength / 2 - t.discBorder / 4,
	).rotation.y = Math.PI
	const hand = part(
		new THREE.SphereGeometry(t.fingerRadius, t.segments, 6),
		materials.cream,
		t.mandadorWidth / 2,
		discY + t.mandadorHeight * 0.6,
		0,
	)
	// Mend's beam leaves from the megaphone's mouth and follows it as the cast tilts it.
	const mouth = new THREE.Object3D()
	mouth.position.z = -t.megaphoneLength / 2
	cone.add(mouth)
	return { cone, hand, mouth }
}

export function animate(unit, rig, { pose, progress, costume }) {
	const t = look.silhouettes
	rig.hand.position.y = -t.mandadorHeight / 2 + t.mandadorHeight * 0.6
	rig.hand.position.z = 0
	rig.cone.rotation.x = 0
	if (pose === 'salviaMend') {
		rig.hand.position.y += t.mandadorHeight * progress
		rig.cone.rotation.x = (-progress * Math.PI) / 8
	} else if (pose === 'salviaWard') {
		rig.hand.position.z = -t.megaphoneLength
		costume.rotation.z = -Math.PI / 8
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
