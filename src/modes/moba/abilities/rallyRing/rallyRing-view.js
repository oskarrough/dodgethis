import * as THREE from 'three'
import { STEP } from '../../../../core/app.js'
import { PALETTE } from '../../../../core/style.js'
import { makeStyleMaterial } from '../../../../core/stylepass.js'
import { tune } from '../../tune.js'
import { createEffects } from '../../effects.js'

const GROUND = tune.map.printLayers.seams + 0.006

// The chalk ring: strokes in the caster's colour drawn round in a quarter second, a cream
// inner line, dust kicked up along the rim. It creeps round while it lasts and rubs out at the end.
// The call lands as strokes thrown from its middle out to the rim, in the caster's colour.
export function extras(scene) {
	const group = new THREE.Group()
	scene.add(group)
	const effects = createEffects(group)
	const owned = []
	const own = (o) => {
		owned.push(o)
		return o
	}
	const v = tune.rallyRing.view
	const materials = {
		A: own(makeStyleMaterial('teamA', { flat: true })),
		B: own(makeStyleMaterial('teamB', { flat: true })),
		cream: own(makeStyleMaterial('cream', { flat: true })),
	}
	const stroke = own(
		new THREE.RingGeometry(
			1 - v.chalkWidth,
			1,
			6,
			1,
			0,
			((Math.PI * 2) / v.dashes) * v.dashFill,
		).rotateX(-Math.PI / 2),
	)
	const inner = own(
		new THREE.RingGeometry(0.9 - v.chalkWidth * 0.35, 0.9, 64).rotateX(-Math.PI / 2),
	)
	const mote = own(new THREE.BoxGeometry(1, 1, 1))
	const rings = new Map() // field id → its strokes, inner line and dust
	let last = -Infinity

	function draw(field) {
		const root = new THREE.Group()
		root.position.set(field.x, GROUND, field.z)
		const team = materials[field.team] ?? materials.cream
		const strokes = Array.from({ length: v.dashes }, (_, k) => {
			const m = new THREE.Mesh(stroke, team)
			m.rotation.y = (k / v.dashes) * Math.PI * 2
			root.add(m)
			return m
		})
		const line = new THREE.Mesh(inner, materials.cream)
		line.position.y = 0.001
		root.add(line)
		const dust = Array.from({ length: v.dust }, () => {
			const m = new THREE.Mesh(mote, materials.cream)
			root.add(m)
			return m
		})
		group.add(root)
		return { root, strokes, line, dust, from: field.from, until: field.until, radius: field.radius }
	}
	function clear() {
		for (const r of rings.values()) group.remove(r.root)
		rings.clear()
		effects.reset()
	}

	return {
		update({ groundFields = [], tick, alpha = 0 }) {
			const now = tick + alpha
			if (now < last) clear() // a replay seek or a reset
			effects.update(Number.isFinite(last) && now >= last ? (now - last) * STEP : 0)
			last = now
			const fields = groundFields.filter((f) => f.ability === 'rallyRing' && f.until > now)
			const ids = new Set(fields.map((f) => f.id))
			for (const [id, r] of rings)
				if (!ids.has(id)) {
					group.remove(r.root)
					rings.delete(id)
				}
			for (const field of fields) {
				if (!rings.has(field.id)) {
					rings.set(field.id, draw(field))
					// A ring seen late (a guest joining, a seek) lands without the call.
					if ((now - field.from) * STEP < v.callLate)
						effects.spokes(
							{ x: field.x, z: field.z },
							{
								color: PALETTE[field.team === 'A' ? 'teamA' : 'teamB'],
								ink: PALETTE.ink,
								count: v.callSpokes,
								from: field.radius * v.callFrom,
								to: field.radius * v.callTo,
								inner: v.callInner,
								width: v.callWidth,
								life: v.callLife,
								turn: field.from * 0.7,
							},
						)
				}
				const r = rings.get(field.id)
				const age = (now - r.from) * STEP
				const left = (r.until - now) * STEP
				const drawn = Math.min(1, age / v.draw)
				const fade = Math.min(1, left / v.fade)
				r.root.position.set(field.x, GROUND, field.z)
				r.root.rotation.y = age * v.spin
				r.root.scale.setScalar(r.radius)
				// Strokes appear in order round the rim, then shrink to nothing as it rubs out.
				for (const [k, m] of r.strokes.entries()) {
					m.visible = k < drawn * v.dashes
					m.scale.setScalar(fade)
				}
				r.line.scale.setScalar(drawn * fade)
				for (const [k, m] of r.dust.entries()) {
					const phase = (age / v.dustLife + k / v.dust) % 1
					const angle = k * 2.39996
					m.position.set(Math.cos(angle), (phase * v.dustRise) / r.radius, Math.sin(angle))
					m.scale.setScalar(((v.dustSize * (1 - phase)) / r.radius) * fade)
				}
			}
		},
		dispose() {
			clear()
			effects.dispose()
			scene.remove(group)
			for (const o of owned) o.dispose()
		},
	}
}
