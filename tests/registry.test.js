import { expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MOBA, registryFiles } from '../scripts/registry.js'

// Every hero, ability and piece folder is in its generated registry (docs/mods.md). Run `bun run registry`.
test('generated registries list every folder', () => {
	for (const [path, contents] of Object.entries(registryFiles())) {
		const file = join(MOBA, path)
		expect(existsSync(file) ? readFileSync(file, 'utf8') : null, path).toBe(contents)
	}
})
