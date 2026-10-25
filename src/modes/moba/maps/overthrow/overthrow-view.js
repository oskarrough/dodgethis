import * as THREE from 'three'
export { cover, pillars, corePlinth } from './overthrow-stone.js'
export { scenery } from './overthrow-scenery.js'
import { bind } from '../../restyle.js'
import { createFloorDecals } from '../../floor-decals.js'
import { createFloorPrint } from '../../floor-print.js'
import { createMatchTerrain } from '../../match-terrain.js'

export function ground(scope) {
	const { layout, terrain, m, group, chalkLine, chalkLayout, material, print, isleScenery, owned } =
		scope
	const bounds = layout.bounds
	for (const side of [-1, 1])
		chalkLine(terrain.chalkWidth, m.hedgeInnerZ * 2, side * m.hedgeInnerX, 0)
	chalkLine(terrain.chalkWidth, (bounds.halfZ - terrain.courtInset) * 2, 0, 0)
	chalkLayout.circles.push({ radius: m.plazaRadius, x: 0, z: 0 })
	const unterrain = createMatchTerrain(group, layout, terrain, chalkLayout, {
		scenery: isleScenery,
		casts: { hedge: m.hedgeHeight, wall: m.wallHeight, pillar: m.pillarHeight + m.capHeight },
	})
	// Ownership remains a small semantic print; it is not scenery.
	for (const side of [-1, 1]) {
		const team = material(side < 0 ? 'teamA' : 'teamB', { flat: true })
		const kerbs = []
		for (let x = m.dashSpacing; x < bounds.halfX; x += m.dashSpacing)
			for (const flank of [-1, 1])
				kerbs.push(
					new THREE.PlaneGeometry(m.dashLength, m.lineWidth * 2)
						.rotateX(-Math.PI / 2)
						.translate(side * x, m.printLayers.marks, flank * (m.hedgeInnerZ - m.lineWidth)),
				)
		print(kerbs, team, `moba-kerbs-${side}`)
	}
	const settings = layout.settings
	const floors = createFloorPrint({
		layout,
		terrain,
		look: settings.look,
		casts: { hedge: m.hedgeHeight, wall: m.wallHeight, pillar: m.pillarHeight + m.capHeight },
		own: (resource) => (owned.push(resource), resource),
	})
	const floor = floors.sheet({ ...settings.floor, x: 0, z: 0 }, bounds.halfX, bounds.halfZ).mesh
	const compile = floor.material.onBeforeCompile
	floor.material.onBeforeCompile = (shader) => {
		compile(shader)
		// The shared floor owns the shadow print; its tints can still follow this map live.
		bind(shader.uniforms.floorBase.value, (c) => c.set(settings.floor.base))
		bind(shader.uniforms.floorJoint.value, (c) => c.set(settings.floor.joint))
		bind(shader.uniforms.floorAccent.value, (c) => c.set(settings.floor.accent))
		bind(shader.uniforms.floorShadowColour.value, (c) => c.set(settings.light.shadow))
		bind(shader.uniforms.floorShadowStrength, (u) => {
			u.value = settings.look.shadow
		})
	}
	group.add(floor)
	const decals = createFloorDecals({
		decals: settings.decals,
		layout,
		groundY: terrain.groundY,
		own: (resource) => (owned.push(resource), resource),
	})
	if (decals) group.add(decals)
	const dispose = () => {
		unterrain()
		floors.dispose()
	}
	dispose.update = (dt) => {
		unterrain.update(dt)
		floors.update(dt)
	}
	return dispose
}
