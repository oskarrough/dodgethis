// Effect records declare local tune references; reject missing numbers and wrong dimensions.
// Boot hero/ability registries in their normal order (ability hooks can import hero helpers).
import { HEROES, WARDEN_UNIT } from '../src/modes/moba/heroes.js'
import { MINION_DEFINITIONS } from '../src/modes/moba/lane-waves.js'
import { STRUCTURE_DEFINITIONS } from '../src/modes/moba/lane-structures.js'
import { UNIT_REFS, UNIT_ATTACK_REFS } from '../src/modes/moba/unit-definition.js'
import { heroTrait, renderCardTemplate } from '../src/modes/moba/tooltip.js'
import {
	ABILITIES,
	STATUS_EFFECT_REFS,
	AREA_EFFECT_REFS,
	areaEffectRecord,
	validateHookMap,
	AURA_EVENTS,
	ABILITY_STAGES,
} from '../src/modes/moba/ability.js'
import manifests from '../src/modes/moba/abilities/all-abilities.js'
import { tune } from '../src/modes/moba/tune.js'
import { resolveUnit } from '../src/modes/moba/units.js'

const errors = []
let count = 0
function checkRef(id, field, ref, unit) {
	count++
	const path = `${id}.${ref}`
	const stats = id.split('.').reduce((value, key) => value?.[key], tune)
	if (typeof ref !== 'string' || !Object.hasOwn(stats ?? {}, ref))
		errors.push(`${id} ${field}: missing tune reference ${String(ref)}`)
	else if (!Number.isFinite(stats[ref]))
		errors.push(`${id} ${field}: tune.${path} must be a finite number`)
	else if (resolveUnit(path) !== unit)
		errors.push(`${id} ${field}: tune.${path} needs ${unit}, got ${resolveUnit(path) ?? 'no unit'}`)
}
function checkUnit(id, declaration, source = () => id) {
	if (!declaration || typeof declaration !== 'object') {
		errors.push(`${id}: missing unit declaration`)
		return
	}
	for (const field of Object.keys(declaration))
		if (
			!Object.hasOwn(UNIT_REFS, field) &&
			!['attack', 'kit', 'traits', 'brain', 'state', 'validData'].includes(field)
		)
			errors.push(`${id}: unknown unit field ${field}`)
	for (const [field, unit] of Object.entries(UNIT_REFS)) {
		const ref = declaration[field]
		if (ref !== undefined && typeof ref !== 'function') checkRef(source(ref), field, ref, unit)
	}
	const attack = declaration.attack
	if (typeof attack === 'string') {
		if (!Object.hasOwn(ABILITIES, attack)) errors.push(`${id}: unknown unit attack ${attack}`)
	} else if (attack !== undefined) {
		if (!attack || typeof attack !== 'object') errors.push(`${id}: invalid unit attack`)
		else
			for (const [field, ref] of Object.entries(attack)) {
				if (!Object.hasOwn(UNIT_ATTACK_REFS, field))
					errors.push(`${id}: unknown unit attack field ${field}`)
				else if (typeof ref !== 'function')
					checkRef(source(ref), `attack.${field}`, ref, UNIT_ATTACK_REFS[field])
			}
	}
	for (const [slot, ability] of Object.entries(declaration.kit ?? {})) {
		if (!['slot1', 'slot2', 'slot3', 'slot4'].includes(slot))
			errors.push(`${id}: unknown unit kit slot ${slot}`)
		if (!Object.hasOwn(ABILITIES, ability))
			errors.push(`${id}: unknown unit kit ability ${ability}`)
	}
	if (
		declaration.traits !== undefined &&
		(!declaration.traits || typeof declaration.traits !== 'object')
	)
		errors.push(`${id}: unit traits must be an object`)
	if (
		declaration.brain !== undefined &&
		typeof declaration.brain !== 'function' &&
		!['boss', 'lane'].includes(declaration.brain)
	)
		errors.push(`${id}: unknown unit brain ${declaration.brain}`)
	for (const field of ['state', 'validData'])
		if (declaration[field] !== undefined && typeof declaration[field] !== 'function')
			errors.push(`${id}: unit ${field} must be a function`)
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
			if (!['deliver', 'from', 'shape', 'targets', 'blockedBy', 'where', 'hit'].includes(field))
				errors.push(`${id}: unknown area field ${field}`)
		if (!['self', 'at'].includes(action.from))
			errors.push(`${id}: unknown area origin ${action.from}`)
		if (!['circle', 'cone'].includes(action.shape))
			errors.push(`${id}: unknown area shape ${action.shape}`)
		if (!['enemies', 'enemyHero'].includes(action.targets))
			errors.push(`${id}: unknown area targets ${action.targets}`)
		if (action.blockedBy !== undefined && action.blockedBy !== 'cover')
			errors.push(`${id}: unknown area blocker ${action.blockedBy}`)
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
			for (const [field, unit] of Object.entries(refs)) checkRef(id, field, record[field], unit)
			for (const field of Object.keys(record))
				if (!['effect', 'scale'].includes(field) && !Object.hasOwn(refs, field))
					errors.push(`${id}: unknown ${record.effect} field ${field}`)
			if (record.scale !== undefined && record.scale !== null)
				errors.push(`${id}: unsupported area effect scaling`)
			if (record.scale === null && record.effect !== 'damage')
				errors.push(`${id}: only area damage supports scaling`)
		}
	}
}
function checkHooks(id, manifest, on, events = AURA_EVENTS) {
	try {
		validateHookMap(id, on, events)
	} catch (error) {
		errors.push(error.message)
	}
	for (const [event, hook] of Object.entries(on ?? {})) {
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
	if (manifest.summon) checkUnit(id, manifest.summon)
	checkHooks(id, manifest, manifest.on)
	checkHooks(id, manifest, manifest.stages, ABILITY_STAGES)
	for (const status of Object.values(manifest.statuses ?? {}))
		checkHooks(id, manifest, status.on, [...AURA_EVENTS, 'apply', 'remove', 'expire'])
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
		for (const [field, unit] of Object.entries(refs)) checkRef(id, field, record[field], unit)
		for (const field of Object.keys(record))
			if (field !== 'effect' && field !== 'scale' && !Object.hasOwn(refs, field))
				errors.push(`${id}: unknown ${record.effect} field ${field}`)
		if (record.scale !== undefined && record.scale !== null)
			errors.push(`${id}: status effects do not support scaling`)
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
checkUnit('boss', WARDEN_UNIT)
for (const [id, definition] of Object.entries(MINION_DEFINITIONS))
	checkUnit(`minions.${id}`, definition.unit)
for (const [id, definition] of Object.entries(STRUCTURE_DEFINITIONS)) checkUnit(id, definition.unit)
for (const id of Object.keys(HEROES)) {
	checkUnit(id, HEROES[id].unit, (ref) =>
		Object.hasOwn(tune.heroes[id] ?? {}, ref) ? `heroes.${id}` : 'hero',
	)
	for (const field of ['hp', 'radius', 'speed'])
		if (HEROES[id].unit[field] === undefined) errors.push(`${id}: missing unit ${field}`)
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
