import * as THREE from 'three'
import { makeStyleMaterial } from '../../../../core/stylepass.js'
import { tune } from '../../tune.js'
import { dressFigure } from '../../mechanics/packs/packs-view.js'

// A bardino: a lean clay herding dog, sand-coloured, low and long, with pointed notched ears, a
// long snout, ribs carved in its flanks and a cracked terracotta collar. From above a narrow wedge,
// nose first, unlike any upright guard. Its bite pitches the whole dog forward. Metres from the feet.
export const dressBardino = (body) => dressFigure(body, 53, bardino)
const dog = { length: 1.0, chest: 0.3, back: 0.62, leg: 0.42, head: 0.82, snout: 0.34 }
function bardino({ block, box, part, eyes, group }) {
	const d = dog
	const trunk = block(0.3, d.chest, d.length * 0.62, 'sand', 0, d.back - 0.02, 0.04)
	trunk.rotation.x = -0.08 // shoulders a touch higher than the haunch
	block(0.34, d.chest + 0.08, 0.32, 'sand', 0, d.back + 0.02, -0.26)
	for (const s of [-1, 1]) {
		for (const z of [-0.26, 0.3]) box(0.08, d.leg, 0.09, 'sand', s * 0.1, d.leg / 2, z)
		for (const z of [-0.02, 0.1, 0.22]) box(0.02, 0.18, 0.04, 'ink', s * 0.155, d.back, z)
	}
	const tail = box(0.05, 0.42, 0.05, 'sand', 0, d.back + 0.14, d.length * 0.42)
	tail.rotation.x = 0.7
	// Neck, collar and head, carried low and forward.
	const head = group(0, d.head, -0.5)
	part(
		new THREE.CylinderGeometry(0.15, 0.16, 0.1, 7),
		'terracotta',
		0,
		-0.14,
		0.08,
		head,
	).rotation.x = 0.5
	block(0.24, 0.22, 0.24, 'sand', 0, 0, 0, head)
	const snout = part(
		new THREE.CylinderGeometry(0.04, 0.1, d.snout, 4).rotateX(-Math.PI / 2),
		'sand',
		0,
		-0.05,
		-0.12 - d.snout / 2,
		head,
	)
	snout.rotation.z = Math.PI / 4
	box(0.06, 0.05, 0.05, 'ink', 0, -0.03, -0.12 - d.snout, head)
	eyes(0.04, -0.125, 0.06, head)
	for (const s of [-1, 1]) {
		const ear = part(new THREE.ConeGeometry(0.06, 0.24, 3), 'sand', s * 0.08, 0.2, 0.04, head)
		ear.rotation.z = -s * 0.25
	}
}

// Tara as a clay pot in an ink ring that turns blue while it rolls, the road as a line of ink
// dots, and Barquero's landing as a blue ring at the road's end. Plain shapes; the look is
// Oskar's to give.
export function view(scene) {
	const g = () => tune.encounters.barquero
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
	const mesh = (geometry, mat) => {
		owned.push(geometry)
		const m = new THREE.Mesh(geometry, mat)
		root.add(m)
		return m
	}
	const y = () => tune.map.printLayers.seams + v().lift
	const flat = (m) => {
		m.rotation.x = -Math.PI / 2
		m.position.y = y()
		return m
	}
	const ringGeometry = (r) => new THREE.RingGeometry(r - v().rim, r, v().segments)
	const ring = flat(mesh(ringGeometry(g().ring), ink))
	const rolling = flat(mesh(ringGeometry(g().ring), cool))
	const pot = mesh(
		new THREE.CylinderGeometry(v().idol * 0.7, v().idol, v().idolHeight, v().segments),
		clay,
	)
	let built = null
	const dressed = new WeakSet()
	let delivered = false
	let lastTick = -1
	function build(fight) {
		const points = fight.road()
		const dot = new THREE.CircleGeometry(v().road, 12)
		owned.push(dot)
		for (let i = 1; i < points.length; i++) {
			const a = points[i - 1],
				b = points[i]
			const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z))
			for (let k = 0; k < n; k++) {
				const m = flat(new THREE.Mesh(dot, ink))
				m.position.x = a.x + ((b.x - a.x) * k) / n
				m.position.z = a.z + ((b.z - a.z) * k) / n
				root.add(m)
			}
		}
		const end = points.at(-1)
		const landing = flat(mesh(ringGeometry(v().landing), cool))
		landing.position.x = end.x
		landing.position.z = end.z
		return true
	}
	return {
		present(fact) {
			if (fact.type === 'encounter' && fact.id === 'barquero') delivered = fact.result === 'killed'
		},
		update(sim) {
			// Bardinos are lane minions to the sim; here they become dogs, by id, so replicas do too.
			for (const unit of sim.lane?.minions ?? [])
				if (unit.id?.startsWith?.('bardino-') && unit.body && !dressed.has(unit.body)) {
					dressed.add(unit.body)
					dressBardino(unit.body)
				}
			const fight = sim.dungeon?.encounters?.find((e) => e.id === 'barquero')
			if (sim.tick < lastTick) delivered = false
			lastTick = sim.tick
			root.visible = !!fight && !fight.killed && !delivered
			if (!root.visible) return
			built ??= build(fight)
			const on = sim.tick < fight.state.rollsUntil
			ring.visible = !on
			rolling.visible = on
			for (const m of [ring, rolling]) m.position.set(fight.idol.x, y(), fight.idol.z)
			pot.position.set(fight.idol.x, v().idolHeight / 2, fight.idol.z)
		},
		dispose() {
			scene.remove(root)
			for (const o of owned) o.dispose()
		},
	}
}
