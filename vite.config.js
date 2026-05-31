import { defineConfig } from 'vite'
import wasm from 'vite-plugin-wasm'

// Rapier (non-compat) ships its physics engine as a real .wasm file. vite-plugin-wasm
// rewrites Rapier's `import * as wasm from './…_bg.wasm'` into a generated module that
// instantiates the wasm at top level (`const m = await initWasm(…)`). build.target
// 'esnext' gives native top-level await, so vite-plugin-top-level-await isn't needed.
//
// The catch: Rapier's package.json marks almost everything side-effect-free, so
// Rollup's production tree-shaker deletes that `await initWasm(…)` as a pure, unused
// statement — the wasm exports then come back `undefined` and the game fails to boot
// (`Cannot read … 'rawintegrationparameters_new'`). Dev is unaffected (no shaking).
// Module-level `treeshake.moduleSideEffects` can't save a statement-level elimination,
// so tree-shaking is disabled. It costs little here (~12 kB gzip): the app imports
// `* as THREE` everywhere, which already limits what three.js shaking could remove.
//
// The payoff stands: the ~1.5 MB wasm is emitted as its own cacheable, streamable
// asset instead of base64-inlined into the JS — the initial JS bundle drops from
// ~906 kB gzip (the -compat build) to ~180 kB gzip.
export default defineConfig({
	plugins: [wasm()],
	build: {
		target: 'esnext',
		rollupOptions: { treeshake: false },
	},
})
