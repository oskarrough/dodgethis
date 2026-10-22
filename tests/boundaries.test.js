import { expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

// Core imports only core; a mode and online import core and themselves; nothing imports sideways (docs/extending.md, Glossary).
// ALLOWED is the burn-down of violations that predate the rule: entries may only be removed, and a fixed one must be deleted here.
const ALLOWED = []

const root = resolve(import.meta.dir, '..')
const walk = (dir) =>
	readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name)
		return entry.isDirectory() ? walk(path) : path.endsWith('.js') ? [path] : []
	})

// 'core', 'modes/<name>', 'online', or null for anything outside (main.js, packages).
function owner(path) {
	const [top, name] = relative(join(root, 'src'), path).split('/')
	if (top === 'core') return 'core'
	if (top === 'modes') return `modes/${name}`
	if (top === 'online') return 'online'
	return null
}

function violations() {
	const found = []
	for (const file of [
		...walk(join(root, 'src/core')),
		...walk(join(root, 'src/modes')),
		...walk(join(root, 'src/online')),
	]) {
		const from = owner(file)
		const source = readFileSync(file, 'utf8')
		for (const [, spec] of source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
			if (!spec.startsWith('.')) continue
			const target = resolve(dirname(file), spec)
			const to = owner(target)
			if (to === null || to === 'core' || to === from) continue
			found.push(`${relative(root, file)} -> ${relative(root, target)}`)
		}
	}
	return found.sort()
}

test('core, modes and online import only core and themselves', () => {
	const found = violations()
	expect(found.filter((v) => !ALLOWED.includes(v))).toEqual([])
})

test('the allowlist has no entries that are already fixed', () => {
	const found = violations()
	expect(ALLOWED.filter((v) => !found.includes(v))).toEqual([])
})
