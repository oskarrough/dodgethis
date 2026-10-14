import { abilityOf } from './ability.js'
import { STEP } from '../../core/app.js'
import { ticks } from './sim-kit.js'

const definitions = new Map()

// Custom hero declarations may override the same key; cache once per declaration owner.
export function statusDefinition(status, unit = null) {
	let entry = definitions.get(status.key)
	if (!entry) {
		const [ability, key] = status.key.split('.')
		entry = { ability, key, owners: new Map() }
		definitions.set(status.key, entry)
	}
	const owner = unit?.definition ?? null
	if (!entry.owners.has(owner))
		entry.owners.set(owner, abilityOf(entry.ability, unit)?.statuses?.[entry.key] ?? null)
	return entry.owners.get(owner)
}

// Guests only display statuses; simulation ids, sources and hook clocks stay on the host.
export function packStatuses(statuses) {
	if (!statuses?.length) return null
	return statuses.map(({ key, until, amount, mag, data }) => [
		key,
		until,
		amount ?? null,
		...(mag !== undefined || data !== undefined
			? [{ ...(mag !== undefined && { mag }), ...(data !== undefined && { data }) }]
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
	const entries = (unit?.statuses ?? []).filter(
		(status) => statusDefinition(status, unit)?.bar === bar,
	)
	return {
		amount: entries.reduce((sum, status) => sum + (status.amount ?? 0), 0),
		label: entries.length ? statusDefinition(entries[0], unit).label : '',
	}
}

const active = (status, tick) => status.until === null || status.until > tick
const resolve = (value, context) => (typeof value === 'function' ? value(context) : value)

// Slows keep their own clocks; only the strongest active slow affects movement.
export function moveSpeed(unit, tick) {
	if (tick === undefined) throw new Error('MOBA moveSpeed needs the current tick')
	let factor = 1
	let slow = 1
	for (const status of unit.statuses ?? []) {
		if (!active(status, tick)) continue
		const definition = statusDefinition(status, unit)
		if (definition?.moveSpeed === undefined) continue
		const magnitude = Number.isFinite(status.mag) ? Math.max(0, status.mag) : 1
		if (definition.tags?.includes('slow')) slow = Math.min(slow, magnitude)
		else factor = magnitude
	}
	return factor * slow
}

export function createStatuses(ctx) {
	let nextId = 0
	const context = (unit, status, extra = {}) => {
		const [id] = status.key.split('.')
		const ability = abilityOf(id, unit)
		return {
			unit,
			hero: unit,
			status,
			ability,
			stats: ability?.stats,
			sim: ctx.api,
			tick: ctx.t,
			ticks,
			...extra,
		}
	}
	function remove(unit, id, reason = 'removed') {
		const status = unit.statuses?.find((entry) => entry.id === id)
		if (!status || status.removed) return false
		status.removed = true
		unit.statuses.splice(unit.statuses.indexOf(status), 1)
		const definition = statusDefinition(status, unit)
		const hook = reason === 'expired' ? definition?.onExpire : definition?.onRemove
		hook?.(context(unit, status, { reason }))
		return true
	}
	function clearStatuses(unit, reason) {
		for (const status of (unit.statuses ?? []).slice()) remove(unit, status.id, reason)
	}
	function cleanse(unit, tag) {
		for (const status of (unit.statuses ?? []).slice()) {
			const definition = statusDefinition(status, unit)
			if (!definition?.pure && definition?.tags?.includes(tag)) remove(unit, status.id, 'cleansed')
		}
	}
	function apply(unit, key, options = {}) {
		unit.statuses ??= []
		const seed = { key }
		const definition = statusDefinition(seed, unit)
		if (!definition?.label) throw new Error(`MOBA status needs a declaration and label: ${key}`)
		const source = options.source?.id ?? options.source ?? null
		const info = context(unit, seed, { source })
		if (definition.enabled && !resolve(definition.enabled, info)) return null
		const duration = options.duration ?? resolve(definition.duration, info)
		const until = duration == null ? null : ctx.t + ticks(duration)
		const mag = options.mag ?? resolve(definition.moveSpeed, info)
		const stack = definition.stack ?? (definition.maxStacks > 1 ? 'stacks' : 'refresh')
		const same = unit.statuses.filter(
			(status) => status.key === key && status.src === source && active(status, ctx.t),
		)
		if (stack === 'refresh' && same.length) {
			const status = same[0]
			status.until = until
			if (options.amount !== undefined) status.amount = options.amount
			if (mag !== undefined) status.mag = mag
			return status
		}
		if (stack === 'replace') {
			for (const status of unit.statuses.slice())
				if (
					same.includes(status) ||
					(definition.replaceTag &&
						statusDefinition(status, unit)?.tags?.includes(definition.replaceTag))
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
			...(options.amount !== undefined && { amount: options.amount }),
			...(mag !== undefined && { mag }),
			...(definition.data && { data: definition.data(info) }),
			...(definition.periodic && {
				next: ctx.t + ticks(resolve(definition.periodic.interval, info) ?? STEP),
			}),
		}
		unit.statuses.push(status)
		definition.onApply?.(context(unit, status))
		return status
	}
	function expireStatuses(unit) {
		for (const status of (unit.statuses ?? []).slice()) {
			if (status.removed) continue
			if (!active(status, ctx.t)) remove(unit, status.id, 'expired')
			else if (statusDefinition(status, unit)?.absorb && status.amount <= 0)
				remove(unit, status.id, 'spent')
		}
	}
	function stepStatuses(unit) {
		if (unit.dead) return
		for (const status of (unit.statuses ?? []).slice()) {
			if (status.removed || !active(status, ctx.t)) continue
			const periodic = statusDefinition(status, unit)?.periodic
			if (!periodic || ctx.t < status.next) continue
			// Absolute ticks, never array length or the number of statuses that happened to survive.
			const info = context(unit, status)
			status.next += ticks(resolve(periodic.interval, info) ?? STEP)
			periodic.onTick?.(info)
		}
	}
	function onDamageTaken(unit, damage, shot) {
		let remaining = damage
		for (const status of (unit.statuses ?? []).slice()) {
			if (status.removed || !active(status, ctx.t)) continue
			const hook = statusDefinition(status, unit)?.onDamageTaken
			if (hook) remaining = hook(context(unit, status, { damage: remaining, shot })) ?? remaining
		}
		return remaining
	}
	function absorb(unit, damage) {
		let remaining = damage
		for (const status of (unit.statuses ?? []).slice()) {
			if (status.removed || !statusDefinition(status, unit)?.absorb) continue
			if (!active(status, ctx.t) || status.amount <= 0) {
				remove(unit, status.id, active(status, ctx.t) ? 'spent' : 'expired')
				continue
			}
			const absorbed = Math.min(status.amount, remaining)
			status.amount -= absorbed
			remaining -= absorbed
		}
		return remaining
	}
	return {
		apply,
		remove,
		clearStatuses,
		cleanse,
		expireStatuses,
		stepStatuses,
		onDamageTaken,
		absorb,
	}
}
