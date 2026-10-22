import { abilityOf } from './ability.js'
import { STEP } from '../../core/app.js'
import { ticks } from './sim-kit.js'
import { inOwnBase } from './base.js'

const stateGates = {
	stunned: ['move', 'cast', 'shield', 'catch', 'ballPickup'],
	frozen: ['move', 'cast', 'shield', 'catch', 'ballPickup', 'still'],
	prone: ['move', 'cast', 'shield'],
}

const coreStatuses = {
	'core.stun': {
		label: 'Stun',
		tags: ['debuff', 'stun'],
		states: ['stunned'],
		stack: 'independent',
	},
	'core.motion': {
		label: 'Motion',
		tags: ['debuff', 'motion'],
		stack: 'replace',
		on: {
			expire({ unit, plan }) {
				if (!unit.dead && unit.order?.goal) unit.order.path = plan(unit, unit.order.goal)
			},
		},
	},
}

const definitions = new Map()

// Status identity resolves globally, never through the victim's kit; guests have no source.
export function statusDefinition(status) {
	let definition = definitions.get(status.key)
	if (definition === undefined) {
		const [ability, key] = status.key.split('.')
		const declaration = Object.hasOwn(coreStatuses, status.key)
			? coreStatuses[status.key]
			: abilityOf(ability)?.statuses?.[key]
		definition = declaration
			? {
					...declaration,
					blockedVerbs: new Set(
						(declaration.states ?? []).flatMap((state) => stateGates[state] ?? []),
					),
				}
			: null
		definitions.set(status.key, definition)
	}
	return definition
}

// Guests only display statuses; simulation ids, sources and hook clocks stay on the host.
export function packStatuses(statuses) {
	if (!statuses?.length) return null
	return statuses.map(({ key, until, amount, mag, data }) => [
		key,
		until,
		amount ?? null,
		...(mag !== undefined || data !== undefined
			? [
					{
						...(mag !== undefined && { mag }),
						...(data !== undefined && { data: structuredClone(data) }),
					},
				]
			: []),
	])
}

export function unpackStatuses(statuses) {
	return (statuses ?? []).map((status) => {
		if (!Array.isArray(status)) return status
		const [key, until, amount, display] = status
		return { key, until, ...(amount !== null && { amount }), ...display }
	})
}

export function statusBar(unit, bar) {
	const entries = (unit?.statuses ?? []).filter((status) => statusDefinition(status)?.bar === bar)
	return {
		amount: entries.reduce((sum, status) => sum + (status.amount ?? 0), 0),
		label: entries.length ? statusDefinition(entries[0]).label : '',
	}
}

const active = (status, tick) => status.until === null || status.until > tick
const resolve = (value, context) =>
	typeof value === 'function'
		? value(context)
		: typeof value === 'string'
			? context.stats?.[value]
			: value

// The declarations name states; only this table gives them meaning.
export function blocked(unit, verb, tick) {
	if (tick === undefined) throw new Error('MOBA blocked needs the current tick')
	for (const status of unit?.statuses ?? [])
		if (active(status, tick) && statusDefinition(status)?.blockedVerbs.has(verb)) return true
	return false
}

// Expiry prunes host records; guests compare this deadline against their presentation tick.
export function stateUntil(unit, state) {
	let until = 0
	for (const status of unit?.statuses ?? [])
		if (statusDefinition(status)?.states?.includes(state))
			until = Math.max(until, status.until ?? Infinity)
	return until
}

// Slows keep their own clocks; only the strongest active slow affects movement.
export function moveSpeed(unit, tick) {
	if (tick === undefined) throw new Error('MOBA moveSpeed needs the current tick')
	let factor = 1
	let slow = 1
	for (const status of unit.statuses ?? []) {
		if (!active(status, tick)) continue
		const definition = statusDefinition(status)
		if (definition?.moveSpeed === undefined) continue
		const magnitude = Number.isFinite(status.mag) ? Math.max(0, status.mag) : 1
		if (definition.tags?.includes('slow')) slow = Math.min(slow, magnitude)
		else factor = magnitude
	}
	return factor * slow
}

export function createStatuses(ctx) {
	let nextId = 0
	const { present } = ctx
	function presentStatus(unit, status, state, extra = {}) {
		present({
			type: 'status',
			state,
			target: unit.id,
			source: status.src,
			key: status.key,
			label: status.label,
			status: status.id,
			amount: status.amount ?? 0,
			until: status.until,
			...extra,
		})
	}
	const context = (unit, status, extra = {}) => {
		const [id] = status.key.split('.')
		const ability = abilityOf(id)
		return {
			unit,
			hero: unit,
			status,
			ability,
			stats: ability?.stats,
			sim: ctx.api,
			plan: ctx.plan,
			tick: ctx.t,
			ticks,
			present,
			remove,
			...extra,
		}
	}
	function remove(unit, id, reason = 'removed') {
		const status = unit.statuses?.find((entry) => entry.id === id)
		if (!status || status.removed) return false
		status.removed = true
		unit.statuses.splice(unit.statuses.indexOf(status), 1)
		const definition = statusDefinition(status)
		presentStatus(unit, status, 'off', {
			reason,
			wasted: definition?.on?.absorb ? Math.max(0, status.amount ?? 0) : 0,
		})
		const hook = reason === 'expired' ? definition?.on?.expire : definition?.on?.remove
		hook?.(context(unit, status, { reason }))
		return true
	}
	function clearStatuses(unit, reason) {
		for (const status of (unit.statuses ?? []).slice()) remove(unit, status.id, reason)
	}
	function cleanse(unit, tag) {
		for (const status of (unit.statuses ?? []).slice()) {
			const definition = statusDefinition(status)
			if (!definition?.pure && definition?.tags?.includes(tag)) remove(unit, status.id, 'cleansed')
		}
	}
	function apply(unit, key, options = {}) {
		unit.statuses ??= []
		const seed = { key }
		const definition = statusDefinition(seed)
		if (!definition?.label) throw new Error(`MOBA status needs a declaration and label: ${key}`)
		const source = options.source?.id ?? options.source ?? null
		const info = context(unit, seed, { source })
		// Your own base keeps enemy effects off you, as combat.js `hit` keeps their hits.
		if (
			source != null &&
			ctx.lane &&
			ctx.heroes.includes(unit) &&
			inOwnBase(ctx.layout, unit) &&
			ctx.find(source)?.team !== unit.team
		)
			return null
		if (definition.enabled && !resolve(definition.enabled, info)) return null
		const duration = options.duration ?? resolve(definition.duration, info)
		const until = duration == null ? null : ctx.t + ticks(duration)
		const mag = options.mag ?? resolve(definition.moveSpeed, info)
		const amount = options.amount !== undefined ? options.amount : resolve(definition.amount, info)
		const stack = definition.stack ?? (definition.maxStacks > 1 ? 'stacks' : 'refresh')
		const same = unit.statuses.filter(
			(status) => status.key === key && status.src === source && active(status, ctx.t),
		)
		if (stack === 'refresh' && same.length) {
			const status = same[0]
			const wasted =
				definition.on?.absorb && amount !== undefined ? Math.max(0, status.amount ?? 0) : 0
			status.until = until
			if (amount !== undefined) status.amount = amount
			if (mag !== undefined) status.mag = mag
			presentStatus(unit, status, 'refresh', { wasted })
			return status
		}
		if (stack === 'replace') {
			for (const status of unit.statuses.slice())
				if (
					same.includes(status) ||
					(definition.replaceTag && statusDefinition(status)?.tags?.includes(definition.replaceTag))
				)
					remove(unit, status.id, 'replaced')
		}
		if (stack === 'stacks') {
			const max = Math.max(1, definition.maxStacks ?? 1)
			for (const status of same.slice(0, Math.max(0, same.length + 1 - max)))
				remove(unit, status.id, 'replaced')
		}
		const status = {
			id: ++nextId,
			key,
			label: definition.label,
			src: source,
			from: ctx.t,
			until,
			...(amount !== undefined && { amount }),
			...(mag !== undefined && { mag }),
			...(definition.data && { data: definition.data(info) }),
			...(definition.interval !== undefined && {
				next: ctx.t + ticks(resolve(definition.interval, info) ?? STEP),
			}),
		}
		unit.statuses.push(status)
		presentStatus(unit, status, 'on')
		definition.on?.apply?.(context(unit, status))
		return status
	}
	function expireStatuses(unit) {
		for (const status of (unit.statuses ?? []).slice()) {
			if (status.removed) continue
			if (!active(status, ctx.t)) remove(unit, status.id, 'expired')
			else if (statusDefinition(status)?.on?.absorb && status.amount <= 0)
				remove(unit, status.id, 'spent')
		}
	}
	// No subscriptions in module globals or in replicated state. Freeze the listener list:
	// additions wait for the next dispatch; removals take effect before the next callback.
	function reactAuras(name, units, event, { statuses = true, abilities = true } = {}) {
		const listeners = []
		for (const unit of new Set(units.filter(Boolean))) {
			if (statuses)
				for (const status of unit.statuses ?? []) {
					const definition = statusDefinition(status)
					const hook = definition?.on?.[name]
					if (hook) listeners.push({ unit, status, definition, hook, order: status.id })
				}
			if (abilities)
				for (const ability of Object.values(unit.definition?.abilities ?? {})) {
					const hook = ability?.on?.[name]
					if (hook) listeners.push({ unit, ability, hook, order: 0 })
				}
		}
		listeners.sort(
			(a, b) =>
				a.order - b.order ||
				(String(a.unit.id) < String(b.unit.id)
					? -1
					: String(a.unit.id) > String(b.unit.id)
						? 1
						: 0),
		)
		for (const { unit, status, definition, ability, hook } of listeners) {
			if (status?.removed) continue
			if (unit.dead && name !== 'tick' && !(name === 'death' && unit === event.target)) continue
			if (ability && !Object.values(unit.definition?.abilities ?? {}).includes(ability)) continue
			// Absorb hooks also dispose expired shield records, preserving their off facts.
			if (status && !active(status, ctx.t) && !(name === 'absorb' && definition.on?.absorb))
				continue
			const info = status
				? context(unit, status)
				: { ...ctx.traitContext(unit), unit, ability, stats: ability.stats }
			if (name === 'tick' && status && definition.interval !== undefined) {
				if (ctx.t < status.next) continue
				status.next += ticks(resolve(definition.interval, info) ?? STEP)
			}
			hook({ ...info, event })
		}
		return event
	}
	function auraUnits() {
		return [
			...ctx.heroes,
			...ctx.dummies,
			...(ctx.lane?.minions ?? []),
			...(ctx.lane?.structures ?? []),
			...ctx.summons,
		].filter((unit) => !unit.dead)
	}
	function stepStatuses(unit) {
		if (!unit.dead) reactAuras('tick', [unit], { dt: STEP }, { abilities: false })
	}
	return {
		apply,
		remove,
		clearStatuses,
		cleanse,
		expireStatuses,
		stepStatuses,
		reactAuras,
		auraUnits,
	}
}
