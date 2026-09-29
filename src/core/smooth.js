import * as THREE from 'three'

// Render interpolation (docs/plugin-architecture.md, "Solo render interpolation"): the simulation runs at 60 Hz, the screen at whatever it likes.
// After every step `capture()` records each object's sim pose; `pose(alpha)` then places the rendered object between the last two.
export function createSmoother() {
	const entries = new Map()

	function record(entry, snap) {
		const { position, quaternion } = entry.read()
		if (!snap) {
			entry.prev.position.copy(entry.curr.position)
			entry.prev.quaternion.copy(entry.curr.quaternion)
		}
		entry.curr.position.copy(position)
		entry.curr.quaternion.copy(quaternion)
		if (snap) {
			entry.prev.position.copy(position)
			entry.prev.quaternion.copy(quaternion)
			entry.fresh = false
		}
	}
	const sample = () => ({ position: new THREE.Vector3(), quaternion: new THREE.Quaternion() })

	return {
		// `read()` returns the sim pose ({ position, quaternion }, e.g. an unrendered Object3D). Returns the removal.
		add(object, read) {
			if (entries.has(object)) throw new Error('Object is already smoothed')
			const entry = { object, read, prev: sample(), curr: sample(), fresh: true }
			entries.set(object, entry)
			return () => entries.get(object) === entry && entries.delete(object)
		},
		// Teleports, spawns and deaths: the next pose starts from wherever the sim is, with no blend.
		snap(object) {
			const entry = entries.get(object)
			if (entry) entry.fresh = true
		},
		snapAll() {
			for (const entry of entries.values()) entry.fresh = true
		},
		capture() {
			for (const entry of entries.values()) record(entry, entry.fresh)
		},
		pose(alpha) {
			for (const entry of entries.values()) {
				if (entry.fresh) record(entry, true)
				const { object, prev, curr } = entry
				object.position.lerpVectors(prev.position, curr.position, alpha)
				object.quaternion.slerpQuaternions(prev.quaternion, curr.quaternion, alpha)
			}
		},
		get size() {
			return entries.size
		},
	}
}
