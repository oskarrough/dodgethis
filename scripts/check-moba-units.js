// Schema lint: tune numbers stay plain data, but every path must have a declared dimension.
import { tune } from '../src/modes/moba/tune.js'
import { units } from '../src/core/units.js'
import { resolveUnit, tuneUnits } from '../src/modes/moba/units.js'

const errors = []
for (const [key, unit] of Object.entries(tuneUnits))
	if (!Object.hasOwn(units, unit)) errors.push(`Unknown unit "${unit}" declared for ${key}`)

let count = 0
function walk(object, path = []) {
	for (const [key, value] of Object.entries(object)) {
		const next = [...path, key]
		if (typeof value === 'number') {
			count++
			if (!resolveUnit(next.join('.'))) errors.push(`tune.${next.join('.')}`)
		} else if (value && typeof value === 'object') walk(value, next)
	}
}
walk(tune)
if (errors.length) {
	console.error(
		`MOBA unit schema: ${errors.length} missing/invalid declarations:\n${errors.join('\n')}`,
	)
	process.exitCode = 1
} else console.log(`MOBA unit schema: ${count} numbers declared.`)
