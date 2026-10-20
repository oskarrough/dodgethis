import * as THREE from 'three'
import { FORWARD_LAYER } from '../../../../core/stylepass.js'
import { look } from '../../look.js'
import { tune } from '../../tune.js'
import { SLOTS } from '../../sim-kit.js'
import { menderTargetUnit } from '../../abilities/mend/mend-target.js'

// Coach's bar and megaphone, without the touchline cutout.
export function dress({ torso, part, own, discY, t, materials }) {
	torso.geometry = own(new THREE.BoxGeometry(t.coachWidth, t.coachHeight, t.coachDepth))
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
		t.coachWidth / 2,
		discY + t.coachHeight * 0.6,
		0,
	)
	return { cone, hand }
}

export function animate(unit, rig, { pose, progress, costume }) {
	const t = look.silhouettes
	rig.hand.position.y = -t.coachHeight / 2 + t.coachHeight * 0.6
	rig.hand.position.z = 0
	rig.cone.rotation.x = 0
	if (pose === 'menderMend') {
		rig.hand.position.y += t.coachHeight * progress
		rig.cone.rotation.x = (-progress * Math.PI) / 8
	} else if (pose === 'menderWard') {
		rig.hand.position.z = -t.megaphoneLength
		costume.rotation.z = -Math.PI / 8
	} else if (pose === 'coachBasic') costume.rotation.x = (progress * Math.PI) / 12
}

const easeOut = (x) => 1 - (1 - x) ** 3
const ARCS = 48

// A soft edge glow for Ward's bubble: faint face-on, bright at the rim.
const bubbleVert = `
varying vec3 vNormal;
varying vec3 vView;
void main() {
	vec4 world = modelViewMatrix * vec4(position, 1.0);
	vNormal = normalize(normalMatrix * normal);
	vView = normalize(-world.xyz);
	gl_Position = projectionMatrix * world;
}`
const bubbleFrag = `
uniform vec3 uColor;
uniform float uOpacity;
varying vec3 vNormal;
varying vec3 vView;
void main() {
	float rim = pow(1.0 - abs(dot(vNormal, vView)), 2.0);
	gl_FragColor = vec4(uColor, uOpacity * (0.15 + 0.85 * rim));
}`

// Who Mend or Ward would hit now, Mend's beam and filling ring, its landing, and Ward's bubble.
export function extras(scene) {
	const group = new THREE.Group()
	scene.add(group)
	const owned = []
	const own = (o) => {
		owned.push(o)
		return o
	}
	const glow = (color) =>
		own(
			new THREE.MeshBasicMaterial({
				color,
				transparent: true,
				depthWrite: false,
			}),
		)
	const add = (geometry, material) => {
		const mesh = new THREE.Mesh(geometry, material)
		mesh.layers.set(FORWARD_LAYER)
		mesh.visible = false
		group.add(mesh)
		return mesh
	}
	const mv = tune.mend.view
	const wv = tune.ward.view
	const ring = own(new THREE.RingGeometry(1 - mv.preview.width, 1, 48).rotateX(-Math.PI / 2))
	const bar = own(new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5))
	const ball = own(new THREE.SphereGeometry(1, 16, 10))
	const column = own(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0))
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
				Math.PI / 2,
				(-i / ARCS) * Math.PI * 2,
			).rotateX(-Math.PI / 2),
		))
	}

	const preview = add(ring, glow(mv.color))
	const previewLine = add(bar, glow(mv.color))
	const pool = (make) => {
		const items = []
		let used = 0
		return {
			next() {
				return (items[used++] ??= make())
			},
			reset() {
				for (const item of items) for (const mesh of Object.values(item)) mesh.visible = false
				used = 0
			},
		}
	}
	const casts = pool(() => ({
		beam: add(bar, glow(mv.color)),
		bead: add(ball, glow(mv.color)),
		fill: add(arc(1), glow(mv.color)),
		base: add(ring, glow(mv.color)),
	}))
	const bubbles = new Map() // status unit id → { mesh, material, amount, max, age, flash }
	const bursts = [] // { meshes, age, life, kind }
	const seen = new Map() // caster id → { targetId, progress }

	function link(mesh, from, to, y, width) {
		const dx = to.x - from.x,
			dz = to.z - from.z
		mesh.position.set(from.x, y, from.z)
		mesh.rotation.set(0, Math.atan2(dx, dz), 0)
		mesh.scale.set(width, width, Math.hypot(dx, dz))
		mesh.visible = true
	}

	function land(at) {
		const flat = add(ring, glow(mv.color))
		const beam = add(column, glow(mv.color))
		bursts.push({ meshes: [flat, beam], at: { x: at.x, z: at.z }, age: 0, kind: 'land' })
	}

	function pop(at, scale) {
		const material = own(
			new THREE.ShaderMaterial({
				uniforms: { uColor: { value: new THREE.Color(wv.color) }, uOpacity: { value: 1 } },
				vertexShader: bubbleVert,
				fragmentShader: bubbleFrag,
				transparent: true,
				depthWrite: false,
			}),
		)
		const mesh = add(sphere, material)
		bursts.push({ meshes: [mesh], at: { x: at.x, z: at.z }, scale, age: 0, kind: 'pop' })
	}

	function drop(burst) {
		for (const mesh of burst.meshes) {
			group.remove(mesh)
			mesh.material.dispose()
			owned.splice(owned.indexOf(mesh.material), 1)
		}
	}

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
			const time = performance.now() / 1000

			// Aim preview: your Mender always shows whom the next Mend or Ward would pick.
			preview.visible = previewLine.visible = false
			const kit = unit?.definition?.abilities ?? {}
			const spell = Object.entries(kit).find(
				([slot, a]) =>
					(a?.id === 'mend' || a?.id === 'ward') && !(unit.cd?.[SLOTS.indexOf(slot)] > 0),
			)?.[1]
			if (spell && aim && !unit.dead && !unit.cast) {
				const target = menderTargetUnit({
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
			casts.reset()
			const casting = new Set()
			for (const u of units) {
				if (u.dead || u.cast?.ability !== 'mend') continue
				const ally = units.find((a) => a.id === u.cast.targetId)
				if (!ally || ally.dead) continue
				casting.add(u.id)
				const k = Math.max(0, Math.min(1, 1 - (u.cast.left - alpha) / Math.max(1, u.cast.total)))
				seen.set(u.id, { targetId: ally.id, progress: k })
				const from = at(u),
					to = at(ally)
				const rig = casts.next()
				link(rig.beam, from, to, mv.height, mv.beam.width + mv.beam.grow * k)
				rig.beam.material.opacity = mv.beam.opacity + mv.beam.glow * k
				const along = easeOut(k)
				rig.bead.position.set(
					from.x + (to.x - from.x) * along,
					mv.height,
					from.z + (to.z - from.z) * along,
				)
				rig.bead.scale.setScalar(mv.beam.bead * (0.6 + 0.6 * k))
				rig.bead.material.opacity = 1
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
				if (last.progress >= 0.85 && ally && !ally.dead) land(at(ally))
			}

			// Ward: a bubble while the shield holds, a flash when it soaks a hit, a pop when it goes.
			const shielded = new Set()
			for (const u of units) {
				const status = u.dead ? null : shield(u, tick)
				if (!status) continue
				shielded.add(u.id)
				let b = bubbles.get(u.id)
				if (!b) {
					const material = own(
						new THREE.ShaderMaterial({
							uniforms: {
								uColor: { value: new THREE.Color(wv.color) },
								uOpacity: { value: wv.opacity },
							},
							vertexShader: bubbleVert,
							fragmentShader: bubbleFrag,
							transparent: true,
							depthWrite: false,
						}),
					)
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
				if (b.at) pop(b.at, wv.radius)
				group.remove(b.mesh)
				b.material.dispose()
				owned.splice(owned.indexOf(b.material), 1)
			}

			for (let i = bursts.length - 1; i >= 0; i--) {
				const burst = bursts[i]
				burst.age += dt
				if (burst.kind === 'land') {
					const k = Math.min(1, burst.age / mv.land.life)
					const [flat, beam] = burst.meshes
					flat.position.set(burst.at.x, mv.ground, burst.at.z)
					flat.scale.setScalar(mv.land.from + (mv.land.to - mv.land.from) * easeOut(k))
					flat.material.opacity = 1 - k
					flat.visible = true
					beam.position.set(burst.at.x, 0, burst.at.z)
					beam.scale.set(
						0.55 * (1 - 0.6 * k),
						mv.land.column * (0.4 + 0.6 * easeOut(k)),
						0.55 * (1 - 0.6 * k),
					)
					beam.material.opacity = 0.7 * (1 - k) ** 2
					beam.visible = true
					if (k >= 1) drop(bursts.splice(i, 1)[0])
				} else {
					const k = Math.min(1, burst.age / wv.pop.life)
					const [mesh] = burst.meshes
					mesh.position.set(burst.at.x, wv.height, burst.at.z)
					mesh.scale.setScalar(burst.scale * (1 + (wv.pop.to - 1) * easeOut(k)))
					mesh.material.uniforms.uOpacity.value = 1.4 * (1 - k) ** 2
					mesh.visible = true
					if (k >= 1) drop(bursts.splice(i, 1)[0])
				}
			}
		},
		dispose() {
			scene.remove(group)
			for (const o of owned) o.dispose()
			bubbles.clear()
			bursts.length = 0
			seen.clear()
		},
	}
}
