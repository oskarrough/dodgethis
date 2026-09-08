import { tune } from './tune.js'

// Rapier ships as wasm: a dynamic import isolates it and its init into their own chunk (vite-plugin-wasm), so there's no RAPIER.init() to await and the wasm stays a cacheable file instead of base64-inlining into the bundle.
export async function initPhysics() {
	const RAPIER = await import('@dimforge/rapier3d')
	const world = new RAPIER.World({ x: 0, y: tune.physics.gravity, z: 0 })
	return { RAPIER, world }
}
