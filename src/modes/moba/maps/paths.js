// Authored A→B paths become team-relative distances. Goals compose in metres,
// then turn back into ordinary world-space orders; no steering or sim state here.
export function laneRoute(path, team, file = 0) {
	const points = team === 'A' ? path : [...path].reverse()
	const legs = points.slice(1).map((to, i) => {
		const from = points[i]
		const length = Math.hypot(to.x - from.x, to.z - from.z)
		return {
			from,
			to,
			length,
			x: (to.x - from.x) / (length || 1),
			z: (to.z - from.z) / (length || 1),
		}
	})
	const length = legs.reduce((sum, leg) => sum + leg.length, 0)
	// Horizontal files use signed metres from x=0. This avoids a subtract/add
	// round trip and preserves exact seeded outcomes on the original lane.
	const forward = legs.find((leg) => leg.length)?.x
	if (Math.abs(forward) === 1 && legs.every((leg) => !leg.length || leg.x === forward)) {
		return {
			length,
			midpoint: (forward * (points[0].x + points.at(-1).x)) / 2,
			progress: (at) => forward * at.x,
			point: (progress) => ({ x: forward * progress, z: points[0].z + file }),
		}
	}
	return {
		length,
		midpoint: length / 2,
		progress(at) {
			let along = 0,
				best = Infinity,
				progress = 0
			for (const leg of legs) {
				const t = Math.max(
					0,
					Math.min(leg.length, (at.x - leg.from.x) * leg.x + (at.z - leg.from.z) * leg.z),
				)
				const d = Math.hypot(at.x - leg.from.x - leg.x * t, at.z - leg.from.z - leg.z * t)
				if (d < best) {
					best = d
					progress = along + t
				}
				along += leg.length
			}
			return progress
		},
		point(progress) {
			let left = Math.max(0, Math.min(length, progress))
			for (const [i, leg] of legs.entries()) {
				if (left <= leg.length || i === legs.length - 1) {
					const normal = team === 'A' ? file : -file
					return {
						x: leg.from.x + leg.x * left - leg.z * normal,
						z: leg.from.z + leg.z * left + leg.x * normal,
					}
				}
				left -= leg.length
			}
			return { ...points[0] }
		},
	}
}
