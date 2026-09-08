import * as THREE from 'three'
import { PALETTE } from './style.js'
import { onCourt } from './arena.js'

// Printed drop shadows. The style pass has no lights and no shadow map, so
// height would otherwise be unreadable: an arrow at head height and an arrow on
// the ground draw identically from this camera. A flat disc under each caster
// restores the cue — the gap between a thing and its shadow IS its height —
// without paying for a shadow map, and it matches the sticker language better
// than a soft projected shadow would.
//
// One pooled, pre-allocated set of discs. Nothing is allocated per round.

const POOL = 24
const LIFT = 0.014 // above the court line, below the ammo marker

export function createShadows(scene) {
	const geometry = new THREE.CircleGeometry(1, 18)
	const material = new THREE.MeshBasicMaterial({ color: PALETTE.courtShade })
	const discs = []
	for (let i = 0; i < POOL; i++) {
		const disc = new THREE.Mesh(geometry, material)
		disc.rotation.x = -Math.PI / 2
		disc.visible = false
		scene.add(disc)
		discs.push(disc)
	}

	let used = 0
	function cast(x, y, z, radius) {
		if (used >= POOL || !onCourt(x, z)) return // nothing to fall on out over the void
		const disc = discs[used++]
		// Shrink a little with height so a high shot reads as high even where the
		// caster and its shadow overlap on screen.
		const shrink = 1 - Math.min(Math.max(y, 0) / 8, 1) * 0.35
		disc.position.set(x, LIFT, z)
		disc.scale.setScalar(Math.max(0.05, radius * shrink))
		disc.visible = true
	}

	// Called once per frame with the live round (or null in an empty scene).
	function update(round) {
		used = 0
		if (round) {
			for (const unit of round.units) {
				if (!unit.alive) continue
				const p = unit.position
				cast(p.x, p.y - 1, p.z, 0.46)
			}
			for (const arrow of round.arrows) {
				if (arrow.state !== 'flying') continue
				const p = arrow.position
				cast(p.x, p.y, p.z, arrow.kind === 'bowl' ? 0.5 : 0.2)
			}
		}
		for (let i = used; i < POOL; i++) discs[i].visible = false
	}

	function dispose() {
		for (const disc of discs) scene.remove(disc)
		geometry.dispose()
		material.dispose()
		discs.length = 0
	}

	return { update, dispose }
}
