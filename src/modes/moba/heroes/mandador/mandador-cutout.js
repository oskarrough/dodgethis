import { STEP } from '../../../../core/app.js'
import { tune } from '../../tune.js'
import { abilityOf } from '../../ability.js'
import { dirOf, yawOf } from '../../sim-kit.js'

export function mandadorCutoutDeath({ hero, sim }) {
	const flank = hero.team === 'A' ? -1 : 1
	sim.cutouts.push({
		id: `mandador-cutout:${hero.id}`,
		owner: hero.id,
		heroId: 'mandador',
		team: hero.team,
		x: hero.body.position.x,
		prevX: hero.body.position.x,
		z: flank * (sim.bounds.halfZ + sim.bounds.thickness),
		flank,
		goalX: null,
		cast: null,
		cooldownUntil: 0,
	})
}

export function mandadorThrowOrigin(cutout, bounds, obstacles) {
	const clearance = tune.outThrow.radius + tune.heroes.mandador.cutout.inset
	let inland = bounds.halfZ - clearance
	for (const wall of obstacles) {
		if (
			wall.kind === 'wall' &&
			cutout.flank * wall.z > 0 &&
			Math.abs(cutout.x - wall.x) <= wall.halfX + tune.outThrow.radius
		)
			inland = Math.min(inland, cutout.flank * wall.z - wall.halfZ - clearance)
	}
	return { x: cutout.x, z: cutout.flank * inland }
}

export function mandadorCutoutFrame({ hero, sim, tick = sim.tick, alpha = 0 }) {
	if (!hero.dead) return null
	const c = sim.cutouts.find((u) => u.owner === hero.id)
	if (!c) return null
	return {
		abilities: { slot1: abilityOf('outThrow'), slot2: null, slot3: null, slot4: null },
		position: { x: (c.prevX ?? c.x) + (c.x - (c.prevX ?? c.x)) * alpha, y: 0, z: c.z },
		aimOrigin: mandadorThrowOrigin(
			{ ...c, x: (c.prevX ?? c.x) + (c.x - (c.prevX ?? c.x)) * alpha },
			sim.bounds,
			sim.obstacles,
		),
		cast: c.cast,
		cooldowns: [Math.max(0, c.cooldownUntil - tick - alpha) * STEP, 0, 0],
	}
}

export function mandadorCutoutTick({ hero, sim, tick, ticks, dt, intents, present }) {
	const c = sim.cutouts.find((u) => u.owner === hero.id)
	if (!hero.dead || !c || tick >= hero.respawnTick) return
	const frame = intents.get(hero.id),
		skill = tune.outThrow
	c.prevX = c.x
	const cancel = frame.pressed.some((e) => e.action === 'stop' || e.action === 'cancel')
	const moved = Math.abs(frame.move.x) > 0 || (frame.order && frame.order.x !== c.goalX)
	if (cancel || moved) {
		if (c.cast) {
			c.cooldownUntil = Math.max(tick + ticks(tune.cast.cancelLockout), tick)
			present({
				type: 'castCancelled',
				hero: hero.id,
				ability: c.cast.ability,
				slot: c.cast.slot,
				reason: cancel ? 'input' : 'move',
			})
		}
		c.cast = null
		if (cancel) c.goalX = null
	}
	if (frame.order && !cancel) c.goalX = frame.order.x
	if (!c.cast && !cancel) {
		const step = tune.heroes.mandador.cutout.speed * dt
		const dx =
			Math.abs(frame.move.x) > 0
				? frame.move.x * step
				: c.goalX == null
					? 0
					: Math.max(-step, Math.min(step, c.goalX - c.x))
		c.x = Math.max(
			-sim.bounds.halfX + skill.radius,
			Math.min(sim.bounds.halfX - skill.radius, c.x + dx),
		)
	}
	for (const edge of frame.pressed.slice()) {
		intents.consume(hero.id, edge.action)
		if (['stop', 'cancel'].includes(edge.action)) continue
		if (!['primary', 'slot1'].includes(edge.action)) {
			present({ type: 'denied', hero: hero.id, slot: edge.action, reason: 'dead' })
			continue
		}
		if (cancel || c.cast || tick < c.cooldownUntil) {
			present({ type: 'denied', hero: hero.id, slot: 'slot1', reason: 'cooldown' })
			continue
		}
		const origin = mandadorThrowOrigin(c, sim.bounds, sim.obstacles),
			at = edge.at ?? frame.aim
		const dx = at ? at.x - origin.x : dirOf(hero.yaw).x
		const dz = at ? at.z - origin.z : dirOf(hero.yaw).z
		const length = Math.hypot(dx, dz),
			dir = length > 0 ? { x: dx / length, z: dz / length } : dirOf(hero.yaw)
		c.cast = {
			ability: 'outThrow',
			slot: 'slot1',
			dir,
			yaw: yawOf(dir.x, dir.z),
			left: ticks(skill.castPoint),
			total: ticks(skill.castPoint),
			startedTick: tick,
		}
		c.cooldownUntil = tick + ticks(skill.cooldown)
		present({
			type: 'cast',
			hero: hero.id,
			ability: 'outThrow',
			slot: 'slot1',
			lock: c.cast.total * STEP,
			targetId: null,
			point: { ...origin, y: 0 },
			direction: dir,
		})
	}
	if (c.cast && tick > c.cast.startedTick && --c.cast.left <= 0) {
		sim.launchShot(
			hero,
			c.cast.dir,
			{
				ability: 'outThrow',
				slot: 'slot1',
				damage: skill.damage,
				range: skill.range,
				radius: skill.radius,
				speed: skill.speed,
				heroOnly: true,
				catchable: true,
				noHelp: true,
				isAbility: true,
			},
			mandadorThrowOrigin(c, sim.bounds, sim.obstacles),
		)
		c.cast = null
	}
}
