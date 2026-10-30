import * as THREE from 'three'
import { STEP } from '../../../../core/app.js'
import { FORWARD_LAYER, makeStyleMaterial } from '../../../../core/stylepass.js'
import { tune } from '../../tune.js'
import { poseStrike, poseWindup } from '../../pose-curve.js'
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
		if (points.getY(i) > 0) points.setXYZ(i, -0.16, points.getY(i) + 0.12, 0.48)
	hood.computeVertexNormals()
	part(hood, sage, 0, discY + 1.175, 0.04)
	// A raised fold carries the hood's point across the roof, where the match camera sees it.
	part(new THREE.ConeGeometry(0.13, 0.5, 4).rotateX(0.45), sage, -0.12, discY + 1.35, 0.24)
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
	// The bag is bark, not a second face: two pale, broken grain cuts on its outer side.
	detail(
		[-1, 1].map((side) =>
			new THREE.BoxGeometry(0.025, 0.24, 0.025)
				.rotateZ(side * 0.2)
				.translate(side * 0.09, -0.03, -0.21),
		),
		materials.cream,
		satchel,
	)
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

const easeOut = (x) => 1 - (1 - x) ** 3
const easeIn = (x) => x * x
const clamp01 = (x) => Math.max(0, Math.min(1, x))
const fract = (x) => x - Math.floor(x)
const TAU = Math.PI * 2
const ARCS = 48
// The ink under every light stroke, the same blue effects.spokes and effects.streak draw with.
const INK = '#26445f'

// Mend and Ward land with no cast left to pose from, so extras' contact() leaves the landing tick here by caster id.
const landings = new Map() // caster id → { pose, tick }

// The follow-through after a landing: `fire` runs 0 to 1 over the snap, `settle` 1 to 0 over the recovery.
function landingOf(unit, time) {
	const landing = unit && landings.get(unit.id)
	if (!landing) return null
	const v = tune.heroes.salvia.view[landing.pose === 'salviaMend' ? 'mend' : 'ward']
	const elapsed = (time - landing.tick) * STEP
	if (elapsed > v.snap + v.recover) landings.delete(unit.id)
	if (elapsed < -0.1 || elapsed > v.snap + v.recover) return null
	const t = Math.max(0, elapsed)
	return {
		pose: landing.pose,
		fire: Math.min(1, t / v.snap),
		settle: 1 - clamp01((t - v.snap) / v.recover),
	}
}

// Forward is -z and a positive lean tips her back. Mend gathers (hand up and in, satchel opened, chest back),
// holds taut and pours forward; Ward thrusts the bubble out; the tennis ball is a serve.
export function animate(unit, rig, { pose, progress, time, alpha, costume }) {
	const v = tune.heroes.salvia.view
	const hand = rig.hand.position
	hand.set(-0.43, rig.restY, -0.13)
	rig.satchel.position.y = rig.satchelY
	rig.satchel.rotation.z = 0
	const landing = landingOf(unit, time)
	// `gather` is the coil, `strike` the snap past it; the coil unwinds as the snap fires.
	const mend = (gather, strike, taut) => {
		const m = v.mend
		hand.y += m.rise * gather - m.dip * strike
		hand.z += m.pull * gather - m.throw * strike
		rig.satchel.position.y += m.lift * gather
		rig.satchel.rotation.z = -m.tilt * gather + m.pour * strike
		costume.rotation.x = m.lean * gather - m.lunge * strike
		costume.rotation.z = m.tremor * taut * Math.sin(time * 0.9)
	}
	if (pose === 'salviaMend') {
		const gather = poseWindup(progress, { load: v.mend.load })
		mend(gather, 0, clamp01(gather))
	} else if (landing?.pose === 'salviaMend')
		mend((1 - easeOut(landing.fire)) * landing.settle, poseStrike(landing.fire, landing.settle), 0)
	else if (landing?.pose === 'salviaWard') {
		const w = v.ward
		const strike = poseStrike(landing.fire, landing.settle)
		hand.z -= w.thrust * strike
		hand.y += w.rise * strike
		costume.rotation.z = -w.sweep * strike
		costume.rotation.x = -w.lunge * strike
	} else if (unit?.attack) {
		const b = v.basic
		const basic = unit.definition?.basic
		let gather = 0,
			strike = 0
		if (unit.attack.phase === 'windup') {
			const total = unit.attack.total ?? Math.round((basic?.windup ?? 0.3) / STEP)
			gather = poseWindup(1 - (unit.attack.left - alpha) / Math.max(1, total), { load: b.load })
		} else if (unit.attack.phase === 'backswing') {
			const swing = basic?.backswing ?? 0.25
			const elapsed = Math.max(0, swing - (unit.attack.left - alpha) * STEP)
			const fire = Math.min(1, elapsed / b.snap)
			const settle = 1 - clamp01((elapsed - b.snap) / Math.max(STEP, swing - b.snap))
			gather = (1 - easeOut(fire)) * settle
			strike = poseStrike(fire, settle)
		}
		hand.y += b.rise * gather
		hand.z += b.pull * gather - b.throw * strike
		costume.rotation.x = b.lean * gather - b.lunge * strike
	}
}

function leafGeometry() {
	const shape = new THREE.Shape()
	shape.moveTo(0, -1)
	shape.quadraticCurveTo(0.75, 0, 0, 1)
	shape.quadraticCurveTo(-0.75, 0, 0, -1)
	return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2)
}

// Who Mend or Ward would hit now; Mend's gathering leaves, tether and filling ring; its landing; Ward's bubble.
export function extras(scene) {
	const group = new THREE.Group()
	scene.add(group)
	const effects = createEffects(group)
	const owned = []
	const own = (o) => {
		owned.push(o)
		return o
	}
	const add = (geometry, material, order = 0) => {
		const mesh = new THREE.Mesh(geometry, material)
		mesh.layers.set(FORWARD_LAYER)
		mesh.renderOrder = order
		mesh.visible = false
		group.add(mesh)
		return mesh
	}
	const mv = tune.mend.view
	const wv = tune.ward.view
	const glow = (color = mv.color) => own(glowMaterial(color))
	const ring = own(new THREE.RingGeometry(1 - mv.preview.width, 1, 48).rotateX(-Math.PI / 2))
	const bar = own(linkGeometry())
	const ball = own(new THREE.SphereGeometry(1, 16, 10))
	const sphere = own(new THREE.SphereGeometry(1, 32, 20))
	const leaf = own(leafGeometry())
	const arcs = new Map() // quantised filling rings, built on first use
	const arc = (radius, width, k) => {
		const i = Math.max(1, Math.min(ARCS, Math.round(k * ARCS)))
		const key = `${radius}:${width}:${i}`
		if (!arcs.has(key))
			arcs.set(
				key,
				own(
					new THREE.RingGeometry(
						radius - width,
						radius,
						48,
						1,
						Math.PI / 2 - (i / ARCS) * TAU,
						(i / ARCS) * TAU,
					).rotateX(-Math.PI / 2),
				),
			)
		return arcs.get(key)
	}

	const preview = add(ring, glow())
	const previewLine = add(bar, glow())
	const rigs = []
	let used = 0
	const nextRig = () =>
		(rigs[used++] ??= {
			beam: add(bar, glow()),
			beads: Array.from({ length: mv.stream.beads }, () => add(ball, glow(), 3)),
			fill: add(arc(mv.fill.radius, mv.fill.width, 1), glow(), 2),
			base: add(ring, glow()),
			leaves: Array.from({ length: mv.gather.leaves }, () => ({
				ink: add(leaf, glow(INK), 4),
				body: add(leaf, glow(), 5),
			})),
		})
	const bubbles = new Map() // unit id → { mesh, material, timer, amount, max, age, flash, soak, until, at }
	const seen = new Map() // caster id → { targetId, progress, started, gone }
	const landed = new Map() // caster id → tick of its last Mend or Ward landing
	const people = new Map() // unit id → unit, as of the last update
	const mouth = new THREE.Vector3()
	let now = 0

	const at = (u) => u.body.mesh?.position ?? u.body.position
	// Where a cast leaves her: the satchel's mouth, or her middle.
	const handOf = (u) => {
		if (!u.body.mouth) return { x: at(u).x, y: mv.height, z: at(u).z }
		u.body.mouth.getWorldPosition(mouth)
		return { x: mouth.x, y: mouth.y, z: mouth.z }
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

	function drop(b) {
		group.remove(b.mesh)
		group.remove(b.timer)
		b.material.dispose()
		b.timer.material.dispose()
	}

	function reset() {
		effects.reset()
		for (const b of bubbles.values()) drop(b)
		bubbles.clear()
		seen.clear()
		landed.clear()
		landings.clear()
	}

	return {
		// Mend or Ward landed: a bright stroke down the tether, the first beat of its landing, and her follow-through.
		contact(fact) {
			const mend = fact.ability === 'mend'
			if (fact.part !== 'impact' || (!mend && fact.ability !== 'ward')) return
			const tick = fact.tick ?? now
			landings.set(fact.source, { pose: mend ? 'salviaMend' : 'salviaWard', tick })
			landed.set(fact.source, tick)
			const caster = people.get(fact.source),
				ally = people.get(fact.target)
			if (!caster || !ally) return
			const to = at(ally),
				from = handOf(caster)
			if (mend) {
				effects.streak(from, to, {
					color: mv.color,
					y: from.y,
					toY: mv.height,
					...mv.land.streak,
				})
				effects.ring(to, { color: mv.color, ...mv.land.ring })
			} else {
				effects.streak(from, to, {
					color: wv.color,
					y: from.y,
					toY: wv.height,
					...wv.form.streak,
				})
				effects.ring(to, { color: wv.color, ...wv.form.ring })
				effects.spokes(to, { color: wv.color, turn: tick * 0.7, ...wv.form.spokes })
			}
		},
		update({ units = [], unit, aim, tick, alpha, dt = 0 }) {
			const time = performance.now() / 1000
			if (tick < now - 1) reset()
			now = tick
			people.clear()
			for (const u of units) people.set(u.id, u)
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

			// Mend's cast: leaves drawn into her satchel, beads running the tether, a ring filling under the ally.
			for (const rig of rigs) {
				for (const mesh of [rig.beam, rig.fill, rig.base, ...rig.beads]) mesh.visible = false
				for (const l of rig.leaves) l.ink.visible = l.body.visible = false
			}
			used = 0
			const casting = new Set()
			for (const u of units) {
				if (u.dead || u.cast?.ability !== 'mend') continue
				const ally = people.get(u.cast.targetId)
				if (!ally || ally.dead) continue
				casting.add(u.id)
				const k = clamp01(1 - (u.cast.left - alpha) / Math.max(1, u.cast.total))
				seen.set(u.id, {
					targetId: ally.id,
					progress: k,
					started: u.cast.startedTick ?? 0,
					gone: null,
				})
				const from = handOf(u),
					to = at(ally)
				const rig = nextRig()
				link(rig.beam, from, to, from.y, mv.beam.width + mv.beam.grow * k, mv.height)
				rig.beam.material.opacity = mv.beam.opacity + mv.beam.glow * k
				rig.beads.forEach((bead, i) => {
					const along = fract(k * mv.stream.cycles + i / rig.beads.length)
					bead.position.set(
						from.x + (to.x - from.x) * along,
						from.y + (mv.height - from.y) * along,
						from.z + (to.z - from.z) * along,
					)
					bead.scale.setScalar(
						mv.beam.bead * (0.6 + 0.6 * k) * Math.sqrt(Math.sin(Math.PI * along)),
					)
					bead.visible = true
				})
				const g = mv.gather
				const ramp = clamp01(k / g.from)
				const feet = at(u)
				rig.leaves.forEach((l, i) => {
					const phase = fract(k * g.trips + i / rig.leaves.length)
					const angle = (i / rig.leaves.length) * TAU + g.spin * k
					const inward = easeIn(phase)
					const r = g.radius * (1 - inward)
					l.body.position.set(
						(feet.x + Math.sin(angle) * r) * (1 - inward) + from.x * inward,
						0.15 + (from.y - 0.15) * inward,
						(feet.z + Math.cos(angle) * r) * (1 - inward) + from.z * inward,
					)
					const size = g.size * ramp * (1 - 0.5 * phase)
					l.body.scale.setScalar(size)
					l.body.rotation.y = angle + phase * 2
					l.body.material.opacity = 0.9 * Math.sqrt(Math.sin(Math.PI * phase))
					l.ink.position.copy(l.body.position)
					l.ink.position.y -= 0.01
					l.ink.scale.setScalar(size * 1.3)
					l.ink.rotation.y = l.body.rotation.y
					l.ink.material.opacity = l.body.material.opacity * 0.85
					l.ink.visible = l.body.visible = size > 0.01
				})
				rig.fill.geometry = arc(mv.fill.radius, mv.fill.width, k)
				rig.fill.position.set(to.x, mv.ground + 0.002, to.z)
				rig.fill.material.opacity = 0.6 + 0.4 * k
				rig.fill.visible = true
				rig.base.position.set(to.x, mv.ground, to.z)
				rig.base.scale.setScalar(mv.fill.radius)
				rig.base.material.opacity = 0.25
				rig.base.visible = true
			}
			// A cast that ended without landing folds its ring in on itself; one that landed already drew its own.
			for (const [id, last] of seen) {
				if (casting.has(id)) continue
				last.gone ??= tick
				if ((landed.get(id) ?? -Infinity) >= last.started) seen.delete(id)
				else if (tick - last.gone >= mv.fizzle.wait) {
					seen.delete(id)
					const ally = people.get(last.targetId)
					if (ally && !ally.dead) effects.ring(at(ally), { color: mv.color, ...mv.fizzle })
				}
			}
			for (const [id, landedAt] of landed) if (tick - landedAt > 120) landed.delete(id)

			// Ward: a bubble while the shield holds that dims and shrinks as it is spent, a flash and a burst when it
			// soaks a hit, a flicker over its last seconds; broken it bursts, run out it folds quietly in.
			const shielded = new Set()
			for (const u of units) {
				const status = u.dead ? null : shield(u, tick)
				if (!status) continue
				shielded.add(u.id)
				let b = bubbles.get(u.id)
				if (!b) {
					const material = shellMaterial(wv.color, wv.opacity)
					b = {
						mesh: add(sphere, material),
						material,
						timer: add(arc(wv.radius + wv.timer.pad, wv.timer.width, 1), glowMaterial(wv.color), 1),
						age: 0,
						flash: 0,
						soak: 0,
					}
					b.amount = b.max = status.amount
					bubbles.set(u.id, b)
				}
				if (status.amount > b.max) b.max = status.amount
				if (status.amount < b.amount - 0.5) {
					b.flash = wv.flash
					if (b.soak <= 0) {
						const share = (b.amount - status.amount) / Math.max(1, b.max)
						effects.spokes(at(u), {
							color: wv.color,
							turn: tick * 0.7,
							...wv.form.spokes,
							count: wv.soak.count,
							from: wv.soak.to * 0.5,
							to: wv.soak.to * (0.6 + 0.4 * clamp01(share * 4)),
							life: wv.soak.life,
						})
						b.soak = wv.soak.gap
					}
				}
				b.amount = status.amount
				b.until = status.until
				b.age += dt
				b.flash = Math.max(0, b.flash - dt)
				b.soak = Math.max(0, b.soak - dt)
				b.at = at(u)
				const grow = Math.min(1, b.age / wv.grow)
				const punch = 1 + 0.12 * (b.flash / wv.flash)
				const back = 1 + 2.7 * (grow - 1) ** 3 + 1.7 * (grow - 1) ** 2
				const left = b.until == null ? Infinity : (b.until - tick - alpha) * STEP
				const share = b.amount / Math.max(1, b.max)
				const flicker =
					left < wv.warn.last
						? 1 -
							wv.warn.depth * (0.5 + 0.5 * Math.sin(((tick + alpha) * STEP * TAU) / wv.warn.rate))
						: 1
				b.mesh.position.set(b.at.x, wv.height, b.at.z)
				b.mesh.scale.setScalar(
					Math.max(0.01, wv.radius * back * punch * (1 - wv.wane * (1 - share))),
				)
				b.material.uniforms.uOpacity.value =
					(wv.opacity * (0.45 + 0.55 * share) + (b.flash / wv.flash) * 0.6) * flicker
				b.mesh.visible = true
				// Guests' packed statuses carry no start tick, so the ring runs against the shield's full duration.
				const total = status.until == null ? 0 : tune.ward.duration
				b.timer.visible = total > 0 && left > 0
				if (b.timer.visible) {
					b.timer.geometry = arc(wv.radius + wv.timer.pad, wv.timer.width, clamp01(left / total))
					b.timer.position.set(b.at.x, mv.ground + 0.003, b.at.z)
					b.timer.material.opacity = wv.timer.opacity * flicker
				}
			}
			for (const [id, b] of bubbles) {
				if (shielded.has(id)) continue
				bubbles.delete(id)
				if (b.at) {
					const ran = people.get(id)?.dead || (b.until != null && tick + 1 >= b.until)
					if (ran)
						effects.shell(b.at, {
							color: wv.color,
							from: wv.radius,
							to: wv.radius * wv.fade.to,
							life: wv.fade.life,
							opacity: wv.fade.opacity,
							y: wv.height,
						})
					else {
						effects.shell(b.at, {
							color: wv.color,
							from: wv.radius,
							to: wv.radius * wv.pop.to,
							life: wv.pop.life,
							y: wv.height,
						})
						effects.spokes(b.at, { color: wv.color, turn: tick * 0.7, ...wv.pop.spokes })
					}
				}
				drop(b)
			}
		},
		dispose() {
			scene.remove(group)
			effects.dispose()
			for (const o of owned) o.dispose()
			for (const b of bubbles.values()) drop(b)
			bubbles.clear()
			seen.clear()
			landed.clear()
			people.clear()
			landings.clear()
		},
	}
}
