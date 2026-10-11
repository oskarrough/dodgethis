import { tune } from './tune.js'
import { STEP } from '../../core/app.js'
import { heroDefinition } from './heroes.js'
import { abilityOf, castAbility } from './ability.js'
import { clampMap, segmentClear } from './obstacles.js'
import { SLOTS, ticks, yawOf, dirOf } from './sim-kit.js'

// From a key press to an ability: the cast buffer and windup, release by ability kind, aimed basics, and the stances and channels that follow.
export function createCasting(ctx) {
	const {
		lobby,
		obstacles,
		field,
		scripted,
		botIds,
		intents,
		footprint,
		footprints,
		present,
		trace,
		zones,
		launchShot,
		throwCaught,
		basicAttack,
	} = ctx

	// Ticks until a slot could fire.
	function castWait(h, ability, i) {
		const returning = ability.returnsPocket && h.abilityState.pocket
		return Math.max(
			returning ? 0 : h.cd[i],
			h.cancelUntil[i] - ctx.t,
			h.cast?.left ?? 0,
			h.attack?.phase === 'windup' ? h.attack.left - 1 : 0,
			ticks(h.body.dashTime),
		)
	}

	function busyReason(h, i) {
		return h.cd[i] > 0 || h.cancelUntil[i] > ctx.t
			? 'cooldown'
			: h.cast
				? 'casting'
				: h.attack?.phase === 'windup'
					? 'windup'
					: 'dashing'
	}

	// The newest slot press wins and waits on the hero, not in the core frame, for up to tune.cast.buffer.
	// It fires on the first legal tick; a press that cannot become legal in time is denied at once.
	function casts(h, frame) {
		const edges = frame.pressed.filter((e) => SLOTS.includes(e.action))
		if (edges.length) {
			for (const e of edges) intents.consume(h.id, e.action)
			h.buffered = null
			const latest = edges.at(-1)
			const slot = latest.action
			const ability = h.definition.abilities[slot]
			if (!ability) {
				present({ type: 'denied', hero: h.id, slot, reason: 'no-ability' })
				return
			}
			// An ability with `ready` (Swap needs a live Bank) is denied while it has nothing to act on.
			if (ability.ready && !ability.ready(traitContext(h, { ability }))) {
				present({ type: 'denied', hero: h.id, slot, reason: 'unready' })
				return
			}
			const i = SLOTS.indexOf(slot)
			const window = Math.max(1, ticks(tune.cast.buffer))
			if (castWait(h, ability, i) >= window) {
				present({ type: 'denied', hero: h.id, slot, reason: busyReason(h, i) })
				return
			}
			h.buffered = { edge: latest, until: ctx.t + window }
		}
		if (!h.buffered) return
		const latest = h.buffered.edge
		const slot = latest.action
		const ability = h.definition.abilities[slot]
		const returning = ability.returnsPocket && h.abilityState.pocket
		const i = SLOTS.indexOf(slot)
		if (ctx.t >= h.buffered.until) {
			h.buffered = null
			present({ type: 'denied', hero: h.id, slot, reason: busyReason(h, i) })
			return
		}
		if (h.attack?.phase === 'windup' && h.attack.left <= 1) basicAttack(h)
		if (
			h.cast ||
			h.attack?.phase === 'windup' ||
			h.body.dashing ||
			h.cancelUntil[i] > ctx.t ||
			(!returning && h.cd[i] > 0)
		)
			return
		h.buffered = null
		h.attack = null // abilities cut the backswing, not the windup
		const p = h.body.position
		const at = latest.at
		const dx = at ? at.x - p.x : dirOf(h.yaw).x
		const dz = at ? at.z - p.z : dirOf(h.yaw).z
		const len = Math.hypot(dx, dz)
		const dir = len > 1e-4 ? { x: dx / len, z: dz / len } : dirOf(h.yaw)
		if (returning) {
			throwCaught(h, dir, slot, at)
			return
		}
		const skill = ability.stats
		cancelChannel(h, 'cast')
		const reach = Math.min(len, skill.range ?? 0)
		const target = clampMap({ x: p.x + dir.x * reach, z: p.z + dir.z * reach }, 0, field)
		h.cast = {
			ability: ability.id,
			slot,
			cooldownBefore: h.cd[i],
			startedTick: ctx.t,
			dir,
			target,
			yaw: yawOf(dir.x, dir.z),
			left: ticks(
				(scripted.includes(h.id) || botIds.has(h.id)) && ability.kind === 'shot'
					? Math.max(skill.castPoint, tune.scripted.tell)
					: skill.castPoint,
			),
			total: ticks(
				(scripted.includes(h.id) || botIds.has(h.id)) && ability.kind === 'shot'
					? Math.max(skill.castPoint, tune.scripted.tell)
					: skill.castPoint,
			),
		}
		trace(h, h.cast, at ?? target, ability.id)
		h.yaw = h.cast.yaw
		h.cd[i] = ticks(skill.cooldown)
		present({
			type: 'cast',
			hero: h.id,
			ability: ability.id,
			slot,
			point: { x: p.x, y: p.y, z: p.z },
			direction: { ...dir },
			target: { ...target },
		})
	}

	function release(h) {
		const castFootprint = footprints.get(h.cast)
		const { slot, dir, target, shot: frozen } = h.cast
		const ability = castAbility(h) ?? heroDefinition().abilities[slot]
		const skill = ability.stats
		h.cast = null
		h.lastRemaining = null
		if (frozen) {
			const shot = launchShot(h, dir, {
				...frozen,
				ability: 'return',
				slot,
				bounce: false,
				traitProcs: false,
				catchable: true,
				isAbility: true,
			})
			if (castFootprint) footprints.set(shot, castFootprint)
			return
		}
		const context = traitContext(h, { ability, dir, target, slot })
		if (ability.kind === 'stance') {
			h.stance = {
				ability: ability.id,
				until: ctx.t + ticks(skill.duration),
				dir: { ...dir },
				factor: skill.speedFactor ?? 1,
			}
			ability.onStart?.(context)
			if (castFootprint && h.catchWindow) footprints.set(h.catchWindow, castFootprint)
			return
		}
		if (ability.kind === 'channel') {
			h.channel = {
				ability: ability.id,
				slot,
				dir,
				target,
				left: ticks(skill.duration),
				total: ticks(skill.duration),
			}
			ability.onStart?.(context)
			return
		}
		ability.onRelease?.(context)
		if (ability.kind === 'instant') return
		if (castFootprint && h.catchWindow) footprints.set(h.catchWindow, castFootprint)
		if (ability.kind === 'dash') {
			// Whole fixed steps avoid overshooting the advertised distance on the final dash tick.
			const time = Math.max(1, Math.ceil(skill.time / STEP)) * STEP - 1e-9
			h.dashAbility = ability.id
			h.body.dash(dir, { distance: skill.range, time })
			if (castFootprint) footprints.set(h.body, castFootprint)
			return
		}
		if (ability.kind === 'zone') {
			zones.push({
				id: ++ctx.shotIds,
				owner: h.id,
				team: h.team,
				x: target.x,
				z: target.z,
				left: ticks(skill.delay),
				total: ticks(skill.delay),
				ability: ability.id,
				slot,
			})
			if (castFootprint) footprints.set(zones.at(-1), castFootprint)
			return
		}
		const shot = launchShot(h, dir, {
			ability: ability.id,
			slot,
			pierce: ability.pierce,
			heal: ability.heal,
			bounce: skill.bounce ?? false,
			catchable: ability.catchable,
			isAbility: true,
			slow: skill.slow ? { factor: 1 - skill.slow, duration: skill.duration } : null,
			speed: skill.speed,
			radius: skill.radius,
			range: skill.range,
			damage:
				lobby && h.sparring
					? tune.lobby.practice.damage
					: skill.damage * (1 + tune.levels.growth * ((h.level ?? tune.hero.level) - 1)),
		})
		if (castFootprint) footprints.set(shot, castFootprint)
	}

	// A prop is an aim point, never an enemy or a unit in the target database.
	function aimBasic(h, at) {
		if (!at || !footprint?.({ phase: 'aim', hero: h.id, aim: at })) return false
		if (h.attack?.phase === 'windup') return true
		const p = h.body.position,
			basic = h.definition.basic
		const reason =
			h.cast || h.channel || h.body.dashing
				? 'casting'
				: ctx.t < h.attackTick
					? 'cooldown'
					: !basic || Math.hypot(at.x - p.x, at.z - p.z) > basic.range
						? 'range'
						: !segmentClear(p, at, basic.radius, obstacles, field)
							? 'blocked'
							: null
		if (reason) {
			present({ type: 'denied', hero: h.id, slot: 'primary', reason })
			return true
		}
		h.order = null
		h.attack = {
			point: { ...at },
			phase: 'windup',
			left: ticks(basic.windup),
			total: ticks(basic.windup),
		}
		h.yaw = yawOf(at.x - p.x, at.z - p.z)
		trace(h, h.attack, at, basic.id)
		present({
			type: 'cast',
			hero: h.id,
			ability: basic.id,
			slot: 'primary',
			point: { ...p },
			direction: dirOf(h.yaw),
			target: { ...at },
		})
		return true
	}

	function traitContext(hero, extra = {}) {
		return { hero, sim: ctx.api, tick: ctx.t, ticks, intents, present, ...extra }
	}

	function cancelChannel(hero, reason) {
		if (!hero.channel) return
		const channel = hero.channel
		hero.channel = null
		const ability = abilityOf(channel.ability, hero)
		ability?.onCancel?.(traitContext(hero, { ...channel, ability, reason }))
		present({
			type: 'channelCancelled',
			hero: hero.id,
			ability: channel.ability,
			reason,
			point: { ...hero.body.position },
		})
	}

	// A cast or stance that ends for any reason but its own release: the hook fires, then
	// the state goes, so what onStart set up can be undone.
	function endCast(hero, reason) {
		if (!hero.cast) return
		const cast = hero.cast
		const ability = castAbility(hero)
		hero.cast = null
		ability?.onCancel?.(traitContext(hero, { ...cast, ability, reason }))
	}

	function endStance(hero, reason) {
		if (!hero.stance) return
		const stance = hero.stance
		const ability = abilityOf(stance.ability, hero)
		hero.stance = null
		ability?.onEnd?.(traitContext(hero, { stance, ability, reason }))
	}

	function stepHeroState(hero, dt) {
		const frame = intents.get(hero.id)
		if (hero.stance) {
			const stance = hero.stance
			const ability = abilityOf(stance.ability, hero)
			const cancelled = lobby && frame.pressed.some((e) => e.action === 'cancel')
			if (stance.until <= ctx.t || cancelled) {
				hero.stance = null
				ability?.onEnd?.(traitContext(hero, { stance, ability }))
				if (cancelled && hero.catchWindow) {
					hero.catchWindow = null
					present({ type: 'catchExpired', hero: hero.id, point: { ...hero.body.position } })
				}
			} else ability?.onTick?.(traitContext(hero, { stance, ability, dt }))
		}
		if (hero.catchWindow && hero.catchWindow.until <= ctx.t) hero.catchWindow = null
		if (hero.abilityState.pocket && hero.abilityState.pocket.until <= ctx.t) {
			hero.abilityState.pocket = null
			present({ type: 'catchExpired', hero: hero.id, point: { ...hero.body.position } })
		}
		if (!hero.channel || hero.dead) return
		const channel = hero.channel
		if (
			(abilityOf(channel.ability, hero)?.cancelOnMove &&
				(frame.order || Math.hypot(frame.move.x, frame.move.z) > 0.01)) ||
			frame.pressed.some((e) => ['stop', 'cancel'].includes(e.action))
		)
			return cancelChannel(hero, 'input')
		if (ctx.t < hero.stunUntil || ctx.t < hero.freezeUntil || ctx.t < hero.proneUntil)
			return cancelChannel(hero, 'disabled')
		const ability = abilityOf(channel.ability, hero)
		ability?.onTick?.(traitContext(hero, { ...channel, ability, dt }))
		if (--channel.left > 0) return
		hero.channel = null
		ability?.onRelease?.(traitContext(hero, { ...channel, ability }))
		present({
			type: 'channelEnd',
			hero: hero.id,
			ability: channel.ability,
			point: { ...hero.body.position },
		})
	}

	return {
		castWait,
		busyReason,
		casts,
		release,
		aimBasic,
		traitContext,
		cancelChannel,
		endCast,
		endStance,
		stepHeroState,
	}
}
