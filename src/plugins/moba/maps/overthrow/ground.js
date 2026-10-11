import * as THREE from 'three'
import { createMatchTerrain } from '../../match-terrain.js'

export function ground(scope) {
	const { layout, terrain, m, group, chalkLine, chalkLayout, material, print, isleScenery } = scope
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
	return unterrain
}
