import * as THREE from 'three'
import { createMatchTerrain, convexHull } from '../../match-terrain.js'

export function ground(scope) {
	const { layout, terrain, m, group, chalkLine, chalkLayout, material, print, isleScenery } = scope
	const bounds = layout.bounds
	for (const side of [-1, 1])
		chalkLine(terrain.chalkWidth, m.hedgeInnerZ * 2, side * m.hedgeInnerX, 0)
	chalkLine(terrain.chalkWidth, (bounds.halfZ - terrain.courtInset) * 2, 0, 0)
	chalkLayout.circles.push({ radius: m.plazaRadius, x: 0, z: 0 })
	const unterrain = createMatchTerrain(group, layout, terrain, chalkLayout, {
		scenery: isleScenery,
		shadows: shadowPrint,
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

function shadowPrint({ layout, s, extent, casts, own }) {
	// One low sun prints long violet shadows from cover onto the court, baked once like the
	// contact above: the swept footprint of each box and pillar, never a shadow map.
	let shadowPrint = null
	// Headless builds (tests, the bot harness) have no canvas; the print is presentation only.
	if (casts && typeof document !== 'undefined') {
		const ppm = s.light.shadowPixelsPerMetre * devicePixelRatio
		const canvas = document.createElement('canvas')
		canvas.width = Math.ceil(extent.halfX * 2 * ppm)
		canvas.height = Math.ceil(extent.halfZ * 2 * ppm)
		const ctx = canvas.getContext('2d')
		ctx.fillStyle = '#fff'
		ctx.fillRect(0, 0, canvas.width, canvas.height)
		const px = (x) => ((x + extent.halfX) / (2 * extent.halfX)) * canvas.width
		const pz = (z) => ((z + extent.halfZ) / (2 * extent.halfZ)) * canvas.height
		const [lx, ly, lz] = s.light.dir
		const reach = s.light.shadowLength / Math.max(0.05, ly)
		const offset = (h) => ({ x: -lx * reach * h, z: -lz * reach * h })
		ctx.fillStyle = ctx.strokeStyle = '#000'
		ctx.lineCap = 'round'
		for (const b of layout.boxes) {
			const o = offset(b.kind === 'hedge' ? casts.hedge : casts.wall)
			const corners = []
			for (const [sx, sz] of [
				[-1, -1],
				[1, -1],
				[1, 1],
				[-1, 1],
			])
				for (const d of [0, 1])
					corners.push({ x: b.x + sx * b.halfX + o.x * d, z: b.z + sz * b.halfZ + o.z * d })
			const hull = convexHull(corners)
			ctx.beginPath()
			hull.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](px(p.x), pz(p.z)))
			ctx.fill()
		}
		for (const p of layout.pillars) {
			const o = offset(casts.pillar)
			ctx.lineWidth = p.r * 2 * ppm
			ctx.beginPath()
			ctx.moveTo(px(p.x), pz(p.z))
			ctx.lineTo(px(p.x + o.x), pz(p.z + o.z))
			ctx.stroke()
		}
		shadowPrint = own(new THREE.CanvasTexture(canvas))
		shadowPrint.anisotropy = 4
	}
	return shadowPrint
}
