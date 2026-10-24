// Schema lint: tune numbers stay plain data, but every path must have a declared dimension.
import { tune } from '../src/modes/moba/tune.js'
import { look } from '../src/modes/moba/look.js'
import { tune as front } from '../src/modes/moba/front/tune.js'
import { units } from '../src/core/units.js'
import { resolveUnit, tuneUnits } from '../src/modes/moba/units.js'

const errors = []
for (const [key, unit] of Object.entries(tuneUnits))
	if (!Object.hasOwn(units, unit)) errors.push(`Unknown unit "${unit}" declared for ${key}`)

let count = 0
const paths = []
function walk(object, path = []) {
	for (const [key, value] of Object.entries(object)) {
		const next = [...path, key]
		paths.push(next.join('.'))
		if (typeof value === 'number') {
			count++
			if (!resolveUnit(next.join('.'))) errors.push(`tune.${next.join('.')}`)
		} else if (value && typeof value === 'object') walk(value, next)
	}
}
walk(tune)
// The Tuner resolves look and the front's tune through the same table (sliders.js, front/index.js).
;(function more(object, path = []) {
	for (const [key, value] of Object.entries(object)) {
		paths.push([...path, key].join('.'))
		if (value && typeof value === 'object') more(value, [...path, key])
	}
})({ ...look, front })
// A dotted declaration whose tune path is gone was left behind by a removal.
for (const key of Object.keys(tuneUnits))
	if (key.includes('.') && !paths.some((path) => path === key || path.endsWith(`.${key}`)))
		errors.push(`Stale declaration ${key}: no tune path ends with it`)
if (errors.length) {
	console.error(
		`MOBA unit schema: ${errors.length} missing/invalid declarations:\n${errors.join('\n')}`,
	)
	process.exitCode = 1
} else console.log(`MOBA unit schema: ${count} numbers declared.`)
