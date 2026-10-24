import * as THREE from 'three'
import { makeStyleMaterial } from '../../../../core/stylepass.js'
import { link, linkGeometry } from '../../effects.js'
import { tune } from '../../tune.js'

const GROUND = tune.map.printLayers.seams + 0.006

// While Carambola winds up, a dashed line runs to whoever is served. Each hit sends the ball
// hopping from the last body to the next, one short arc per link, with a ring where it lands.
export function extras(scene) {
	const group = new THREE.Group()
	scene.add(group)
	const owned = []
	const own = (o) => {
		owned.push(o)
		return o
	}
	const v = tune.pinball.view
	const red = own(makeStyleMaterial('terracotta', { flat: true })),
		gold = own(makeStyleMaterial('ammo', { flat: true })),
		cream = own(makeStyleMaterial('cream', { flat: true }))
	const dash = own(linkGeometry())
	const ball = own(new THREE.SphereGeometry(1, 12, 8))
	const ring = own(new THREE.RingGeometry(1 - v.ringWidth, 1, 32).rotateX(-Math.PI / 2))
	const tethers = []
	const hops = [] // { from, to, start, ball, ring }
	let clock = 0

	function tether(index) {
		return (tethers[index] ??= Array.from({ length: 24 }, () => {
			const m = new THREE.Mesh(dash, red)
			group.add(m)
			return m
		}))
	}
	function clear() {
		for (const hop of hops) group.remove(hop.ball, hop.ring)
		hops.length = 0
	}

	return {
		contact(fact) {
			if (fact.ability !== 'pinball' || !fact.origin) return
			const hop = {
				from: fact.origin,
				to: fact.point,
				start: clock + fact.hop * v.hopTime,
				ball: new THREE.Mesh(ball, gold),
				ring: new THREE.Mesh(ring, cream),
			}
			hop.ball.visible = hop.ring.visible = false
			group.add(hop.ball, hop.ring)
			hops.push(hop)
		},
		update({ units = [], dt = 0 }) {
			clock += dt
			// The serve's tell: dashes from Carambola to the locked target, or where it stood.
			let used = 0
			for (const u of units) {
				if (u.dead || u.cast?.ability !== 'pinball') continue
				const from = u.body.mesh?.position ?? u.body.position
				const target = units.find((t) => t.id === u.cast.targetId)
				const to = target?.body.mesh?.position ?? u.cast.target
				const length = Math.hypot(to.x - from.x, to.z - from.z)
				const strips = tether(used++)
				for (const [k, m] of strips.entries()) {
					const along = k * v.dashSpacing
					m.visible = along < length
					if (!m.visible) continue
					const end = Math.min(length, along + v.dashSpacing * v.dashFill)
					link(
						m,
						{
							x: from.x + ((to.x - from.x) * along) / length,
							z: from.z + ((to.z - from.z) * along) / length,
						},
						{
							x: from.x + ((to.x - from.x) * end) / length,
							z: from.z + ((to.z - from.z) * end) / length,
						},
						GROUND,
						v.tetherWidth,
					)
					m.scale.y = 0.01
				}
			}
			for (let i = used; i < tethers.length; i++) for (const m of tethers[i]) m.visible = false

			for (let i = hops.length - 1; i >= 0; i--) {
				const hop = hops[i]
				const k = (clock - hop.start) / v.hopTime
				const landed = (clock - hop.start - v.hopTime) / v.ringLife
				if (landed >= 1) {
					group.remove(hop.ball, hop.ring)
					hops.splice(i, 1)
					continue
				}
				hop.ball.visible = k >= 0 && k < 1
				if (hop.ball.visible) {
					hop.ball.scale.setScalar(v.ballRadius)
					hop.ball.position.set(
						hop.from.x + (hop.to.x - hop.from.x) * k,
						v.height + v.arc * 4 * k * (1 - k),
						hop.from.z + (hop.to.z - hop.from.z) * k,
					)
				}
				hop.ring.visible = landed >= 0
				if (hop.ring.visible) {
					hop.ring.position.set(hop.to.x, GROUND, hop.to.z)
					hop.ring.scale.setScalar(v.ringFrom + (v.ringTo - v.ringFrom) * (1 - (1 - landed) ** 2))
				}
			}
		},
		dispose() {
			clear()
			scene.remove(group)
			for (const o of owned) o.dispose()
		},
	}
}
