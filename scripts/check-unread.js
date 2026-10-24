// Leftovers lint: what a removal can strand. A stylesheet nothing imports, and a MOBA tune key
// whose name no code mentions. It matches names only: a key read through a computed name
// (s.structures[`${kind}X`]) looks unread, so spell such reads out before deleting what it flags.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { tune } from '../src/modes/moba/tune.js'

const files = execSync('git ls-files src scripts tests index.html', { encoding: 'utf8' })
	.split('\n')
	.filter(Boolean)
const code = files.filter((f) => /\.(js|mjs|html)$/.test(f))
const errors = []

for (const css of files.filter((f) => f.startsWith('src/') && f.endsWith('.css'))) {
	const name = basename(css)
	if (!code.some((f) => readFileSync(f, 'utf8').includes(`/${name}'`)))
		errors.push(`${css}: nothing imports it`)
}

// Readers: everything but the tune files and the unit table, which only declare.
const readers = code
	.filter((f) => !/(-tune|\/tune|\/units|\/all-tunes)\.js$/.test(f))
	.map((f) => readFileSync(f, 'utf8'))
	.join('\n')
const words = new Set(readers.match(/[A-Za-z_$][\w$]*/g))
;(function walk(object, path) {
	for (const [key, value] of Object.entries(object)) {
		if (/^\d+$/.test(key)) continue
		const at = path ? `${path}.${key}` : key
		if (!words.has(key)) errors.push(`tune.${at}: no code reads it`)
		else if (value && typeof value === 'object' && !Array.isArray(value)) walk(value, at)
	}
})(tune, '')

if (errors.length) {
	console.error(`Unread leftovers: ${errors.length}\n${errors.join('\n')}`)
	process.exitCode = 1
} else console.log('Unread leftovers: none.')
