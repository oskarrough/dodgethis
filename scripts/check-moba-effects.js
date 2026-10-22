// Effect records declare local tune references; reject missing numbers and wrong dimensions.
// Boot hero/ability registries in their normal order (ability hooks can import hero helpers).
import { HEROES } from '../src/modes/moba/heroes.js'
import { heroTrait, renderCardTemplate } from '../src/modes/moba/tooltip.js'
import {
	STATUS_EFFECT_REFS,
	AREA_EFFECT_REFS,
	areaEffectRecord,
} from '../src/modes/moba/ability.js'
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
function checkActions(id, manifest, actions) {
	if (!Array.isArray(actions)) {
		errors.push(`${id}: actions must be an array`)
		return
	}
	for (const action of actions) {
		if (!action || action.deliver !== 'area') {
			errors.push(`${id}: unknown delivery ${action?.deliver}`)
			continue
		}
		for (const field of Object.keys(action))
			if (
				![
					'deliver',
					'from',
					'shape',
					'targets',
					'blockedBy',
					'population',
					'where',
					'hit',
				].includes(field)
			)
				errors.push(`${id}: unknown area field ${field}`)
		if (!['self', 'at'].includes(action.from))
			errors.push(`${id}: unknown area origin ${action.from}`)
		if (!['circle', 'cone'].includes(action.shape))
			errors.push(`${id}: unknown area shape ${action.shape}`)
		if (!['enemies', 'enemyHero'].includes(action.targets))
			errors.push(`${id}: unknown area targets ${action.targets}`)
		if (action.blockedBy !== undefined && action.blockedBy !== 'cover')
			errors.push(`${id}: unknown area blocker ${action.blockedBy}`)
		if (action.population !== undefined && action.population !== 'heroes')
			errors.push(`${id}: unknown area population ${action.population}`)
		if (action.where !== undefined && typeof action.where !== 'function')
			errors.push(`${id}: area where must be a function`)
		checkRef(id, 'area reach', action.shape === 'cone' ? 'range' : 'radius', 'm')
		if (action.shape === 'cone') checkRef(id, 'area angle', 'angle', 'deg')
		if (!Array.isArray(action.hit) || !action.hit.length) {
			errors.push(`${id}: area hit must be a nonempty effect array`)
			continue
		}
		const seen = new Set()
		for (const input of action.hit) {
			const record = areaEffectRecord(manifest, input)
			const refs = AREA_EFFECT_REFS[record?.effect] ?? STATUS_EFFECT_REFS[record?.effect]
			if (!record || !['damage', 'slow', 'freeze', 'knockback'].includes(record.effect) || !refs) {
				errors.push(
					`${id}: unknown area effect ${typeof input === 'string' ? input : input?.effect}`,
				)
				continue
			}
			if (seen.has(record.effect)) errors.push(`${id}: duplicate area effect ${record.effect}`)
			seen.add(record.effect)
			if (
				['slow', 'freeze'].includes(record.effect) &&
				!manifest.statusEffects?.some((effect) => effect.effect === record.effect)
			)
				errors.push(`${id}: area ${record.effect} needs a matching status effect`)
			for (const [field, unit] of Object.entries(refs)) {
				if (field === 'enabled' && record[field] === undefined) continue
				checkRef(id, field, record[field], unit)
			}
			for (const field of Object.keys(record))
				if (!['effect', 'scale', 'stack'].includes(field) && !Object.hasOwn(refs, field))
					errors.push(`${id}: unknown ${record.effect} field ${field}`)
			if (record.scale !== undefined && record.scale !== null)
				errors.push(`${id}: unsupported area effect scaling`)
			if (record.scale === null && record.effect !== 'damage')
				errors.push(`${id}: only area damage supports scaling`)
			if (record.stack !== undefined && !(record.effect === 'slow' && record.stack === 'strongest'))
				errors.push(`${id}: unsupported area effect stacking`)
		}
	}
}
function checkHooks(id, manifest, on) {
	for (const [event, hook] of Object.entries(on ?? {})) {
		if (
			![
				'cast',
				'tick',
				'amplify',
				'damage',
				'absorb',
				'hit',
				'damaged',
				'death',
				'release',
				'land',
				'dashEnd',
				'end',
				'apply',
				'remove',
				'expire',
			].includes(event)
		)
			errors.push(`${id}: unknown event ${event}`)
		if (typeof hook === 'function') continue
		if (Array.isArray(hook)) checkActions(id, manifest, hook)
		else if (hook && typeof hook === 'object') {
			for (const [stage, value] of Object.entries(hook)) {
				if (stage === 'do') checkActions(id, manifest, value)
				else if (!['before', 'replace', 'after'].includes(stage) || typeof value !== 'function')
					errors.push(`${id}: invalid hook stage ${stage}`)
			}
		} else errors.push(`${id}: invalid hook for ${event}`)
	}
}
for (const [id, manifest] of Object.entries(manifests)) {
	checkHooks(id, manifest, manifest.on)
	for (const status of Object.values(manifest.statuses ?? {})) checkHooks(id, manifest, status.on)
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
