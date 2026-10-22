import { DEFAULT_HERO, HEROES, heroDefinition, freshAbilityState } from './heroes.js'
import { dressHero } from './hero-view.js'
import { createBody } from '../../core/body.js'
import { styleId } from '../../core/stylepass.js'
import { tune, profile } from './tune.js'
import { clampWalkable, clampMap } from './obstacles.js'
import { SLOTS, dirOf, cancelAttack } from './sim-kit.js'

// A hero's body (dressed, clamped to the walking bounds) and its fresh state.
export function createHeroMaker({ scene, world, RAPIER, smooth, lobby, floor, walkingBounds }) {
	const bodyAt = (x, z, team, definition = heroDefinition(), dress = dressHero) => {
		const point = walkingBounds
			? clampMap({ x, z }, definition.base.radius, walkingBounds)
			: { x, z }
		const body = createBody(scene, world, RAPIER, {
			profile: definition.base,
			position: [point.x, 0, point.z],
			role: team === 'A' ? 'teamA' : 'teamB',
			bounds: (radius) => ({
				x: floor.halfX - radius,
				z: floor.halfZ - radius,
			}),
			smooth,
		})
		// The lobby floor has open edges instead: walking off drops you (see `dropIn`).
		if (walkingBounds && !lobby) {
			// Clamp the pending physics step, not the synced/rendered pose: interpolation stays intact.
			const update = body.update
			body.update = (...args) => {
				update(...args)
				if (body.retired) return
				const next = body.rigidBody.nextTranslation()
				const point = clampMap(next, body.radius, walkingBounds)
				body.rigidBody.setNextKinematicTranslation({ ...point, y: next.y })
			}
		}
		let undress = dress(body, definition.id, team)
		// Lobby allegiance stays friendly; the claimed seat owns the costume's colour.
		body.setTeam = (next) => {
			if (team === next) return
			team = next
			undress()
			body.visual.material.uniforms.uStyleId.value = styleId(next === 'A' ? 'teamA' : 'teamB')
			undress = dress(body, definition.id, next)
		}
		const retire = body.retire
		body.retire = () => {
			for (const part of body.mesh.children) if (part !== body.visual) part.visible = false
			retire()
		}
		const dispose = body.dispose
		body.dispose = () => {
			undress()
			dispose()
		}
		return body
	}
	function makeHero({ id, team: seatTeam, heroId = DEFAULT_HERO, joinOrder = 0 }, spawn) {
		const team = lobby ? 'A' : seatTeam
		const definition = heroDefinition(heroId)
		const body = bodyAt(spawn.x, spawn.z, team, definition)
		return {
			id,
			team,
			...(lobby && { seatTeam, joinOrder, readyWalk: false }),
			heroId,
			definition,
			abilityState: freshAbilityState(definition),
			body,
			yaw: 0,
			spawn,
			hp: definition.base.hp,
			maxHp: definition.base.hp,
			level: definition.base.level,
			dead: false,
			corpse: null,
			respawnTick: null,
			attack: null,
			attackTick: 0,
			order: null,
			cast: null,
			statuses: [],
			stance: null,
			channel: null,
			recall: null,
			recallReady: 0,
			catchWindow: null,
			ballThrow: null,
			cd: SLOTS.map(() => 0),
			cancelUntil: SLOTS.map(() => 0),
			buffered: null, // the newest slot press waiting for its first legal tick: { edge, until }
			lastOrder: -Infinity,
			stall: 0,
			lastRemaining: null,
		}
	}
	return { bodyAt, makeHero }
}

// Hero lifecycle after the start: swap in the lobby, join and leave, bot hand-overs, levels, respawn.
export function createRoster(ctx) {
	const {
		heroes,
		intents,
		lobby,
		lane,
		ball,
		layout,
		obstacles,
		floor,
		readySeats,
		botSeats,
		rebuildBots,
		bodyAt,
		makeHero,
		walkGoal,
		present,
		plan,
		respawn,
		endCast,
		endStance,
		cancelChannel,
		boards,
		zones,
		shots,
	} = ctx
	let trainingSerial = 0
	function swapHero(id, heroId) {
		const hero = heroes.find((h) => h.id === id)
		const definition = HEROES[heroId]
		if (!lobby || !hero || hero.dead || !definition?.playable || lane?.match.winner) {
			present({
				type: 'denied',
				hero: id,
				slot: 'swap',
				reason: lobby ? 'unavailable' : 'not-lobby',
			})
			return false
		}
		const from = hero.heroId
		const heldSlots = new Set([
			...(hero.swapAim?.blocked ?? []),
			...Object.keys(intents.get(id).held).filter((slot) => SLOTS.includes(slot)),
		])
		const moveOrder = ['move', 'attack-move'].includes(hero.order?.kind) ? hero.order : null
		const position = { ...hero.body.position }
		// Read before stopping: cancelDash clears walking velocity too. Dash momentum is not walking.
		const velocity = hero.body.dashing ? { x: 0, y: 0, z: 0 } : hero.body.velocity
		const speed = Math.hypot(velocity.x, velocity.z)
		const scale = speed ? Math.min(1, definition.base.speed / speed) : 1
		const fraction = hero.hp / hero.maxHp
		endCast(hero, 'swap')
		cancelAttack(hero, present, 'swap')
		endStance(hero, 'swap')
		cancelChannel(hero, 'swap')
		ctx.clearStatuses(hero, 'swap')
		ctx.removeSummons(hero.id)
		hero.body.cancelDash()
		hero.body.dispose()
		hero.heroId = heroId
		hero.definition = definition
		hero.body = bodyAt(position.x, position.z, hero.team, definition)
		hero.body.place(position.x, position.y, position.z)
		hero.body.setVelocity({ x: velocity.x * scale, y: velocity.y, z: velocity.z * scale })
		hero.body.face(dirOf(hero.yaw))
		hero.maxHp = definition.base.hp * (1 + tune.levels.growth * (hero.level - 1))
		hero.hp = hero.maxHp * fraction
		hero.abilityState = freshAbilityState(definition)
		hero.attack = null
		hero.attackTick = 0
		hero.order = null
		hero.cast = null
		hero.stance = null
		hero.channel = null
		hero.recall = null
		hero.catchWindow = null
		hero.dashAbility = null
		hero.ballThrow = null
		hero.cd.fill(0)
		hero.cancelUntil.fill(0)
		hero.judged = new WeakSet()
		hero.lastOrder = -Infinity
		hero.stall = 0
		hero.lastRemaining = null
		if (moveOrder) {
			const goal = walkGoal(moveOrder.goal, hero.body.radius)
			hero.order = { kind: moveOrder.kind, target: null, goal, path: plan(hero, goal) }
		}
		// Cancel only queued actions, not the device: held RMB and pad movement must survive the cut.
		const frame = intents.get(id)
		for (const edge of frame.pressed.slice())
			if (edge.action !== 'ready') intents.consume(id, edge.action)
		frame.aim = null
		frame.held = {}
		hero.swapAim = heldSlots.size ? { blocked: heldSlots, sample: frame.held } : null
		// The same fact is available to frame-driven views without requiring a second event bus.
		hero.swapFact = { type: 'swap', hero: id, from, heroId, point: position, tick: ctx.t }
		const box = readySeats?.seatOf(id)
		if (box) readySeats.claim(box.id, { ...box.occupant, heroId }, ctx.t)
		present(hero.swapFact)
		return true
	}
	function removeHero(id) {
		const index = heroes.findIndex((hero) => hero.id === id)
		if (index < 0) return false
		const hero = heroes[index]
		ctx.removeSummons(id)
		ball?.hurt(hero)
		endCast(hero, 'clear')
		cancelAttack(hero, present, 'clear')
		endStance(hero, 'clear')
		cancelChannel(hero, 'clear')
		intents.cancel(id)
		readySeats?.release(id, ctx.t)
		hero.corpse?.dispose()
		if (!hero.dead) hero.body.dispose()
		heroes.splice(index, 1)
		const bot = botSeats.findIndex((seat) => seat.id === id)
		if (bot >= 0) botSeats.splice(bot, 1)
		for (const population of [boards, zones, shots])
			for (let i = population.length - 1; i >= 0; i--)
				if (population[i].owner === id || population[i].target === id) population.splice(i, 1)
		rebuildBots()
		return true
	}

	// A late human takes a bot's hero as it stands (spot, HP, cooldowns); only the brain leaves.
	function releaseBot(id) {
		const index = botSeats.findIndex((seat) => seat.id === id)
		if (index < 0) return false
		botSeats.splice(index, 1)
		intents.cancel(id)
		const hero = heroes.find((h) => h.id === id)
		if (hero) hero.order = null
		rebuildBots()
		return true
	}
	// The reverse: a departed human's hero plays on as a bot from where it stands.
	function adoptBot(seat) {
		if (!heroes.some((h) => h.id === seat.id) || botSeats.some((s) => s.id === seat.id))
			return false
		intents.cancel(seat.id)
		botSeats.push(seat)
		rebuildBots()
		return true
	}
	return {
		swapHero,
		removeHero,
		releaseBot,
		adoptBot,
		setLevel(id, level) {
			const hero = heroes.find((h) => h.id === id)
			if (!hero || !Number.isInteger(level) || level < tune.hero.level || level > tune.levels.cap)
				return false
			const team = lane?.teams[hero.team]
			if (team) {
				team.level = level
				team.xp = 0
				for (let n = 1; n < level; n++)
					team.xp += tune.levels.first + tune.levels.increment * (n - 1)
			}
			for (const unit of heroes.filter((h) => h.team === hero.team)) {
				const fraction = unit.hp / unit.maxHp
				unit.level = level
				unit.maxHp = unit.definition.base.hp * (1 + tune.levels.growth * (level - 1))
				unit.hp = unit.dead ? 0 : unit.maxHp * fraction
			}
			present({ type: 'levelUp', team: hero.team, level, point: { ...hero.body.position } })
			return true
		},
		spawnHero({ team, heroId, bot = false, difficulty = 'normal' }, nearId) {
			if (
				!['A', 'B'].includes(team) ||
				!heroDefinition(heroId).playable ||
				heroes.length >= tune.testing.rosterMax
			)
				return false
			const local = heroes.find((h) => h.id === nearId)
			const origin = local?.body.position ?? { x: 0, z: 0 }
			const count = heroes.filter((h) => h.team === team).length
			const spawn = clampWalkable(
				{
					x: origin.x + (team === local?.team ? -1 : 1) * layout.spawnSpacing,
					z: origin.z + count * layout.spawnSpacing,
				},
				profile.radius,
				tune.orders.clearance,
				obstacles,
				floor,
			)
			const seat = { id: `try-${++trainingSerial}`, team, heroId, difficulty }
			const hero = makeHero(seat, spawn)
			const level = lane?.teams[team].level ?? tune.hero.level
			hero.level = level
			hero.maxHp = hero.hp = hero.definition.base.hp * (1 + tune.levels.growth * (level - 1))
			hero.body.face(dirOf(hero.yaw))
			heroes.push(hero)
			if (bot) {
				botSeats.push(seat)
				rebuildBots()
			}
			present({ type: 'spawn', hero: hero.id, point: { ...hero.body.position } })
			return hero
		},
		clearHeroes(team, exceptId) {
			for (const hero of heroes.slice())
				if (hero.team === team && hero.id !== exceptId) removeHero(hero.id)
		},
		respawnNow(id) {
			const hero = heroes.find((h) => h.id === id)
			if (!hero?.dead || lane?.match.winner) return false
			respawn(hero)
			return true
		},
	}
}
