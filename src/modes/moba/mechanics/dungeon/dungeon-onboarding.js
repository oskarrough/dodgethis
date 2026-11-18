import { STEP } from '../../../../core/app.js'
import { look } from '../../look.js'
import { floorArrow } from '../../onboarding.js'

// The way in, drawn rather than written: the lanes' yellow floor arrow lies at your feet and points
// at the gate, and fades once you come within `NEAR` m of Manos or the hands begin to fill.
const NEAR = 12

export function createGateArrow({ scene, sim, hero }) {
	const t = look.onboarding
	const arrow = floorArrow(scene)
	let fadedAt = null
	return {
		update({ alpha }) {
			const tick = sim.tick + alpha
			// A restart rewinds the tick: point the way again.
			if (fadedAt !== null && tick < fadedAt) fadedAt = null
			if (fadedAt !== null && (tick - fadedAt) * STEP >= t.arrowFade)
				return void (arrow.mesh.visible = false)
			const gate = sim.dungeon?.encounters?.find((e) => e.id === 'manos')
			const p = hero?.body.mesh.position
			if (!gate || !p) return void (arrow.mesh.visible = false)
			const dx = gate.spot.x - p.x,
				dz = gate.spot.z - p.z
			const there = gate.killed || gate.state.phase !== 'idle' || Math.hypot(dx, dz) <= NEAR
			if (there && fadedAt === null) fadedAt = tick
			const fade = fadedAt === null ? 1 : Math.max(0, 1 - ((tick - fadedAt) * STEP) / t.arrowFade)
			arrow.fade(fade)
			arrow.mesh.visible = !hero.dead && fade > 0
			const angle = Math.atan2(dz, dx)
			arrow.mesh.position.set(
				p.x + Math.cos(angle) * t.arrowOffset,
				t.arrowY,
				p.z + Math.sin(angle) * t.arrowOffset,
			)
			arrow.mesh.rotation.z = -angle
		},
		dispose: arrow.dispose,
	}
}
