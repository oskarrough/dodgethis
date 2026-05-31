import RAPIER from '@dimforge/rapier3d-compat'
import { tune } from './debug.js'

// Rapier ships as wasm; -compat needs an async init before use.
export async function initPhysics() {
	await RAPIER.init()
	const world = new RAPIER.World({ x: 0, y: tune.physics.gravity, z: 0 })
	return { RAPIER, world }
}
