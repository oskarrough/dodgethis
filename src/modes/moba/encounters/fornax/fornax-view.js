import * as THREE from 'three'
import { makeStyleMaterial } from '../../../../core/stylepass.js'
import { tune } from '../../tune.js'

// The shade as a blue pool with an ink rim, walking the hall while Fornax is pulled, and round
// each hero's feet a red ring that closes as their Heat builds toward baked. Plain shapes; the
// look is Oskar's to give.
export function view(scene) {
	const g = () => tune.encounters.fornax
	const v = () => g().view
	const owned = []
	const root = new THREE.Group()
	scene.add(root)
	const material = (role) => {
		const m = makeStyleMaterial(role, { flat: true, side: THREE.DoubleSide })
		owned.push(m)
		return m
	}
	const ink = material('ink')
	const cool = material('teamA')
	const clay = material('teamB')
	const flat = (geometry, mat, lift = 0) => {
		owned.push(geometry)
		const m = new THREE.Mesh(geometry, mat)
		m.rotation.x = -Math.PI / 2
		m.position.y = tune.map.printLayers.seams + v().lift + lift
		root.add(m)
		return m
	}
	const r = () => g().shade.radius
	const pool = flat(new THREE.CircleGeometry(r() - v().rim, v().segments), cool)
	const rim = flat(new THREE.RingGeometry(r() - v().rim, r(), v().segments), ink, v().lift)
	const rings = new Map()
	function ringFor(id) {
		if (!rings.has(id))
			rings.set(id, { mesh: flat(new THREE.BufferGeometry(), clay, v().lift), shown: -1 })
		return rings.get(id)
	}
	return {
		update(sim) {
			const fight = sim.dungeon?.encounters?.find((e) => e.id === 'fornax')
			const on = !!fight && !fight.killed && fight.state.phase === 'engaged'
			pool.visible = rim.visible = on
			for (const ring of rings.values()) ring.mesh.visible = false
			if (!on) return
			const { x, z } = fight.state.shade
			pool.position.x = rim.position.x = x
			pool.position.z = rim.position.z = z
			for (const h of sim.heroes) {
				const stacks = fight.heat[h.id] ?? 0
				if (h.dead || !stacks) continue
				const ring = ringFor(h.id)
				const share = Math.min(1, stacks / g().heat.bake)
				if (share !== ring.shown) {
					ring.shown = share
					ring.mesh.geometry.dispose()
					ring.mesh.geometry = new THREE.RingGeometry(
						v().ring - v().rim,
						v().ring,
						v().segments,
						1,
						Math.PI / 2,
						share * Math.PI * 2,
					)
				}
				ring.mesh.visible = true
				ring.mesh.position.x = h.body.position.x
				ring.mesh.position.z = h.body.position.z
			}
		},
		dispose() {
			scene.remove(root)
			for (const ring of rings.values()) ring.mesh.geometry.dispose()
			for (const o of owned) o.dispose()
		},
	}
}
