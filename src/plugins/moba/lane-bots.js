import { STEP } from '../../core/app.js'
import { tune } from './tune.js'
import { walkable } from './obstacles.js'
import { laneRoute } from './maps/paths.js'

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

// This module owns its delayed population and all consequences of fighting under guns.
export const laneBots = {
	botView(sim, unit) {
		const laneUnit = (u) => ({
			...unit(u),
			structure: !!u.structure,
			lane: u.lane,
			vulnerable: !u.structure || sim.lane.vulnerable(u),
			silent: (u.silentUntil ?? 0) > sim.tick,
		})
		return {
			minions: sim.lane.minions.filter((u) => !u.dead).map(laneUnit),
			structures: sim.lane.structures.map(laneUnit),
			globes: sim.lane.globes.map((g) => ({ ...g, pos: { ...g.pos } })),
		}
	},
	createBot() {
		let lane
		return {
			botPerceive(ctx) {
				const { perceived, team, p, h, abilities, b, near } = ctx
				const guards = perceived.structures.filter((u) => !u.dead && u.team !== team)
				// A finished lane joins the remaining prerequisite, not an invulnerable core.
				if (ctx.route) {
					const core = guards.find((u) => u.kind === 'core')
					if (!guards.some((u) => u.lane === ctx.lanePath.id) && core && !core.vulnerable)
						ctx.lanePath =
							perceived.lanes.find((path) => guards.some((u) => u.lane === path.id)) ?? ctx.lanePath
					const path = [...ctx.lanePath.path]
					if (core) {
						// Enter the enemy courtyard before turning off the lane to its core.
						if (team === 'A') path.push(core.pos)
						else path.unshift(core.pos)
					}
					ctx.route = laneRoute(path, team, ctx.laneFile)
				}
				const onLane = (u) => !ctx.lanePath || !u.lane || u.lane === ctx.lanePath.id
				const minions = perceived.minions.filter(onLane)
				const structures = guards.filter((u) => u.vulnerable && onLane(u))
				if (ctx.route)
					structures.sort(
						(a, c) =>
							ctx.route.progress(a.pos) - ctx.route.progress(c.pos) || a.id.localeCompare(c.id),
					)
				const wave = minions.filter((u) => u.team === team)
				const guardOk = (at, victims = [], radius = 0) =>
					guards.every((g) => {
						// A silenced guard can't call for help.
						if (g.silent) return true
						const range = tune[g.kind].range
						if (
							distance(g.pos, at) > range + h.body.radius ||
							!victims.some((u) => distance(g.pos, u.pos) <= range + u.radius + radius)
						)
							return true
						const scale = 1 + tune.levels.growth * (h.level - 1)
						const burst =
							scale *
							((h.definition.basic?.damage ?? 0) * b.burstWindow +
								abilities
									.filter(
										([slot, a]) =>
											['shot', 'zone'].includes(a.kind) && !h.cd[Number(slot.slice(-1)) - 1],
									)
									.reduce((damage, [, a]) => damage + (a.stats.damage ?? 0), 0))
						return (
							victims.some((u) => u.hp <= burst) &&
							h.hp -
								b.towerExposure *
									tune[g.kind].damage *
									(perceived.tick * STEP >= tune.match.late ? tune.match.lateGunDamage : 1) >
								h.maxHp * b.retreatHp
						)
					})

				// Spend an already-paid screen before staging for a future Ball.
				const siege = structures[0]
				const escort = siege ? near(wave, siege.pos, tune[siege.kind].range) : []
				const escortStrength = escort.reduce(
					(count, u) => count + (u.kind === 'brute' ? b.bruteEscort : 1),
					0,
				)
				const tanked = siege && minions.some((u) => u.id === siege.target && u.team === team)
				// No one left to defend it: press on instead of waiting for a fuller wave.
				const open =
					siege &&
					!minions.some(
						(u) =>
							u.team !== team &&
							distance(u.pos, siege.pos) <= tune[siege.kind].range + tune.waves.aggro,
					) &&
					!near(ctx.enemies, siege.pos, b.supportRange).length
				// Without a wave the gun shoots us: dive only if it falls before we must leave.
				const gun =
					siege &&
					tune[siege.kind].damage *
						tune[siege.kind].rate *
						(perceived.tick * STEP >= tune.match.late ? tune.match.lateGunDamage : 1)
				const divers = siege ? near(ctx.own, siege.pos, b.supportRange).length || 1 : 0
				const dps =
					(1 + tune.levels.growth * (h.level - 1)) *
					(h.definition.basic?.damage ?? 0) *
					(h.definition.basic?.rate ?? 0) *
					divers
				const dive =
					open && !escort.length && dps > 0 && (siege.hp / dps) * gun < h.hp - h.maxHp * b.retreatHp
				const sieging =
					siege &&
					(siege.silent ||
						dive ||
						(tanked &&
							(open ||
								escortStrength >= b.siegeMinions ||
								(escortStrength > 0 && siege.hp <= siege.maxHp * b.siegeLowHp))))

				const home = perceived.structures.filter((u) => !u.dead && u.team === team && onLane(u))
				if (ctx.route)
					home.sort(
						(a, c) =>
							ctx.route.progress(c.pos) - ctx.route.progress(a.pos) || a.id.localeCompare(c.id),
					)
				const authored = ctx.lanePath && laneRoute(ctx.lanePath.path, team)
				const midpoint = authored && ctx.route.progress(authored.point(authored.midpoint))
				lane = { minions, wave, siege, sieging, open, homeGuard: home[0], midpoint }
				return {
					blockers: [...perceived.minions.filter((u) => u.team !== team), ...guards],
					pressure: guards.filter((u) => distance(u.pos, p) <= tune[u.kind].range + h.body.radius)
						.length,
					guardOk: [guardOk],
					objectives: structures,
				}
			},
			botGoals: {
				retreat(ctx) {
					const { perceived, team, p, side, h, b, sim, move, frame } = ctx
					const globe = perceived.globes.find(
						(g) =>
							g.team === team &&
							distance(g.pos, p) <= b.globeRange &&
							(ctx.route
								? ctx.route.progress(g.pos) <= ctx.route.progress(p)
								: side * (g.pos.x - p.x) >= 0) &&
							walkable(g.pos.x, g.pos.z, h.body.radius, 0, sim.obstacles),
					)
					move(globe?.pos ?? h.spawn)
					return frame
				},
				commitSiege(ctx) {
					const { file, b, target, safe, attackSpot, setState, attack, frame } = ctx
					const { siege, sieging } = lane
					// Only the centre file ignores a low hero it can safely finish.
					const finish =
						file !== b.siegeFile &&
						target &&
						target.hp < target.maxHp * b.chaseHp &&
						safe(attackSpot, [target])
					if (!sieging || finish || ctx.preferredTargets.includes(target?.id)) return null
					setState('push')
					attack(siege)
					return frame
				},
				defend(ctx) {
					const {
						team,
						p,
						zoneAbility,
						b,
						target,
						advantage,
						k,
						setState,
						cast,
						zoneSlot,
						attack,
						frame,
					} = ctx
					const { homeGuard } = lane
					const invaders = lane.minions.filter(
						(u) =>
							u.team !== team &&
							homeGuard &&
							distance(u.pos, homeGuard.pos) <= tune[homeGuard.kind].range &&
							distance(u.pos, p) <= (zoneAbility?.stats.range ?? b.fightRange),
					)
					if (!invaders.length || (target && advantage >= -k.aggression)) return null
					setState('defend')
					const focus = invaders.sort((a, c) => a.hp - c.hp || a.id.localeCompare(c.id))[0]
					if (
						invaders.length >= b.clearMinions &&
						distance(p, focus.pos) <= (zoneAbility?.stats.range ?? 0) &&
						cast(zoneSlot, focus.pos)
					)
						return frame
					attack(focus)
					return frame
				},
				siege({ setState, attack, frame }) {
					if (!lane.sieging) return null
					setState('push')
					attack(lane.siege)
					return frame
				},
				advance(ctx) {
					const { team, p, h, b, route, melee, move, attack, safe, frame, setState } = ctx
					if (!route) return null
					const { minions, wave, siege, open, homeGuard, midpoint } = lane
					setState('advance')
					if (siege && distance(p, siege.pos) <= tune[siege.kind].range + h.body.radius) {
						move(
							route.point(
								route.progress(siege.pos) -
									(tune[siege.kind].range + h.body.radius + b.siegeBackoff),
							),
						)
						return frame
					}
					const front = [...wave].sort(
						(a, c) => route.progress(c.pos) - route.progress(a.pos) || a.id.localeCompare(c.id),
					)[0]
					let progress = route.progress(front?.pos ?? homeGuard?.pos ?? h.spawn) - b.laneBehind
					// An empty enemy half invites the opening; otherwise follow our paid wave.
					if (!minions.some((u) => u.team !== team && route.progress(u.pos) < midpoint))
						progress = Math.max(progress, midpoint - b.openingX)
					// An undefended gun keeps us at its edge for the next wave, not back home.
					const edge =
						siege &&
						route.progress(siege.pos) - (tune[siege.kind].range + h.body.radius + b.siegeBackoff)
					if (open) progress = Math.max(progress, edge)
					const creep = minions
						.filter(
							(u) =>
								u.team !== team &&
								distance(u.pos, p) <=
									(melee ? b.fightRange : (h.definition.basic?.range ?? 0)) + u.radius,
						)
						.sort((a, c) => a.hp - c.hp || a.id.localeCompare(c.id))[0]
					if (creep && safe(p)) attack(creep)
					else move(route.point(progress))
					return frame
				},
			},
		}
	},
}
