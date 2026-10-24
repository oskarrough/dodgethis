import * as THREE from 'three'
import { tune } from '../../tune.js'
import { createMatchTerrain } from '../../match-terrain.js'
import { createFloorPrint } from '../../floor-print.js'
import { overgrowth } from '../../overgrowth.js'
import { createMapArt } from '../../map-art.js'

// The mesa top on its isle over the cloud, the court printed with a painted tile, dry growth
// spilling over the walls, and a squat stone for each waystone. Bosses and packs bring their own bodies.
export function ground(scope) {
	const { layout, terrain, m, group, chalkLayout, add, print, material, owned } = scope
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
	const growth = overgrowth(
		layout.boxes,
		(b) => (b.kind === 'hedge' ? m.hedgeHeight : m.wallHeight),
		s.overgrowth,
	)
	print(growth.leaf, material('leaf'), 'altamesa-leaves')
	print(growth.deep, material('leafDeep'), 'altamesa-fronds')
	const unart = createMapArt({ art: s.art, layout, terrain: desert, m, group, own })
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
		unart()
		floors.dispose()
		unterrain?.()
	}
	dispose.update = (dt) => {
		floors.update(dt)
		unterrain?.update?.(dt)
	}
	return dispose
}
