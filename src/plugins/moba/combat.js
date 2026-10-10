import { tune } from './tune.js'
import { STEP } from '../../core/app.js'
import { freshAbilityState } from './heroes.js'
import { abilityOf } from './ability.js'
import { segmentClear } from './obstacles.js'
import { SLOTS, ticks, dirOf } from './sim-kit.js'

// Damage, death and coming back: basic attacks, hits, benching, Flagfall's shove and dunk, respawn and the lobby's drop-in.
export function createCombat(ctx) {
	const {
		heroes,
		lane,
		ball,
		layout,
		obstacles,
		field,
		gaps,
		gapAt,
		walkingBounds,
		training,
		readySeats,
		intents,
		rng,
		respawnSeconds,
		footprints,
		present,
		touch,
		bodyAt,
		walkGoal,
		find,
		shots,
		cutouts,
	} = ctx
	const traitContext = (...args) => ctx.traitContext(...args)
	const cancelChannel = (...args) => ctx.cancelChannel(...args)

	// Fell off the lobby floor: come back down from the sky over a random free spot.
	function dropIn(h) {
		const spot = walkGoal(
			{
				x: (rng() * 2 - 1) * walkingBounds.halfX,
				z: (rng() * 2 - 1) * walkingBounds.halfZ,
			},
			h.body.radius,
		)
		h.body.place(spot.x, h.body.radius + h.body.halfHeight + tune.lobby.fall.height, spot.z)
		h.order = null
		if (readySeats) {
			readySeats.cancel(h.id, ctx.t)
			h.readyWalk = false
		}
	}

	function respawn(unit) {
		unit.corpse?.dispose()
		unit.corpse = null
		const spawn = unit.post ?? unit.spawn
		unit.body = bodyAt(spawn.x, spawn.z, unit.team, unit.definition, unit.dress)
		if (unit.definition) unit.abilityState = freshAbilityState(unit.definition)
		unit.body.face(dirOf(unit.yaw))
		if (unit.definition) unit.cancelUntil = SLOTS.map(() => 0)
		unit.dead = false
		if (unit.post) unit.maxHp = tune.dummies.hp
		unit.hp = unit.dunked ? Math.min(unit.maxHp, unit.dunked.hp) : unit.maxHp
		unit.dunked = null
		unit.shove = null
		unit.respawnTick = null
		unit.slow = { until: 0, factor: 1 }
		unit.freezeUntil = 0
		unit.proneUntil = 0
		unit.stance = null
		unit.channel = null
		unit.catchWindow = null
		for (let i = cutouts.length - 1; i >= 0; i--)
			if (cutouts[i].owner === unit.id) cutouts.splice(i, 1)
		unit.stunUntil = 0
		unit.ballThrow = null
		if (unit.post) unit.castTick = ctx.t + ticks(tune.dummies.castEvery)
		present({ type: 'spawn', target: unit.id, point: { x: spawn.x, y: 0, z: spawn.z } })
	}

	function basicAttack(h) {
		const attack = h.attack
		if (!attack || attack.startedTick === ctx.t || --attack.left > 0) return
		if (attack.phase === 'backswing') {
			h.attack = null
			return
		}
		const target = find(attack.target)
		if (!target && !attack.point) {
			h.attack = null
			return
		}
		const p = h.body.position,
			tp = attack.point ?? target.body.position
		const length = Math.hypot(tp.x - p.x, tp.z - p.z) || 1
		const shot = {
			id: ++ctx.shotIds,
			owner: h.id,
			team: h.team,
			...(h.definition.basic.id && { ability: h.definition.basic.id }),
			slot: 'primary',
			...(target && { target: target.id }),
			x: p.x,
			z: p.z,
			dx: (tp.x - p.x) / length,
			dz: (tp.z - p.z) / length,
			speed: h.definition.basic.speed,
			radius: h.definition.basic.radius,
			range: attack.point ? h.definition.basic.range : field.halfX * 4,
			travelled: 0,
			passed: [],
			damage: h.definition.basic.damage * (1 + tune.levels.growth * (h.level - 1)),
		}
		const { critEvery, critMultiplier } = h.definition.basic
		if (critEvery && (h.basicStreak ?? 0) >= critEvery - 1) {
			shot.crit = true
			shot.damage *= critMultiplier
		}
		const castFootprint = footprints.get(attack)
		if (castFootprint) footprints.set(shot, castFootprint)
		if (h.definition.basic.kind === 'melee') {
			const inReach =
				!(target?.dead ?? false) &&
				Math.hypot(tp.x - p.x, tp.z - p.z) <=
					h.definition.basic.range + (target?.kind ? target.body.radius : 0) &&
				segmentClear(
					p,
					tp,
					h.definition.basic.radius,
					obstacles.filter((o) => o.id !== target?.id),
					field,
				)
			if (inReach)
				touch(shot, {
					kind: 'basic',
					from: { ...p },
					to: { ...tp },
					radius: h.definition.basic.radius,
				})
			present({
				type: 'impact',
				hero: h.id,
				ability: shot.ability,
				hit: inReach,
				point: { x: tp.x, y: tune.projectile.height, z: tp.z },
			})
			if (inReach && target) hit(shot, { id: target.id, unit: target, hero: !target.kind }, tp)
		} else shots.push(shot)
		h.attackTick = ctx.t + ticks(1 / h.definition.basic.rate)
		h.attack = {
			target: target?.id ?? null,
			phase: 'backswing',
			left: ticks(h.definition.basic.backswing),
			startedTick: ctx.t,
		}
		if (h.definition.basic.kind === 'melee') return
		present({
			type: 'projectile',
			id: shot.id,
			hero: h.id,
			slot: 'primary',
			point: { x: p.x, y: tune.projectile.height, z: p.z },
			direction: { x: shot.dx, z: shot.dz },
		})
	}

	function hit(shot, target, point) {
		const unit = target.unit
		if (training.godMode && unit.id === training.local) {
			present({
				type: 'shielded',
				source: shot.owner,
				target: unit.id,
				projectile: shot.id,
				point: { x: point.x, y: tune.projectile.height, z: point.z },
			})
			return
		}
		if (shot.slot === 'ball' && target.hero) unit.body.cancelDash()
		const direction = { x: shot.dx, y: 0, z: shot.dz }
		const at = { x: point.x, y: tune.projectile.height, z: point.z }
		if (unit.structure && !lane.vulnerable(unit)) {
			present({
				type: 'shielded',
				source: shot.owner,
				target: unit.id,
				projectile: shot.id,
				point: at,
			})
			return
		}
		const source = heroes.find((h) => h.id === shot.owner)
		const ability = source?.definition.abilities[shot.slot]
		const rawDamage =
			shot.damage ??
			(tune[shot.ability]?.damage ?? ability?.stats.damage) *
				(1 + tune.levels.growth * ((source?.level ?? 1) - 1))
		const catchShield =
			!unit.dead &&
			unit.respawnTick == null &&
			abilityOf(unit.stance?.ability, unit)?.catchesShots &&
			unit.stance.until > ctx.t &&
			unit.catchWindow?.until > ctx.t &&
			ctx.t >= Math.max(unit.stunUntil, unit.freezeUntil, unit.proneUntil)
		const damage = Math.min(
			unit.hp,
			rawDamage *
				(catchShield
					? 1 - (abilityOf(unit.catchWindow.ability, unit)?.stats.damageReduction ?? 0)
					: 1) *
				(unit.structure && (shot.isAbility || shot.slot.startsWith('slot'))
					? tune.waves.abilityStructure
					: 1),
		)
		lane?.help(find(shot.owner), unit, ctx.t)
		if (source && shot.slot === 'primary' && source.definition.basic.critEvery)
			source.basicStreak = shot.crit ? 0 : (source.basicStreak ?? 0) + 1
		if (shot.slow)
			unit.slow = { until: ctx.t + ticks(shot.slow.duration), factor: shot.slow.factor }
		unit.hp = Math.max(0, unit.hp - damage)
		const lethal = unit.hp === 0
		if (!unit.kind && damage > 0) ball?.hurt(unit)
		if (source && shot.traitProcs !== false)
			source.definition.traits.onHit?.({
				...traitContext(source),
				source,
				target,
				ticks,
				shot: { ...shot, ability: shot.ability ?? source.definition.abilities[shot.slot]?.id },
			})
		present({
			type: 'hit',
			source: shot.owner,
			target: target.id,
			projectile: shot.id,
			ability: shot.ability ?? ability?.id ?? null,
			slot: shot.slot,
			point: at,
			direction,
			lethal,
			damage,
			...(shot.crit && { crit: true }),
			hp: unit.hp,
			maxHp: unit.maxHp,
		})
		if (!lethal) {
			if (target.hero && !unit.post) shove(unit, shot)
			return
		}
		unit.dead = true
		if (!unit.kind) ball?.hurt(unit)
		unit.corpse = unit.body
		unit.body.retire()
		if (unit.kind) {
			unit.attack = null
			lane.reward(unit, shot.team ?? (unit.team === 'A' ? 'B' : 'A'), ctx.t, shot.owner)
			present({ type: 'death', source: shot.owner, target: unit.id, point: at, direction })
			return
		}
		if (lane && !unit.post)
			lane.reward(unit, shot.team ?? (unit.team === 'A' ? 'B' : 'A'), ctx.t, shot.owner)
		bench(
			unit,
			unit.post
				? tune.dummies.respawn
				: (respawnSeconds ?? tune.respawn.base + tune.respawn.perLevel * unit.level),
			shot,
		)
		present({ type: 'death', source: shot.owner, target: target.id, point: at, direction })
	}

	// Out of play until `seconds` pass: a death or a dunk. The caller has retired the body.
	function bench(unit, seconds, shot) {
		unit.respawnTick = ctx.t + ticks(seconds)
		unit.cast = null
		unit.shove = null
		if (unit.post) return
		unit.abilityState = freshAbilityState(unit.definition)
		unit.stance = null
		unit.catchWindow = null
		unit.freezeUntil = 0
		unit.proneUntil = 0
		cancelChannel(unit, 'death')
		unit.definition.traits.onDeath?.(traitContext(unit, { shot }))
		unit.order = null
		unit.attack = null
		intents.cancel(unit.id)
	}

	// A skillshot on the slick strip of a gap slides the hero along the shot (Rain: away from its centre).
	// A slide that reaches the court's edge inside the gap goes over: the hero is dunked when it ends.
	function shove(unit, shot) {
		const d = tune.flagfall.dunk
		if (!gaps.length || !d.abilities.includes(shot.ability) || unit.dead) return
		if (unit.shove || ctx.t < (unit.slickImmuneUntil ?? 0)) return
		const p = unit.body.position
		const flank = p.z < 0 ? -1 : 1
		const shore = layout.bounds.halfZ
		if (Math.abs(p.z) < shore - d.slick || !gapAt(p.x, flank)) return
		const dx = shot.from ? p.x - shot.from.x : shot.dx
		const dz = shot.from ? p.z - shot.from.z : shot.dz
		const length = Math.hypot(dx, dz)
		if (!(length > 1e-4)) return
		const dir = { x: dx / length, z: dz / length }
		// Metres along the push until the body touches the walking edge on this shore.
		const out =
			dir.z * flank > 1e-4
				? Math.max(0, (shore - unit.body.radius - Math.abs(p.z)) / (dir.z * flank))
				: Infinity
		const dunked = out <= d.push && !!gapAt(p.x + dir.x * out, flank)
		const distance = dunked ? out : d.push
		const steps = Math.max(1, Math.ceil((d.time * distance) / d.push / STEP))
		unit.body.cancelDash()
		unit.dashAbility = null
		cancelChannel(unit, 'disabled')
		if (distance > 1e-3) unit.body.dash(dir, { distance, time: steps * STEP - 1e-9 })
		unit.shove = {
			until: ctx.t + steps,
			dunk: dunked,
			dir,
			source: shot.owner,
			team: shot.team ?? (unit.team === 'A' ? 'B' : 'A'),
		}
		unit.slickImmuneUntil = ctx.t + steps + ticks(d.immunity)
		present({
			type: 'shove',
			source: shot.owner,
			target: unit.id,
			point: { x: p.x, y: 0, z: p.z },
			direction: { x: dir.x, y: 0, z: dir.z },
			dunk: dunked,
		})
	}

	// Over the edge: not a death. The hero swims home and climbs out at base on the HP they had.
	function dunk(h, shoved) {
		const p = h.body.position
		h.dead = true
		h.dunked = { hp: h.hp }
		ball?.hurt(h)
		h.corpse = h.body
		h.body.retire()
		if (lane) lane.reward(h, shoved.team, ctx.t, shoved.source)
		bench(h, tune.flagfall.dunk.swim, null)
		present({
			type: 'dunk',
			source: shoved.source,
			target: h.id,
			point: { x: p.x, y: 0, z: p.z },
			direction: { x: shoved.dir.x, y: 0, z: shoved.dir.z },
		})
	}

	return { dropIn, respawn, basicAttack, hit, bench, shove, dunk }
}
