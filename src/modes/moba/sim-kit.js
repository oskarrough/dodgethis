import { STEP } from '../../core/app.js'

export const TAU = Math.PI * 2
export const SLOTS = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5']
export const ticks = (seconds) => Math.max(0, Math.round(seconds / STEP))
// Yaw ↔ ground direction, matching body.face: yaw = atan2(x, z) + π.
export const yawOf = (x, z) => Math.atan2(x, z) + Math.PI
export const dirOf = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) })

// Backswings are recovery, not unfinished casts; only interrupted windups need a fact.
export function cancelAttack(unit, present, reason) {
	if (unit.attack && unit.attack.phase !== 'backswing')
		present({
			type: 'castCancelled',
			hero: unit.id,
			ability: unit.definition?.basic?.id ?? null,
			slot: unit.kind ?? 'primary',
			reason,
		})
	unit.attack = null
}
