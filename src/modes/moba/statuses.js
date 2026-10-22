import { abilityOf, effectRecord, runHookStages, validateHookMap, AURA_EVENTS } from './ability.js'
import { segmentClear } from './obstacles.js'
import { STEP } from '../../core/app.js'
import { ticks } from './sim-kit.js'
import { inOwnBase } from './base.js'
import { createAbilityEffects, resolveEffects } from './ability-effects.js'

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
	let haste = 1
	for (const status of unit.statuses ?? []) {
		if (!active(status, tick)) continue
		const definition = statusDefinition(status)
		if (definition?.moveSpeed === undefined) continue
		const magnitude = Number.isFinite(status.mag) ? Math.max(0, status.mag) : 1
		if (definition.tags?.includes('slow')) slow = Math.min(slow, magnitude)
		else if (definition.tags?.includes('haste')) haste = Math.max(haste, magnitude)
		else factor = magnitude
	}
	return factor * haste * slow
}

export function createStatuses(ctx) {
	for (const [key, definition] of Object.entries(coreStatuses))
		validateHookMap(key, definition.on, [...AURA_EVENTS, 'apply', 'remove', 'expire'], {
			actions: false,
		})
	const { applyEffects, freezeImpact } = createAbilityEffects(ctx)
	let nextId = 0
	const { present } = ctx
	const abilityEvents = new WeakMap()
	const everyTicks = new WeakMap()
	const dashEvents = new WeakMap()
	function rememberDashEvent(hero, event) {
		dashEvents.set(hero, { body: hero.body, event })
	}
	function takeDashEvent(hero) {
		const dash = dashEvents.get(hero)
		dashEvents.delete(hero)
		return dash?.body === hero.body && dash.event.ability.id === hero.dashAbility
			? dash.event
			: null
	}
	const legacyEvents = { release: 'onRelease', land: 'onLand', dashEnd: 'onDashEnd', end: 'onEnd' }
	function rememberAbilityEvent(state, event) {
		abilityEvents.set(state, event)
	}
	function reactAbility(name, info, state = null, fallback) {
		const { ability } = info
		if (!ability) return
		const saved = state && abilityEvents.get(state)
		const hero = info.hero ?? saved?.source
		const event = {
			...(saved ?? {
				source: hero,
				ability,
				slot: info.slot ?? null,
				point: { ...(info.point ?? info.target ?? hero.body.position) },
				dir: info.dir ?? { x: Math.sin(hero.yaw), z: Math.cos(hero.yaw) },
				target: ctx.find(info.targetId) ?? null,
			}),
			...info.event,
			...(info.carrier && { carrier: info.carrier }),
			...(info.point && { point: { ...info.point } }),
		}
		if (name === 'every') {
			if (!ability.on?.every || ctx.t < (everyTicks.get(state) ?? ctx.t)) return event
			const interval = ability.on.every === 'step' ? 1 : ticks(ability.stats[ability.on.every])
			everyTicks.set(state, ctx.t + Math.max(1, interval))
			runActions(ability.on.do, { ...info, hero, unit: hero, event })
			return event
		}
		const consumed = runHookStages(
			ability.stages?.[name] ??
				(name === 'hit' && ability.onHit ? { before: ability.onHit } : null),
			{ ...info, hero, unit: hero, stats: ability.stats, event },
			runActions,
			ability[legacyEvents[name]] ?? fallback,
		)
		if (consumed === true) event.consumed = true
		return event
	}
	// A target that re-targets from its own impact, `repeat` more times: the nearest enemy
	// not yet hit within `range` (distance, then id), each link `falloff` weaker than the last.
	// A dead link still hands on its position, so a kill doesn't end the chain.
	function chainFrom(actor, ability, event, { range, repeat, falloff }, first, effects) {
		const stats = ability.stats
		const hit = new Set([first.id])
		let from = { ...first.body.position }
		for (let hop = 1; hop <= stats[repeat]; hop++) {
			const near = (target) => Math.hypot(target.x - from.x, target.z - from.z)
			const next = ctx.api
				.enemiesOf(actor.team)
				.filter(
					(target) => !hit.has(target.id) && near(target) <= stats[range] + (target.radius ?? 0),
				)
				.sort((a, b) => near(a) - near(b) || a.id.localeCompare(b.id))[0]
			if (!next) return
			hit.add(next.id)
			const length = near(next)
			const result = applyEffects(
				{
					unit: actor,
					ability,
					slot: event.slot,
					dir:
						length > 0
							? { x: (next.x - from.x) / length, z: (next.z - from.z) / length }
							: event.dir,
					point: next,
				},
				next.unit,
				resolveEffects(ability, effects, actor.level, (1 - stats[falloff]) ** hop),
			)
			event.lethal = Boolean(event.lethal || result.lethal)
			present({
				type: 'contact',
				part: 'impact',
				source: actor.id,
				target: next.id,
				ability: ability.id,
				origin: from,
				hop,
				point: { ...next.unit.body.position },
			})
			from = { ...next.unit.body.position }
		}
	}
	function runActions(actions, info) {
		// Status callbacks still see their carrier as unit/hero. Only declared actions
		// run as the original source, including its team, position and level.
		const actor = info.status
			? (ctx.find(info.status.src) ??
				[
					...(ctx.boss ? [ctx.boss.unit] : []),
					...ctx.heroes,
					...ctx.dummies,
					...ctx.summons,
					...(ctx.lane?.minions ?? []),
					...(ctx.lane?.structures ?? []),
				].find((unit) => unit.id === info.status.src))
			: info.hero
		if (!info.ability) throw new Error('MOBA status actions need an owning ability')
		if (!actor) return // A removed source must never turn its victim into the caster.
		const ability = info.ability
		// Bare tick notifications must not share inferred geometry between listeners.
		const event = info.event?.dir && info.event?.point ? info.event : { ...info.event }
		event.source ??= actor
		event.ability ??= ability
		event.slot ??=
			Object.entries(actor.definition?.abilities ?? {}).find(
				([, entry]) => entry.id === ability.id,
			)?.[0] ?? null
		event.point ??= (info.status ? info.unit : actor).body.position
		event.dir ??= info.status ? { x: 0, z: 0 } : { x: Math.sin(actor.yaw), z: Math.cos(actor.yaw) }
		if (!Object.hasOwn(event, 'target')) event.target = info.unit ?? null
		for (const action of actions) {
			const stats = ability.stats
			if (action.effect) {
				const unit = info.status ? info.unit : actor
				const result = applyEffects(
					{
						unit: actor,
						ability,
						slot: event.slot,
						dir: event.dir,
						point: event.point,
						hit: info.status ? { id: -1, status: info.status.key } : {},
					},
					unit,
					resolveEffects(ability, [action], actor.level),
				)
				event.lethal = Boolean(event.lethal || result.lethal)
				continue
			}
			if (action.deliver === 'shot') {
				event.shot = ctx.launchAbilityShot(actor, ability, event.dir, event.slot, action)
				continue
			}
			if (action.deliver === 'ground') {
				ctx.addGround(actor, ability, action, event)
				continue
			}
			if (action.deliver === 'target') {
				const unit = event.target
				if (
					!unit ||
					unit.dead ||
					(unit.team === actor.team) === (action.targets === 'enemy') ||
					Math.hypot(
						unit.body.position.x - actor.body.position.x,
						unit.body.position.z - actor.body.position.z,
					) > stats[action.range]
				) {
					present({ type: 'denied', hero: actor.id, slot: event.slot, reason: 'targetLost' })
					continue
				}
				const context = { ...info, hero: actor, event, stats }
				action.before?.(context)
				const effects = action.hit.map((record) => effectRecord(ability, record))
				const origin = { ...actor.body.position }
				const result = applyEffects(
					{ unit: actor, ability, slot: event.slot, dir: event.dir },
					unit,
					resolveEffects(ability, effects, actor.level),
				)
				event.lethal = Boolean(event.lethal || result.lethal)
				if (action.after) action.after(context)
				else
					present({
						type: 'contact',
						part: 'impact',
						source: actor.id,
						target: unit.id,
						ability: ability.id,
						...(action.chain && { origin, hop: 0 }),
						point: { ...unit.body.position },
					})
				if (action.chain) chainFrom(actor, ability, event, action.chain, unit, effects)
				continue
			}
			if (action.deliver !== 'area') throw new Error(`MOBA unknown delivery: ${action.deliver}`)
			const p = action.from === 'self' ? actor.body.position : event.point
			const dir = event.dir ?? { x: Math.sin(actor.yaw), z: Math.cos(actor.yaw) }
			const effects = action.hit.map((record) => effectRecord(ability, record))
			let hit = false
			for (const target of ctx.api.enemiesOf(actor.team)) {
				const unit = target.unit
				if (unit.dead || (action.targets === 'enemyHero' && !target.hero)) continue
				const dx = target.x - p.x,
					dz = target.z - p.z
				const length = Math.hypot(dx, dz)
				const reach = stats[action.radius ?? (action.shape === 'cone' ? 'range' : 'radius')]
				if (length > reach + (target.radius ?? 0)) continue
				if (
					action.shape === 'cone' &&
					length > 0 &&
					(dx * dir.x + dz * dir.z) / length < Math.cos((stats.angle * Math.PI) / 360)
				)
					continue
				if (action.where && !action.where({ target: unit, stats })) continue
				if (
					action.blockedBy === 'cover' &&
					!segmentClear(
						p,
						target,
						0,
						ctx.api.obstacles.filter((obstacle) => obstacle.id !== target.id),
						ctx.api.bounds,
					)
				)
					continue
				const direction =
					action.shape === 'circle' && length > 0 ? { x: dx / length, z: dz / length } : dir
				const result = applyEffects(
					{ unit: actor, ability, slot: event.slot, dir: direction, point: target },
					unit,
					resolveEffects(ability, effects, actor.level),
				)
				event.lethal = Boolean(event.lethal || result.lethal)
				hit = true
			}
			if (effects.some((effect) => effect.effect === 'damage'))
				present({
					type: 'impact',
					hero: actor.id,
					ability: ability.id,
					hit,
					point: { ...p },
					direction: { ...dir, y: 0 },
				})
		}
	}
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
		runHookStages(hook, context(unit, status, { reason }), runActions)
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
		const duration = options.duration ?? resolve(definition.duration, info)
		const until = duration == null ? null : ctx.t + ticks(duration)
		const mag = options.mag ?? resolve(definition.moveSpeed, info)
		if (definition.tags?.includes('slow') && mag >= 1) return null
		const amount = options.amount !== undefined ? options.amount : resolve(definition.amount, info)
		const stack = definition.stack ?? (definition.maxStacks > 1 ? 'stacks' : 'refresh')
		const same = unit.statuses.filter(
			(status) => status.key === key && status.src === source && active(status, ctx.t),
		)
		const refresh =
			options.field === undefined ? same : same.filter((status) => status.field === options.field)
		if ((stack === 'refresh' || options.field !== undefined) && refresh.length) {
			const status = refresh[0]
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
			...(options.field !== undefined && { field: options.field }),
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
		runHookStages(definition.on?.apply, context(unit, status), runActions)
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
			if (runHookStages(hook, { ...info, event }, runActions) === true) {
				event.consumed = true
				break
			}
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
		reactAbility,
		applyEffects,
		freezeImpact,
		presentStatus,
		rememberAbilityEvent,
		rememberDashEvent,
		takeDashEvent,
		remove,
		clearStatuses,
		cleanse,
		expireStatuses,
		stepStatuses,
		reactAuras,
		auraUnits,
	}
}
