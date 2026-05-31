import { tune } from './debug.js'

// Rapier ships as wasm. The non-compat build instantiates the wasm at module-load
// time (wired up by vite-plugin-wasm). A dynamic import isolates Rapier + its wasm
// init into their own chunk and resolves once the wasm is ready, so there's no
// RAPIER.init() to await. The wasm lives in its own cacheable file rather than
// base64-inlined into the JS bundle (the -compat build's cost).
export async function initPhysics() {
	const RAPIER = await import('@dimforge/rapier3d')
	const world = new RAPIER.World({ x: 0, y: tune.physics.gravity, z: 0 })
	return { RAPIER, world }
}
