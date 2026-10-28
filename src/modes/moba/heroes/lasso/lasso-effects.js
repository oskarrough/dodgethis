import * as THREE from 'three'
import { STEP } from '../../../../core/app.js'
import { PALETTE } from '../../../../core/style.js'
import { makeStyleMaterial } from '../../../../core/stylepass.js'
import { createEffects, link, linkGeometry } from '../../effects.js'
import { tune } from '../../tune.js'

// Hero extras are registered already. These marks use ordinary contact facts and replicated statuses.
export function extras(scene) {
	const group = new THREE.Group()
	group.name = 'lasso-string-marks'
	scene.add(group)
	const effects = createEffects(group)
	const ink = makeStyleMaterial('ink', { flat: true })
	const cream = makeStyleMaterial('cream', { flat: true })
	const rope = new THREE.RingGeometry(0.91, 1, 32)
	const cord = linkGeometry()
	const bindings = new Map()
	const reels = new Map()
	let pending = []
	let last = null
	let byId = new Map()

	function remove(map, id, rig) {
		rig.root.removeFromParent()
		map.delete(id)
	}
	function reset() {
		effects.reset()
		for (const [id, rig] of bindings) remove(bindings, id, rig)
		for (const [id, rig] of reels) remove(reels, id, rig)
		pending = []
		byId.clear()
	}
	return {
		contact(fact) {
			if (
				(fact.part === 'sweep' && ['tangle', 'aroundTheWorld'].includes(fact.ability)) ||
				(fact.part === 'reel' && fact.ability === 'throw')
			) {
				if (fact.part === 'sweep')
					byId.get(fact.source)?.body.releaseAbilityPose?.(fact.ability, fact.tick)
				pending.push(fact)
				if (pending.length > 24) pending.shift()
			}
		},
		update({ units = [], tick, alpha = 0 }) {
			const now = tick + alpha
			if (last !== null && now < last) reset()
			effects.update(last === null ? 0 : Math.max(0, now - last) * STEP)
			last = now
			byId = new Map(units.filter((u) => !u.dead).map((u) => [u.id, u]))
			for (const fact of pending) {
				if (now - fact.tick > 0.35 / STEP) continue
				const source = byId.get(fact.source)
				if (!source) continue
				if (fact.part === 'sweep') {
					const world = fact.ability === 'aroundTheWorld'
					const stats = tune[fact.ability]
					source.body.releaseAbilityPose?.(fact.ability, fact.tick)
					// One caster-centred arc, even on a miss or when several targets are struck.
					effects.smear(fact.point, Math.atan2(fact.direction.x, fact.direction.z), {
						color: PALETTE.cream,
						ink: PALETTE.ink,
						radius: Math.max(0.01, (world ? stats.radius : stats.range) - 0.18),
						width: 0.18,
						sweep: world ? Math.PI * 2 : (stats.angle * Math.PI) / 180,
						life: world ? 0.24 : 0.18,
						y: 0.42,
						opacity: 0.75,
					})
				} else {
					const previous = reels.get(fact.target)
					if (previous) remove(reels, fact.target, previous)
					const root = new THREE.Group()
					const edge = new THREE.Mesh(cord, ink)
					const line = new THREE.Mesh(cord, cream)
					root.add(edge, line)
					group.add(root)
					reels.set(fact.target, {
						root,
						edge,
						line,
						source: fact.source,
						until: fact.tick + tune.throw.dragTime / STEP,
					})
				}
			}
			pending = []
			for (const [id, rig] of reels) {
				const source = byId.get(rig.source)
				const target = byId.get(id)
				if (
					!source ||
					!target ||
					now >= rig.until ||
					!target.statuses?.some((s) => s.key === 'core.motion' && s.until > now)
				) {
					remove(reels, id, rig)
					continue
				}
				const from = source.body.mesh?.position ?? source.body.position
				const to = target.body.mesh?.position ?? target.body.position
				link(rig.edge, from, to, 0.65, 0.08)
				link(rig.line, from, to, 0.66, 0.035)
			}
			const bound = new Set()
			for (const unit of byId.values()) {
				const until = Math.max(
					0,
					...(unit.statuses ?? []).filter((s) => s.key === 'tangle.slow').map((s) => s.until),
				)
				if (until <= now) continue
				bound.add(unit.id)
				let rig = bindings.get(unit.id)
				if (!rig) {
					const root = new THREE.Group()
					for (const turn of [-0.6, 0.6]) {
						const edge = new THREE.Mesh(rope, ink)
						const line = new THREE.Mesh(rope, cream)
						edge.rotation.set(-Math.PI / 2 + turn, 0, turn)
						line.rotation.copy(edge.rotation)
						line.scale.setScalar(0.96)
						line.position.y = 0.012
						root.add(edge, line)
					}
					group.add(root)
					rig = { root }
					bindings.set(unit.id, rig)
				}
				const at = unit.body.mesh?.position ?? unit.body.position
				const remaining = (until - now) * STEP
				const tighten = Math.min(1, Math.max(0, (tune.tangle.duration - remaining) / 0.12))
				const size = (unit.body.radius ?? 0.65) * (1.4 - 0.25 * tighten)
				// Keep the crossed cords over the body instead of buried inside its team disc.
				rig.root.position.set(at.x, 1.15, at.z)
				rig.root.scale.set(size, size * Math.min(1, remaining / 0.12), size)
			}
			for (const [id, rig] of bindings) if (!bound.has(id)) remove(bindings, id, rig)
		},
		dispose() {
			reset()
			effects.dispose()
			group.removeFromParent()
			for (const owned of [ink, cream, rope, cord]) owned.dispose()
		},
	}
}
