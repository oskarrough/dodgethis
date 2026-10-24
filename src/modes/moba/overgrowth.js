import * as THREE from 'three'

// Leaves on the walls: clumps along a wall's top in runs, fronds hanging down its faces and a
// few tufts at its foot, like the moss spilling over the walls on the Reference shelf (docs/world.md).
// Nothing reaches past the wall by more than `spill` m, so the court stays clear and the collider honest.
// Returns geometries in two roles, `leaf` (lit clumps) and `leafDeep` (fronds and tufts in shade);
// the caller merges and prints them.
export function overgrowth(boxes, heightOf, o) {
	const leaf = []
	const deep = []
	let n = 0
	const chance = () => {
		const v = Math.sin(++n * 78.233 + o.seed * 12.9898) * 43758.5453
		return v - Math.floor(v)
	}
	const between = (a, b) => a + chance() * (b - a)
	// One soft blob, squashed and turned so no two read alike. Smooth normals keep the ink to its
	// outline, so a clump reads as leaves and not as a cut gem.
	const blob = (r, squash) =>
		new THREE.SphereGeometry(r, 7, 5)
			.scale(between(0.85, 1.15), squash, between(0.85, 1.15))
			.rotateY(chance() * Math.PI)
			.rotateX((chance() - 0.5) * 0.4)
	for (const b of boxes) {
		const h = heightOf(b)
		const alongX = b.halfX >= b.halfZ
		const half = alongX ? b.halfX : b.halfZ
		const depth = alongX ? b.halfZ : b.halfX
		// Put a point given along the wall (`u`), across it (`v`) and up (`y`) into the world.
		const place = (g, u, v, y) =>
			g.translate(alongX ? b.x + u : b.x + v, y, alongX ? b.z + v : b.z + u)
		// Runs of growth along the top: a run starts with `cover` odds and lasts a few metres.
		let u = -half
		while (u < half) {
			const run = between(o.run[0], o.run[1])
			const grown = chance() < o.cover
			if (!grown) {
				u += run * between(0.5, 1)
				continue
			}
			const end = Math.min(half, u + run)
			for (; u < end; u += between(o.step[0], o.step[1])) {
				const r = between(o.clump[0], o.clump[1])
				const reach = Math.max(0, depth + o.spill - r)
				const v = between(-1, 1) * Math.min(reach, depth * 0.7)
				leaf.push(place(blob(r, o.squash), u, v, h + r * o.squash * 0.35))
				// Fronds drop down whichever face this clump leans toward.
				if (chance() > o.hang) continue
				const side = v >= 0 ? 1 : -1
				const drop = between(o.drop[0], o.drop[1]) * h
				let y = h - r * 0.2
				let s = r * 0.75
				for (; y > h - drop && s > o.clump[0] * 0.3;) {
					// Each frond's outer edge sits exactly `spill` past the face.
					deep.push(place(blob(s, 0.8), u + between(-0.1, 0.1), side * (depth + o.spill - s), y))
					y -= s * 1.3
					s *= o.taper
				}
			}
		}
		// A few tufts at the foot, so the wall reads as rooted in the ground.
		for (let t = -half; t < half; t += between(o.foot[0], o.foot[1])) {
			if (chance() > o.tufts) continue
			const side = chance() < 0.5 ? -1 : 1
			const r = between(o.clump[0], o.clump[1]) * 0.6
			deep.push(place(blob(r, 0.55), t, side * (depth + o.spill - r), r * 0.25))
		}
	}
	return { leaf, deep }
}
