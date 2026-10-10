import { expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MOBA, registryFiles } from '../scripts/registry.js'

// Every hero, ability, map and piece folder is in its generated registry (docs/mods.md). Run `bun run registry`.
test('generated registries list every folder', () => {
	for (const [path, contents] of Object.entries(registryFiles())) {
		const file = join(MOBA, path)
		expect(existsSync(file) ? readFileSync(file, 'utf8') : null, path).toBe(contents)
	}
})

// The sim loads the manifests and tunes, so they stay free of view code (docs/mods.md):
// no Three.js, view files, front/ or a view registry anywhere in their static imports,
// and a folder tune.js imports nothing at all. The walk stays inside the plugin: core is the
// engine every sim file already shares (STEP comes from core/app.js).
test('manifests and tunes stay sim-safe', () => {
	const banned =
		/(^three($|\/))|-view\.js$|(^|\/)front\/|(^|\/)(views?|costume|numbers|ground|scenery)\.js$/
	const importsOf = (file) =>
		[
			...readFileSync(file, 'utf8').matchAll(
				/^\s*(?:import|export)\s(?:[^'"]*?from\s+)?['"]([^'"]+)['"]/gm,
			),
		].map((m) => m[1])
	const seen = new Set()
	// The root tune.js is the data assembly (it reads front/*-tune.js numbers); not walked.
	const walk = (file) => {
		if (seen.has(file) || file === join(MOBA, 'tune.js')) return
		seen.add(file)
		for (const spec of importsOf(file)) {
			expect(spec, `${file} imports ${spec}`).not.toMatch(banned)
			const target = join(file, '..', spec)
			if (spec.startsWith('.') && target.startsWith(MOBA)) walk(target)
		}
	}
	for (const entry of [
		'heroes/index.js',
		'abilities/index.js',
		'pieces/index.js',
		'maps/index.js',
		'tunes.js',
	])
		walk(join(MOBA, entry))
	for (const kind of ['heroes', 'abilities', 'maps'])
		for (const folder of readdirSync(join(MOBA, kind), { withFileTypes: true })) {
			const tuneFile = join(MOBA, kind, folder.name, 'tune.js')
			if (folder.isDirectory() && existsSync(tuneFile))
				expect(importsOf(tuneFile), tuneFile).toEqual([])
		}
})
