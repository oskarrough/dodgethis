import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { FORWARD_LAYER } from '../../../../core/stylepass.js'
import { createMatchTerrain } from '../../match-terrain.js'

// Flagfall's ground, drawn by map.js in place of the lane's: two lanes of chalk and kerbs,
// the wet slick, camp and flag marks, lantern posts. Returns the terrain it built.
export function ground(scope) {
	const { layout, terrain, scale, m, group, add, print, material, owned, scenery } = scope
	const { chalkLine, chalkLayout, kerbStones, lanterns, isleScenery } = scope
	const bounds = layout.bounds
	const s = layout.settings
	const layers = s.print.layers
	for (const flank of [-1, 1]) {
		chalkLine(s.plaza.x * 2, terrain.chalkWidth, 0, flank * (s.lane.innerZ + terrain.courtInset))
		for (const side of [-1, 1])
			chalkLine(
				terrain.chalkWidth,
				s.lane.outerZ - s.lane.innerZ - terrain.courtInset * 2,
				side * s.plaza.x,
				flank * s.lane.centreZ,
			)
	}
	// Marks for what will work later: chalk squares on the camps, a cross on the flag,
	// a bar across each lane in front of the forts where the gatehouses stand.
	const j = s.jungle
	const w = terrain.chalkWidth
	for (const post of layout.posts.filter((p) => p.x !== 0)) {
		const r = 1.6
		for (const d of [-1, 1]) {
			chalkLine(r * 2, w, post.x, post.z + d * r)
			chalkLine(w, r * 2, post.x + d * r, post.z)
		}
	}
	chalkLine(4, w, 0, 0)
	chalkLine(w, 4, 0, 0)
	for (const side of [-1, 1])
		for (const flank of [-1, 1])
			for (const d of [-0.4, 0.4])
				chalkLine(w, s.lane.outerZ - s.lane.innerZ, side * j.gatehouseX + d, flank * s.lane.centreZ)
	// A low coursed-stone kerb on the safe rim, never a collider. The long shores' runs are
	// what the dunk gaps leave, so the drawn gaps are exactly the sim's.
	const k = s.kerb
	const kerbHalf = (k.depth * scale) / 2
	const kerbZ = bounds.halfZ + k.offset * terrain.margin
	const kerbX = bounds.halfX + k.offset * terrain.margin
	const kerb = (x0, x1, z0, z1) =>
		kerbStones.push({
			kind: 'kerb',
			x: (x0 + x1) / 2,
			z: (z0 + z1) / 2,
			halfX: (x1 - x0) / 2,
			halfZ: (z1 - z0) / 2,
		})
	for (const flank of [-1, 1]) {
		const cuts = layout.gaps
			.filter((gap) => gap.flank === flank)
			.map((gap) => [gap.x0, gap.x1])
			.sort((a, b) => a[0] - b[0])
		let from = -kerbX
		for (const [x0, x1] of [...cuts, [kerbX, kerbX]]) {
			if (x0 > from) kerb(from, x0, flank * kerbZ - kerbHalf, flank * kerbZ + kerbHalf)
			from = Math.max(from, x1)
		}
		// The ends behind the bases.
		kerb(
			flank * kerbX - kerbHalf,
			flank * kerbX + kerbHalf,
			-k.ends * bounds.halfZ,
			k.ends * bounds.halfZ,
		)
	}
	// The slick inside each gap: a wet print with hazard stripes, so you can see where you can be dunked.
	const wet = new THREE.MeshBasicMaterial({
		color: s.dunk.wet,
		transparent: true,
		opacity: s.dunk.wetOpacity,
		depthWrite: false,
		polygonOffset: true,
		polygonOffsetFactor: -1,
	})
	owned.push(wet)
	const slick = Math.min(s.dunk.slick, bounds.halfZ)
	const wetPrints = layout.gaps.flatMap((gap) => {
		const z = gap.flank * (bounds.halfZ - slick / 2)
		const width = gap.x1 - gap.x0
		const stripes = []
		for (let x = gap.x0 + s.dunk.wetStripe / 2; x < gap.x1; x += s.dunk.wetStripe * 2)
			stripes.push(
				new THREE.PlaneGeometry(Math.min(s.dunk.wetStripe, gap.x1 - x), slick)
					.rotateX(-Math.PI / 2)
					.translate(x + Math.min(s.dunk.wetStripe, gap.x1 - x) / 2, layers.wet, z),
			)
		return [
			new THREE.PlaneGeometry(width, slick)
				.rotateX(-Math.PI / 2)
				.translate((gap.x0 + gap.x1) / 2, layers.wet, z),
			...stripes,
		]
	})
	if (wetPrints.length) {
		const mesh = add(mergeGeometries(wetPrints), wet, 0, 0, 0)
		mesh.name = 'flagfall-slick'
		mesh.layers.set(FORWARD_LAYER)
		mesh.renderOrder = -3
		for (const g of wetPrints) g.dispose()
	}
	// Brush: a moss mat at each jungle crossing, drawn over the court like the slick.
	const mat = new THREE.MeshBasicMaterial({
		color: s.colors.moss,
		transparent: true,
		opacity: 0.85,
		depthWrite: false,
		polygonOffset: true,
		polygonOffsetFactor: -1,
	})
	owned.push(mat)
	for (const b of layout.brush ?? []) {
		const mesh = add(
			new THREE.PlaneGeometry(b.halfX * 2, b.halfZ * 2).rotateX(-Math.PI / 2),
			mat,
			b.x,
			layers.wet,
			b.z,
		)
		mesh.layers.set(FORWARD_LAYER)
		mesh.renderOrder = -3
	}
	const unterrain = createMatchTerrain(group, layout, terrain, chalkLayout, {
		scenery: isleScenery,
		footprints: s.print,
		casts: { hedge: m.hedgeHeight, wall: m.wallHeight, pillar: m.pillarHeight + m.capHeight },
	})
	for (const side of [-1, 1]) {
		const team = material(side < 0 ? 'teamA' : 'teamB', { flat: true })
		const kerbs = []
		for (let x = m.dashSpacing; x < s.plaza.x; x += m.dashSpacing)
			for (const flank of [-1, 1])
				kerbs.push(
					new THREE.PlaneGeometry(m.dashLength, s.print.kerbWidth)
						.rotateX(-Math.PI / 2)
						.translate(side * x, layers.marks, flank * (s.lane.innerZ + s.print.kerbWidth)),
				)
		print(kerbs, team, `flagfall-kerbs-${side}`)
		for (const flank of [-1, 1])
			add(
				new THREE.PlaneGeometry(s.bounds.halfX - s.baseX, s.print.kerbWidth).rotateX(-Math.PI / 2),
				team,
				(side * (s.bounds.halfX + s.baseX)) / 2,
				layers.marks,
				flank * s.lane.innerZ,
			)
	}
	// Lantern posts: a squat stone post with a small cream glow, the only light on the court.
	const g = s.glow
	for (const post of layout.posts) {
		add(
			new THREE.CylinderGeometry(
				g.postRadius * scale,
				g.postRadius * 1.5 * scale,
				g.post * scale,
				6,
			),
			scenery,
			post.x,
			(g.post * scale) / 2,
			post.z,
		)
		lanterns.push({ x: post.x, y: (g.post + g.lantern) * scale, z: post.z })
	}
	return unterrain
}
