import * as THREE from 'three'
import { tune } from '../../tune.js'
import { createMatchTerrain } from '../../match-terrain.js'
import { createFloorPrint } from '../../floor-print.js'

// The mesa top on its isle over the cloud, the court printed with a painted tile, and a squat
// stone for each waystone. Bosses and packs bring their own bodies.
export function ground(scope) {
	const { layout, terrain, m, group, chalkLayout, add, material, owned } = scope
	const s = tune.altamesa
	const desert = { ...terrain, colors: { ...terrain.colors, ...s.isle } }
	const casts = { hedge: m.hedgeHeight, wall: m.wallHeight, pillar: m.pillarHeight + m.capHeight }
	const unterrain = createMatchTerrain(group, layout, desert, chalkLayout, { casts })
	const own = (resource) => {
		owned.push(resource)
		return resource
	}
	const floors = createFloorPrint({ layout, terrain: desert, casts, look: s.look, own })
	group.add(floors.sheet({ ...s.floor, x: 0, z: 0 }, s.halfX, s.halfZ).mesh)
	const stone = s.view.waystone
	for (const w of s.waystones)
		add(
			new THREE.CylinderGeometry(stone.top, stone.radius, stone.height, stone.sides),
			material('scenery'),
			w.x,
			stone.height / 2,
			w.z,
		)
	const dispose = () => {
		floors.dispose()
		unterrain?.()
	}
	dispose.update = (dt) => {
		floors.update(dt)
		unterrain?.update?.(dt)
	}
	return dispose
}
