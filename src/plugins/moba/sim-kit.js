import { STEP } from '../../core/app.js'

export const SLOTS = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5']
export const ticks = (seconds) => Math.max(0, Math.round(seconds / STEP))
// Yaw ↔ ground direction, matching body.face: yaw = atan2(x, z) + π.
export const yawOf = (x, z) => Math.atan2(x, z) + Math.PI
export const dirOf = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) })
