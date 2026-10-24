// Effect records declare local tune references; reject missing numbers and wrong dimensions.
// Boot hero/ability registries in their normal order (ability hooks can import hero helpers).
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { HEROES, WARDEN_UNIT } from '../src/modes/moba/heroes.js'
import { MINION_DEFINITIONS } from '../src/modes/moba/lane-waves.js'
import { STRUCTURE_DEFINITIONS } from '../src/modes/moba/lane-structures.js'
import { UNIT_REFS, UNIT_ATTACK_REFS } from '../src/modes/moba/unit-definition.js'
import { heroTrait, renderCardTemplate } from '../src/modes/moba/tooltip.js'
import { glossary, glossaryTerms } from '../src/modes/moba/glossary.js'
import {
	ABILITIES,
	defineAbility,
	STATUS_EFFECT_REFS,
	AREA_EFFECT_REFS,
	TARGET_EFFECT_REFS,
	ACTION_EFFECT_REFS,
	effectRecord,
	validateHookMap,
	AURA_EVENTS,
	ABILITY_STAGES,
} from '../src/modes/moba/ability.js'
import manifests from '../src/modes/moba/abilities/all-abilities.js'
import { tune } from '../src/modes/moba/tune.js'
import { resolveUnit, tuneUnits } from '../src/modes/moba/units.js'

// Optional scratch module: default { id, manifest, tune, units }. Never registers a mod.
const declarations = { ...manifests }
if (process.argv[2]) {
	const scratch = (await import(pathToFileURL(resolve(process.argv[2])).href)).default
	const { id, manifest, tune: stats, units } = scratch
	if (!id || Object.hasOwn(tune, id)) throw new Error('Scratch ability needs an unused id')
	tune[id] = stats
	for (const [key, unit] of Object.entries(units ?? {})) tuneUnits[`${id}.${key}`] = unit
	ABILITIES[id] = defineAbility(id, manifest)
	declarations[id] = manifest
}

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
		if (action?.effect) {
			checkActionEffect(id, manifest, action)
			continue
		}
		if (action?.deliver === 'shot') {
			for (const field of Object.keys(action))
				if (!['deliver', 'targets', 'hit', 'allies', 'enemies'].includes(field))
					errors.push(`${id}: unknown shot field ${field}`)
			if (!['enemies', 'heroes'].includes(action.targets))
				errors.push(`${id}: unknown shot targets ${action.targets}`)
			for (const [field, unit] of Object.entries({ speed: 'm/s', radius: 'm', range: 'm' }))
				checkRef(id, `shot ${field}`, field, unit)
			if (action.hit && (action.allies || action.enemies))
				errors.push(`${id}: shot cannot mix hit and side payloads`)
			if (action.targets !== 'heroes' && action.allies)
				errors.push(`${id}: shot allies require hero targets`)
			if (!action.hit && !action.allies && !action.enemies)
				errors.push(`${id}: shot needs a payload`)
			for (const key of ['hit', 'allies', 'enemies']) {
				if (action[key] === undefined) continue
				if (!Array.isArray(action[key]) || !action[key].length) {
					errors.push(`${id}: shot ${key} must be a nonempty effect array`)
					continue
				}
				const seen = new Set()
				for (const input of action[key]) {
					const record = effectRecord(manifest, input)
					if (
						!(
							key === 'allies'
								? ['heal']
								: ['damage', ...Object.keys(STATUS_EFFECT_REFS), 'displace']
						).includes(record?.effect)
					) {
						errors.push(`${id}: unsupported shot ${key} effect ${record?.effect}`)
						continue
					}
					if (seen.has(record.effect))
						errors.push(`${id}: duplicate shot ${key} effect ${record.effect}`)
					seen.add(record.effect)
					checkActionEffect(id, manifest, record)
				}
			}
			continue
		}
		if (!action || !['area', 'target', 'ground'].includes(action.deliver)) {
			errors.push(`${id}: unknown delivery ${action?.deliver}`)
			continue
		}
		if (action.deliver === 'ground') {
			checkGround(id, manifest, action)
			continue
		}
		const targeted = action.deliver === 'target'
		const fields = targeted
			? ['deliver', 'pick', 'targets', 'range', 'hit', 'chain', 'before', 'after']
			: ['deliver', 'from', 'shape', 'radius', 'targets', 'blockedBy', 'where', 'hit']
		for (const field of Object.keys(action))
			if (!fields.includes(field)) errors.push(`${id}: unknown ${action.deliver} field ${field}`)
		if (targeted) {
			if (action.pick !== 'nearestAim') errors.push(`${id}: unknown target pick ${action.pick}`)
			if (!['ally', 'enemy'].includes(action.targets))
				errors.push(`${id}: unknown target team ${action.targets}`)
			if (action.chain !== undefined) {
				if (action.targets !== 'enemy') errors.push(`${id}: only enemy targets chain`)
				for (const field of Object.keys(action.chain ?? {}))
					if (!['range', 'repeat', 'falloff'].includes(field))
						errors.push(`${id}: unknown chain field ${field}`)
				checkRef(id, 'chain range', action.chain?.range, 'm')
				checkRef(id, 'chain repeat', action.chain?.repeat, 'count')
				checkRef(id, 'chain falloff', action.chain?.falloff, 'fraction')
			}
			checkRef(id, 'target range', action.range, 'm')
			for (const hook of ['before', 'after'])
				if (action[hook] !== undefined && typeof action[hook] !== 'function')
					errors.push(`${id}: target ${hook} must be a function`)
		} else {
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
			checkRef(
				id,
				'area reach',
				action.radius ?? (action.shape === 'cone' ? 'range' : 'radius'),
				'm',
			)
			if (action.shape === 'cone') checkRef(id, 'area angle', 'angle', 'deg')
		}
		if (!Array.isArray(action.hit) || !action.hit.length) {
			errors.push(`${id}: ${action.deliver} hit must be a nonempty effect array`)
			continue
		}
		const seen = new Set()
		for (const input of action.hit) {
			const record = effectRecord(manifest, input)
			const refs =
				AREA_EFFECT_REFS[record?.effect] ??
				STATUS_EFFECT_REFS[record?.effect] ??
				TARGET_EFFECT_REFS[record?.effect]
			const allowed = !targeted
				? ['damage', 'slow', 'freeze', 'knockback']
				: action.targets === 'enemy'
					? ['damage']
					: ['heal', 'shield', 'cleanse']
			if (!record || !allowed.includes(record.effect) || !refs) {
				errors.push(
					`${id}: unknown ${action.deliver} effect ${typeof input === 'string' ? input : input?.effect}`,
				)
				continue
			}
			if (seen.has(record.effect))
				errors.push(`${id}: duplicate ${action.deliver} effect ${record.effect}`)
			seen.add(record.effect)
			if (
				['slow', 'freeze', 'shield'].includes(record.effect) &&
				!manifest.statusEffects?.some((effect) => effect.effect === record.effect)
			)
				errors.push(`${id}: area ${record.effect} needs a matching status effect`)
			for (const [field, unit] of Object.entries(refs)) {
				if (['critChance', 'critMultiplier'].includes(field) && record[field] === undefined)
					continue
				checkRef(id, field, record[field], unit)
			}
			if (
				record.effect === 'heal' &&
				(record.critChance === undefined) !== (record.critMultiplier === undefined)
			)
				errors.push(`${id}: heal crit chance and multiplier must be declared together`)
			if (
				record.effect === 'cleanse' &&
				(!Array.isArray(record.tags) ||
					!record.tags.length ||
					record.tags.some((tag) => typeof tag !== 'string' || !tag))
			)
				errors.push(`${id}: cleanse needs nonempty status tags`)
			for (const field of Object.keys(record))
				if (
					!['effect', 'scale', ...(record.effect === 'cleanse' ? ['tags'] : [])].includes(field) &&
					!Object.hasOwn(refs, field)
				)
					errors.push(`${id}: unknown ${record.effect} field ${field}`)
			if (record.scale !== undefined && record.scale !== null)
				errors.push(`${id}: unsupported area effect scaling`)
			if (record.scale === null && !['damage', 'heal'].includes(record.effect))
				errors.push(`${id}: only damage and heal support scaling`)
		}
	}
}
function checkActionEffect(id, manifest, record) {
	const refs =
		ACTION_EFFECT_REFS[record.effect] ??
		AREA_EFFECT_REFS[record.effect] ??
		TARGET_EFFECT_REFS[record.effect] ??
		STATUS_EFFECT_REFS[record.effect]
	if (
		!refs ||
		!['damage', 'heal', ...Object.keys(STATUS_EFFECT_REFS), 'displace', 'status', 'catch'].includes(
			record.effect,
		)
	) {
		errors.push(`${id}: unknown action effect ${record.effect}`)
		return
	}
	const fields = {
		damage: ['scale', 'periodic'],
		heal: ['scale', 'periodic'],
		shield: [],
		displace: ['to'],
		status: ['key'],
		catch: ['acceptBall'],
		slow: [],
		haste: [],
		freeze: [],
	}[record.effect]
	for (const field of Object.keys(record))
		if (!['effect', ...Object.keys(refs), ...fields].includes(field))
			errors.push(`${id}: unknown ${record.effect} field ${field}`)
	for (const [field, unit] of Object.entries(refs)) {
		if (
			record[field] === undefined &&
			['critChance', 'critMultiplier', 'linger', 'resetCooldown'].includes(field)
		)
			continue
		checkRef(id, field, record[field], unit)
	}
	if (record.scale !== undefined && record.scale !== null)
		errors.push(`${id}: unsupported action effect scaling`)
	for (const field of ['periodic', 'acceptBall'])
		if (record[field] !== undefined && typeof record[field] !== 'boolean')
			errors.push(`${id}: ${field} must be a boolean`)
	if (record.effect === 'displace' && record.to !== 'source')
		errors.push(`${id}: unknown displacement target ${record.to}`)
	if (record.effect === 'status' && !Object.hasOwn(manifest.statuses ?? {}, record.key))
		errors.push(`${id}: unknown local status ${record.key}`)
	if (
		['slow', 'haste', 'freeze'].includes(record.effect) &&
		!manifest.statusEffects?.some((effect) => effect.effect === record.effect)
	)
		errors.push(`${id}: shot ${record.effect} needs a matching status effect`)
	if (
		record.effect === 'shield' &&
		!manifest.statuses?.shield &&
		!manifest.statusEffects?.some((effect) => effect.effect === 'shield')
	)
		errors.push(`${id}: shield needs a matching status definition`)
	if (
		record.effect === 'heal' &&
		(record.critChance === undefined) !== (record.critMultiplier === undefined)
	)
		errors.push(`${id}: heal crit chance and multiplier must be declared together`)
}
function checkGround(id, manifest, action) {
	const fields = ['deliver', 'at', 'radius', 'lifetime', 'every', 'allies', 'enemies']
	for (const field of Object.keys(action))
		if (!fields.includes(field)) errors.push(`${id}: unknown ground field ${field}`)
	if (action.at !== undefined && !['aim', 'at'].includes(action.at))
		errors.push(`${id}: unknown ground origin ${action.at}`)
	for (const [field, unit] of Object.entries({ radius: 'm', lifetime: 's', every: 's' })) {
		checkRef(id, `ground ${field}`, action[field], unit)
		if (tune[id]?.[action[field]] < 0 || (field !== 'radius' && tune[id]?.[action[field]] === 0))
			errors.push(
				`${id}: ground ${field} must be ${field === 'radius' ? 'nonnegative' : 'positive'}`,
			)
	}
	if (action.allies === undefined && action.enemies === undefined)
		errors.push(`${id}: ground needs allies or enemies`)
	for (const side of ['allies', 'enemies']) {
		if (action[side] === undefined) continue
		if (!Array.isArray(action[side]) || !action[side].length) {
			errors.push(`${id}: ground ${side} must be a nonempty effect array`)
			continue
		}
		const seen = new Set()
		for (const input of action[side]) {
			const record = effectRecord(manifest, input)
			const refs =
				STATUS_EFFECT_REFS[record?.effect] ??
				AREA_EFFECT_REFS[record?.effect] ??
				TARGET_EFFECT_REFS[record?.effect] ??
				(record?.effect === 'status' ? ACTION_EFFECT_REFS.status : undefined)
			if (record?.effect === 'status' && !Object.hasOwn(manifest.statuses ?? {}, record.key))
				errors.push(`${id}: unknown local ground status ${record.key}`)
			if (!refs) {
				errors.push(`${id}: unknown ground effect ${record?.effect}`)
				continue
			}
			if (seen.has(record.effect))
				errors.push(`${id}: duplicate ground ${side} effect ${record.effect}`)
			seen.add(record.effect)
			const status = Object.hasOwn(STATUS_EFFECT_REFS, record.effect)
			if (record.while !== undefined && (record.while !== 'inside' || !status))
				errors.push(`${id}: ground while requires an inside status effect`)
			if (record.while === 'inside') {
				checkRef(id, 'ground linger', record.linger, 's')
				if (tune[id]?.[record.linger] < 0) errors.push(`${id}: ground linger must be nonnegative`)
			} else if (record.linger !== undefined)
				errors.push(`${id}: ground linger requires while: inside`)
			if (
				record.stack !== undefined &&
				(!status || !['independent', 'refresh', 'replace'].includes(record.stack))
			)
				errors.push(`${id}: unknown ground stack ${record.stack}`)
			for (const [field, unit] of Object.entries(refs)) {
				if (
					(field === 'duration' && record.while === 'inside') ||
					(['critChance', 'critMultiplier'].includes(field) && record[field] === undefined)
				)
					continue
				checkRef(id, `ground ${field}`, record[field], unit)
			}
			if (
				record.effect === 'heal' &&
				(record.critChance === undefined) !== (record.critMultiplier === undefined)
			)
				errors.push(`${id}: heal crit chance and multiplier must be declared together`)
			if (
				record.effect === 'cleanse' &&
				(!Array.isArray(record.tags) ||
					!record.tags.length ||
					record.tags.some((tag) => typeof tag !== 'string' || !tag))
			)
				errors.push(`${id}: cleanse needs nonempty status tags`)
			for (const field of Object.keys(record))
				if (
					![
						'effect',
						'scale',
						'periodic',
						...(status ? ['while', 'linger', 'stack'] : []),
						...(record.effect === 'cleanse' ? ['tags'] : []),
						...(record.effect === 'status' ? ['key'] : []),
						...Object.keys(refs),
					].includes(field)
				)
					errors.push(`${id}: unknown ground ${record.effect} field ${field}`)
			if (
				record.periodic !== undefined &&
				(!['damage', 'heal'].includes(record.effect) || typeof record.periodic !== 'boolean')
			)
				errors.push(`${id}: periodic requires a damage or heal boolean`)
			if (
				record.scale !== undefined &&
				(record.scale !== null || !['damage', 'heal'].includes(record.effect))
			)
				errors.push(`${id}: unsupported ground effect scaling`)
		}
	}
}
function checkHooks(id, manifest, on, events = AURA_EVENTS) {
	try {
		validateHookMap(id, on, events)
	} catch (error) {
		errors.push(error.message)
	}
	if (on?.every !== undefined) {
		if (on.every !== 'step') {
			checkRef(id, 'every', on.every, 's')
			if (!(tune[id]?.[on.every] > 0)) errors.push(`${id}: every must be positive`)
		}
		checkActions(id, manifest, on.do)
	}
	for (const [event, hook] of Object.entries(on ?? {})) {
		if (on.every !== undefined && ['every', 'do'].includes(event)) continue
		if (typeof hook === 'function') continue
		if (Array.isArray(hook)) checkActions(id, manifest, hook)
		else if (hook && typeof hook === 'object') {
			for (const [stage, value] of Object.entries(hook)) {
				if (stage === 'do' || (stage === 'before' && Array.isArray(value)))
					checkActions(id, manifest, value)
				else if (!['before', 'replace', 'after'].includes(stage) || typeof value !== 'function')
					errors.push(`${id}: invalid hook stage ${stage}`)
			}
		} else errors.push(`${id}: invalid hook for ${event}`)
	}
}
for (const [id, manifest] of Object.entries(declarations)) {
	if (manifest.summon) checkUnit(id, manifest.summon)
	checkHooks(id, manifest, manifest.on)
	checkHooks(id, manifest, manifest.stages, ABILITY_STAGES)
	for (const status of Object.values(manifest.statuses ?? {}))
		checkHooks(id, manifest, status.on, [...AURA_EVENTS, 'apply', 'remove', 'expire'])
	if (manifest.card) {
		const { sentence = '', facts = [], ...rest } = manifest.card
		try {
			if (Object.keys(rest).length)
				throw new Error(`card keys are sentence and facts, not ${Object.keys(rest).join(', ')}`)
			if (!Array.isArray(facts) || facts.some((fact) => !Array.isArray(fact) || fact.length !== 2))
				throw new Error('card facts must be [label, template] pairs')
			for (const template of [sentence, ...facts.map(([, value]) => value)]) {
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
for (const term of glossaryTerms())
	try {
		glossary(term)
		count++
	} catch (error) {
		errors.push(`glossary ${term}: ${error.message}`)
	}
if (errors.length) {
	console.error(`MOBA effect schema: ${errors.length} invalid declarations:\n${errors.join('\n')}`)
	process.exitCode = 1
} else console.log(`MOBA effect schema: ${count} tune references and card templates checked.`)
