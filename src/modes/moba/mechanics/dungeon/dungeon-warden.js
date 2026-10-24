import { STEP } from '../../../../core/app.js'
import { tune } from '../../tune.js'
import { wardenDefinition, freshAbilityState } from '../../heroes.js'
import { abilityOf } from '../../ability.js'
import { blocked, moveSpeed } from '../../statuses.js'
import { ticks, yawOf } from '../../sim-kit.js'
import { distance } from '../../../../core/spatial.js'

// One boss and its pull. A dungeon passes an
// `encounter` (id, name, spawn, hp) for each boss on its map.
export function createBossPull({ heroes, makeBody, present, systems, view, encounter }) {
	const definition = wardenDefinition(encounter)
	const spawn = { ...encounter.spawn }
	const unit = {
		id: encounter?.id ?? 'warden',
		heroId: 'warden',
		boss: true,
		team: 'B',
		definition,
		spawn,
		dress: view.dress,
		body: makeBody(spawn.x, spawn.z, 'B', definition, view.dress),
		hp: definition.base.hp,
		maxHp: definition.base.hp,
		// Its takedown XP on a map with a lane (a dungeon) counts it a level-one hero.
		level: tune.hero.level,
		yaw: 0,
		dead: false,
		corpse: null,
		respawnTick: null,
		cast: null,
		statuses: [],
		threat: {},
		target: null,
		abilityState: freshAbilityState(definition),
		cd: [],
		cancelUntil: [],
	}
	const state = {
		phase: 'idle',
		started: null,
		resetTick: null,
		nextSwing: 0,
		nextSlam: 0,
	}
	const living = () => heroes.filter((h) => !h.dead)
	const values = () =>
		Object.fromEntries(Object.entries(unit.threat).map(([id, value]) => [id, Math.round(value)]))

	function turn(target) {
		if (unit.target === target?.id) return
		const previous = unit.target
		unit.target = target?.id ?? null
		present({
			type: 'threat',
			team: unit.team,
			unit: unit.id,
			target: unit.target,
			previous,
			values: values(),
		})
	}
	function engage(target, t) {
		if (state.phase !== 'idle' || !target) return
		state.phase = 'engaged'
		state.started = t
		state.nextSwing = t
		state.nextSlam = t + ticks(tune.warden.firstSlam)
		unit.threat = Object.fromEntries(heroes.map((h) => [h.id, 0]))
		present({
			type: 'pull',
			team: 'A',
			state: 'start',
			step: STEP,
			party: Object.fromEntries(
				heroes.map((h) => [
					h.id,
					{
						id: h.id,
						heroId: h.heroId,
						name: h.definition.name,
						maxHp: h.maxHp,
					},
				]),
			),
			boss: { id: unit.id, name: definition.name, maxHp: unit.maxHp },
			abilities: Object.fromEntries(
				[
					...new Set(
						[
							...heroes.flatMap((h) => [
								h.definition.basic?.id,
								...Object.values(h.definition.abilities).map((a) => a?.id),
							]),
							'swing',
							'slam',
						].filter(Boolean),
					),
				].map((id) => [id, abilityOf(id)?.name ?? id]),
			),
		})
		turn(target)
	}
	function addThreat(source, damage) {
		const hero = heroes.find((h) => h.id === source && !h.dead)
		if (!hero || !(damage > 0)) return
		engage(hero, systems().t)
		if (state.phase === 'engaged')
			unit.threat[hero.id] =
				(unit.threat[hero.id] ?? 0) + damage * (tune.threat.multiplier[hero.heroId] ?? 1)
	}
	function addHealingThreat(source, amount) {
		if (state.phase !== 'engaged' || !heroes.some((h) => h.id === source)) return
		unit.threat[source] = (unit.threat[source] ?? 0) + amount * tune.threat.heal
	}
	function end(result, t) {
		state.phase = 'ended'
		state.resetTick = t + ticks(tune.warden.reset)
		systems().endCast(unit, result)
		if (!unit.dead) unit.body.update({ x: 0, z: 0 }, STEP, 0)
		present({
			type: 'pull',
			team: 'A',
			state: 'end',
			result,
			bossHp: unit.hp,
			threat: values(),
		})
	}
	function reset() {
		const ctx = systems()
		state.phase = 'reset'
		ctx.shots.length = 0
		ctx.zones.length = 0
		ctx.removeGround()
		ctx.removeSummons()
		for (const h of [...heroes, unit]) {
			ctx.endCast(h, 'reset')
			ctx.cancelChannel(h, 'reset')
			ctx.endStance(h, 'reset')
			if (!h.dead) h.body.dispose()
			h.order = null
			h.attack = null
			h.attackTick = 0
			h.buffered = null
			h.recall = null
			h.cd.fill(0)
			h.yaw = 0
			if (h === unit) h.maxHp = definition.base.hp
			h.hp = h.maxHp
			ctx.intents.cancel(h.id)
			ctx.respawn(h)
		}
		unit.threat = {}
		unit.target = null
		state.resetTick = null
		state.phase = 'idle'
	}
	function strike(target, damage, ability) {
		if (!target || target.dead) return
		const p = unit.body.position,
			q = target.body.position
		const d = distance(p, q) || 1
		systems().hit(
			{
				id: -1,
				owner: unit.id,
				team: unit.team,
				slot: ability === 'slam' ? 'slot2' : 'slot1',
				ability,
				damage,
				dx: (q.x - p.x) / d,
				dz: (q.z - p.z) / d,
			},
			{ id: target.id, unit: target, hero: true },
			q,
		)
	}
	function windup(ability, target) {
		const stats = abilityOf(ability).stats
		const p = unit.body.position,
			q = target.body.position
		const d = distance(p, q) || 1
		unit.cast = {
			ability,
			slot: ability === 'slam' ? 'slot2' : 'slot1',
			targetId: target.id,
			target: { x: q.x, z: q.z },
			dir: { x: (q.x - p.x) / d, z: (q.z - p.z) / d },
			yaw: yawOf(q.x - p.x, q.z - p.z),
			left: ticks(stats.castPoint),
			total: ticks(stats.castPoint),
		}
		present({
			type: 'cast',
			hero: unit.id,
			ability,
			slot: unit.cast.slot,
			point: { ...p },
			target: { ...unit.cast.target },
			targetId: target.id,
			direction: { ...unit.cast.dir },
			lock: unit.cast.total * STEP,
		})
	}
	function land(cast) {
		const target = heroes.find((h) => h.id === cast.targetId)
		if (cast.ability === 'swing') {
			if (target && distance(unit.body.position, target.body.position) <= tune.swing.range)
				strike(target, tune.swing.damage, 'swing')
		} else {
			strike(target, tune.slam.damage, 'slam')
			for (const h of living()) {
				if (h.id === cast.targetId || distance(h.body.position, cast.target) > tune.slam.radius)
					continue
				strike(h, tune.slam.splash, 'slam')
				if (!h.dead)
					systems().apply(h, 'slam.bruise', {
						source: unit.id,
						duration: tune.slam.bruiseDuration + STEP,
					})
			}
		}
		present({
			type: 'impact',
			hero: unit.id,
			ability: cast.ability,
			point: { x: cast.target.x, y: 0, z: cast.target.z },
		})
	}
	function step(t, dt) {
		if (state.phase === 'ended') {
			if (t >= state.resetTick) reset()
			return
		}
		if (state.phase === 'idle') {
			const nearest = living().sort(
				(a, b) =>
					distance(a.body.position, unit.body.position) -
						distance(b.body.position, unit.body.position) || a.id.localeCompare(b.id),
			)[0]
			if (nearest && distance(nearest.body.position, unit.body.position) <= tune.warden.aggro)
				engage(nearest, t)
			else return
		}
		for (const h of heroes) if (h.dead) h.respawnTick = Infinity
		if (unit.dead || !living().length) {
			end(unit.dead ? 'killed' : 'wiped', t)
			return
		}
		const ranked = living().sort(
			(a, b) => (unit.threat[b.id] ?? 0) - (unit.threat[a.id] ?? 0) || a.id.localeCompare(b.id),
		)
		let target = living().find((h) => h.id === unit.target)
		if (
			!target ||
			(unit.threat[ranked[0].id] ?? 0) > (unit.threat[target.id] ?? 0) * tune.threat.switch
		) {
			target = ranked[0]
			turn(target)
		}
		const p = unit.body.position,
			q = target.body.position,
			d = distance(p, q) || 1
		const dir = { x: (q.x - p.x) / d, z: (q.z - p.z) / d }
		unit.yaw = yawOf(dir.x, dir.z)
		unit.body.face(dir)
		if (blocked(unit, 'cast', t) || blocked(unit, 'move', t)) {
			systems().endCast(unit, 'disabled')
			unit.body.update({ x: 0, z: 0 }, dt, 0)
			return
		}
		if (unit.cast) {
			unit.body.update({ x: 0, z: 0 }, dt, 0)
			if (--unit.cast.left <= 0) {
				const cast = unit.cast
				unit.cast = null
				land(cast)
			}
			return
		}
		if (t >= state.nextSlam) {
			windup('slam', target)
			state.nextSlam = t + ticks(tune.warden.slamEvery)
		} else if (t >= state.nextSwing && d <= tune.swing.range) {
			windup('swing', target)
			state.nextSwing = t + ticks(tune.swing.cooldown)
		}
		unit.body.speedMul = moveSpeed(unit, t)
		const stopped = unit.cast || d <= tune.swing.range
		unit.body.update(stopped ? { x: 0, z: 0 } : dir, dt, stopped ? 0 : Infinity)
	}
	return { unit, state, step, addThreat, addHealingThreat }
}
