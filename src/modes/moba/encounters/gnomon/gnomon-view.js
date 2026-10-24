import * as THREE from 'three'
import { makeStyleMaterial } from '../../../../core/stylepass.js'
import { STEP } from '../../../../core/app.js'
import { tune } from '../../tune.js'

// Gnomon's shadow as an ink hand on the floor, lengthening from its foot while it is warned, and
// round its foot a dial of twelve marks that fill toward the next turning back, blue as it nears.
// Azogue's shorter shadow shows in the hand itself. Plain shapes; the look is Oskar's to give.
const HOURS = 12
export function view(scene) {
	const g = () => tune.encounters.gnomon
	const v = () => g().view
	const owned = []
	const root = new THREE.Group()
	scene.add(root)
	const material = (role) => {
		const m = makeStyleMaterial(role, { flat: true, side: THREE.DoubleSide })
		owned.push(m)
		return m
	}
	const y = () => tune.map.printLayers.seams + v().lift
	const plane = new THREE.PlaneGeometry(1, 1)
	owned.push(plane)
	const pivot = new THREE.Group()
	root.add(pivot)
	const hand = new THREE.Mesh(plane, material('ink'))
	hand.rotation.x = -Math.PI / 2
	pivot.add(hand)
	const dial = new THREE.Group()
	root.add(dial)
	const ink = material('ink'),
		blue = material('teamA')
	const span = (Math.PI * 2) / HOURS
	const marks = Array.from({ length: HOURS }, (_, i) => {
		const geometry = new THREE.RingGeometry(
			v().dial - v().rim * 2,
			v().dial,
			Math.max(2, Math.round(v().segments / HOURS)),
			1,
			Math.PI / 2 - (i + 1) * span + span * 0.1,
			span * 0.8,
		)
		owned.push(geometry)
		const m = new THREE.Mesh(geometry, ink)
		m.rotation.x = -Math.PI / 2
		dial.add(m)
		return m
	})
	return {
		update(sim) {
			const fight = sim.dungeon?.encounters?.find((e) => e.id === 'gnomon')
			root.visible = !!fight && !fight.killed && !fight.unit.dead && !fight.dormant
			if (!root.visible) return
			const { state, unit } = fight
			const s = state.shadow
			pivot.visible = !!s
			if (s) {
				const warning = s.lands - s.warned || 1
				const grown = s.landed ? 1 : Math.min(1, (sim.tick - s.warned) / warning)
				const long = Math.max(0.01, s.length * grown)
				pivot.position.set(s.x, y(), s.z)
				pivot.rotation.y = Math.atan2(s.dir.x, s.dir.z)
				hand.scale.set(s.width, long, 1)
				hand.position.set(0, 0, long / 2)
			}
			dial.position.set(unit.body.position.x, y(), unit.body.position.z)
			const left = state.nextRewind == null ? null : (state.nextRewind - sim.tick) * STEP
			const filled = left == null ? 0 : Math.round(HOURS * (1 - left / g().rewind.every))
			const near = left != null && left <= g().rewind.warning
			marks.forEach((m, i) => {
				m.visible = i < filled
				m.material = near ? blue : ink
			})
		},
		dispose() {
			scene.remove(root)
			for (const o of owned) o.dispose()
		},
	}
}
