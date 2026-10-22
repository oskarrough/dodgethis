// Effect records declare local tune references; reject missing numbers and wrong dimensions.
// Boot hero/ability registries in their normal order (ability hooks can import hero helpers).
import { HEROES } from '../src/modes/moba/heroes.js'
import { heroTrait, renderCardTemplate } from '../src/modes/moba/tooltip.js'
import { STATUS_EFFECT_REFS } from '../src/modes/moba/ability.js'
import manifests from '../src/modes/moba/abilities/all-abilities.js'
import { tune } from '../src/modes/moba/tune.js'
import { resolveUnit } from '../src/modes/moba/units.js'

const errors = []
let count = 0
function checkRef(id, field, ref, unit) {
	count++
	const path = `${id}.${ref}`
	if (typeof ref !== 'string' || !Object.hasOwn(tune[id] ?? {}, ref))
		errors.push(`${id} ${field}: missing tune reference ${String(ref)}`)
	else if (!Number.isFinite(tune[id][ref]))
		errors.push(`${id} ${field}: tune.${path} must be a finite number`)
	else if (resolveUnit(path) !== unit)
		errors.push(`${id} ${field}: tune.${path} needs ${unit}, got ${resolveUnit(path) ?? 'no unit'}`)
}
for (const [id, manifest] of Object.entries(manifests)) {
	if (manifest.card) {
		const { summary = '', notes = [] } = manifest.card
		try {
			if (!Array.isArray(notes)) throw new Error('card notes must be an array of templates')
			for (const template of [summary, ...notes]) {
				renderCardTemplate(template, id)
				count++
			}
		} catch (error) {
			errors.push(`${id} card: ${error.message}`)
		}
	}
	const keys = new Set(Object.keys(manifest.statuses ?? {}))
	for (const record of manifest.statusEffects ?? []) {
		const refs = STATUS_EFFECT_REFS[record?.effect]
		if (!refs || !Object.hasOwn(STATUS_EFFECT_REFS, record.effect)) {
			errors.push(`${id}: unknown status effect ${record?.effect}`)
			continue
		}
		if (keys.has(record.effect)) errors.push(`${id}: duplicate status key ${record.effect}`)
		keys.add(record.effect)
		for (const [field, unit] of Object.entries(refs)) {
			if (field === 'enabled' && record[field] === undefined) continue
			checkRef(id, field, record[field], unit)
		}
		for (const field of Object.keys(record))
			if (
				field !== 'effect' &&
				field !== 'scale' &&
				field !== 'stack' &&
				!Object.hasOwn(refs, field)
			)
				errors.push(`${id}: unknown ${record.effect} field ${field}`)
		if (record.scale !== undefined && record.scale !== null)
			errors.push(`${id}: status effects do not support scaling`)
		if (record.stack !== undefined && !(record.effect === 'slow' && record.stack === 'strongest'))
			errors.push(`${id}: unsupported ${record.effect} stack ${record.stack}`)
	}
	// Hand-written statuses can opt into the same tune-key fields without becoming effects.
	for (const [key, status] of Object.entries(manifest.statuses ?? {}))
		for (const [field, unit] of Object.entries({
			duration: 's',
			interval: 's',
			amount: 'hp',
			moveSpeed: 'multiplier',
		}))
			if (typeof status[field] === 'string') checkRef(id, `${key}.${field}`, status[field], unit)
}
for (const id of Object.keys(HEROES)) {
	try {
		if (heroTrait(id)) count++
	} catch (error) {
		errors.push(`${id} trait: ${error.message}`)
	}
}
if (errors.length) {
	console.error(`MOBA effect schema: ${errors.length} invalid declarations:\n${errors.join('\n')}`)
	process.exitCode = 1
} else console.log(`MOBA effect schema: ${count} tune references and card templates checked.`)
