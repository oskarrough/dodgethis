import * as THREE from 'three'
import { makeStyleMaterial } from '../../../../core/stylepass.js'
import { STEP } from '../../../../core/app.js'
import { tune } from '../../tune.js'

// An ink tether between the twins while Kinship holds, and a red ring round the fallen twin that
// closes as the wheel spins it back. Plain shapes; the look is Oskar's to give.
export function view(scene) {
	const v = () => tune.encounters.tinajaBotijo.view
	const owned = []
	const root = new THREE.Group()
	scene.add(root)
	const ink = makeStyleMaterial('ink', { flat: true, side: THREE.DoubleSide })
	const clay = makeStyleMaterial('teamB', { flat: true, side: THREE.DoubleSide })
	owned.push(ink, clay)
	const y = () => tune.map.printLayers.seams + v().lift
	const tetherGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
	const tether = new THREE.Mesh(tetherGeometry, ink)
	owned.push(tetherGeometry)
	root.add(tether)
	let arc = null
	let shown = -1
	const ring = new THREE.Mesh(new THREE.BufferGeometry(), clay)
	ring.rotation.x = -Math.PI / 2
	root.add(ring)
	return {
		update(sim, blend) {
			const fight = sim.dungeon?.encounters?.find((e) => e.id === 'tinajaBotijo')
			if (!fight) return
			const [a, b] = fight.units.map((u) => u.body?.position)
			tether.visible = fight.state.kin && !!a && !!b
			if (tether.visible) {
				const length = Math.hypot(b.x - a.x, b.z - a.z)
				tether.position.set((a.x + b.x) / 2, y(), (a.z + b.z) / 2)
				tether.scale.set(v().tether, 1, length)
				tether.rotation.y = Math.atan2(b.x - a.x, b.z - a.z)
			}
			const fallen = fight.units.find((u) => u.id === fight.state.revives)
			ring.visible = !!fallen
			if (!fallen) return
			const total = tune.encounters.tinajaBotijo.revive / STEP
			const share = Math.max(0, Math.min(1, (fight.state.reviveTick - sim.tick - blend) / total))
			const quantised = Math.round(share * 50) / 50
			if (quantised !== shown) {
				shown = quantised
				arc?.dispose()
				arc = new THREE.RingGeometry(
					v().ring - v().rim,
					v().ring,
					v().segments,
					1,
					Math.PI / 2,
					Math.max(0.001, quantised) * Math.PI * 2,
				)
				ring.geometry = arc
			}
			ring.position.set(fallen.spawn.x, y(), fallen.spawn.z)
		},
		dispose() {
			scene.remove(root)
			arc?.dispose()
			for (const o of owned) o.dispose()
		},
	}
}
