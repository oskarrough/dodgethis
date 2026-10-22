import { STEP } from '../../core/app.js'
import { tune } from './tune.js'
import { copyData } from './agents.js'

const ticks = (s) => Math.max(1, Math.round(s / STEP))
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

export const ballBots = {
	botView(sim) {
		return { ball: sim.ball.state ? copyData(sim.ball.state) : null, nextBall: sim.ball.nextBall }
	},
	createBot() {
		let flankGoal = null,
			flankedBall = null
		let carrying = false
		return {
			botPerceive(ctx) {
				// Carrying and a committed throw are own state; objectives stay in the lagged ring.
				carrying = ctx.sim.ball.carrying(ctx.h)
				if (!carrying) {
					flankGoal = null
					flankedBall = null
				}
				const ball = ctx.perceived.ball
				return {
					skillsLocked: carrying,
					castBusy: !!ctx.h.ballThrow,
					moveScale: carrying ? tune.ball.carrySpeed : 1,
					preferredTargets:
						ball?.state === 'carried' && ball.team !== ctx.team ? [ball.carrier] : [],
				}
			},
			botThreats({ perceived, team }) {
				const threats = []
				if (perceived.ball?.state === 'flying' && perceived.ball.team !== team) {
					const s = perceived.ball.shot
					threats.push({
						key: `ball:${perceived.ball.id}`,
						from: { x: s.x, z: s.z },
						dir: { x: s.dx, z: s.dz },
						range: s.range - s.travelled,
						radius: s.radius,
						speed: s.speed,
						delay: 0,
						accepts: (kit) => kit.acceptBall,
					})
				}
				return threats
			},
			botGoals: {
				urgent(ctx) {
					if (!carrying) return null
					const { h, p, enemies, file, b, near, safe, move, frame, setState } = ctx
					const ball = ctx.perceived.ball
					// Public contributions can be absent; a carrier then falls through to combat/advance.
					const structure = ctx.objectives.find((u) => u.structure)
					const close = enemies
						.filter(
							(u) =>
								distance(u.pos, p) <= b.throwHeroRange &&
								(h.hp < h.maxHp * b.ballHp || u.hp <= tune.ball.heroDamage) &&
								safe(p, [u]),
						)
						.sort((a, c) => a.hp - c.hp || a.id.localeCompare(c.id))[0]
					const structureReach = structure
						? tune.ball.range + tune.ball.radius + structure.radius - b.throwMargin
						: 0
					const target =
						structure && distance(p, structure.pos) <= structureReach
							? structure
							: (close ?? structure)
					if (!target) return null
					setState('carrier')
					const reach = tune.ball.range + tune.ball.radius + target.radius - b.throwMargin
					if (
						distance(p, target.pos) <= reach &&
						!h.ballThrow &&
						safe(p, target === close ? [close] : [])
					) {
						frame.aim = { ...target.pos }
						frame.pressed = [{ action: 'primary', at: { ...target.pos } }]
					} else {
						const d = distance(p, target.pos) || 1
						if (
							target.structure &&
							flankedBall !== ball.id &&
							near(enemies, p, b.carrierDanger).length &&
							Math.abs(p.x) < tune.map.baseWallX &&
							distance(p, target.pos) > reach + b.carrierDanger
						) {
							const margin = h.body.radius + tune.orders.clearance
							const x =
								target.kind === 'tower'
									? tune.map.hedgeInnerX - margin
									: tune.map.baseWallX - margin
							flankGoal = {
								x: Math.sign(target.pos.x) * x,
								z: file < 0 ? -b.carrierFlank : b.carrierFlank,
							}
							flankedBall = ball.id
						}
						if (flankGoal) {
							if (distance(p, flankGoal) > b.goalTolerance) {
								move(flankGoal)
								return frame
							}
							flankGoal = null
						}
						move({
							x: target.pos.x + ((p.x - target.pos.x) / d) * (reach - tune.orders.arrival * 2),
							z: target.pos.z + ((p.z - target.pos.z) / d) * (reach - tune.orders.arrival * 2),
						})
					}
					return frame
				},
				objective(ctx) {
					const {
						h,
						p,
						enemies,
						own,
						now,
						id,
						side,
						file,
						b,
						target,
						near,
						move,
						frame,
						setState,
					} = ctx
					const ball = ctx.perceived.ball
					const preparing = ball?.state === 'warning' && ball.spawnAt - now <= ticks(b.ballPrepare)
					const objective = ball && ['loose', 'channel'].includes(ball.state)
					if (
						!(preparing || objective) ||
						h.hp <= h.maxHp * b.ballHp ||
						(preparing && target && distance(p, target.pos) <= b.fightRange)
					)
						return null
					const allies = near(own, ball.pos, b.supportRange),
						foes = near(enemies, ball.pos, b.supportRange)
					const contest =
						allies.length >= foes.length &&
						allies.reduce((s, u) => s + u.hp, 0) >
							foes.reduce((s, u) => s + u.hp, 0) * b.ballContestHp
					const nearest = [...own].sort(
						(a, c) =>
							distance(a.pos, ball.pos) - distance(c.pos, ball.pos) || a.id.localeCompare(c.id),
					)[0]
					if (
						(preparing && nearest?.id === id) ||
						(contest &&
							nearest?.id === id &&
							!near(enemies, ball.pos, tune.ball.pickup + h.body.radius).length)
					) {
						setState('ball')
						if (objective && distance(p, ball.pos) <= tune.ball.pickup) {
							// Preserve the committed tell; ordinary orders may still replan.
							if (!h.cast && !h.ballThrow && (h.order || h.attack))
								frame.pressed = [{ action: 'stop', at: null }]
						} else move(preparing ? { x: ball.pos.x + side * b.shadowRange, z: file } : ball.pos)
						return frame
					}
					if (objective && !target) {
						setState('ball')
						move({ x: ball.pos.x + side * b.shadowRange, z: file })
						return frame
					}
					return null
				},
				escort({ perceived, team, side, file, b, setState, move, frame }) {
					const ball = perceived.ball
					if (ball?.state !== 'carried' || ball.team !== team) return null
					setState('escort')
					move({ x: ball.pos.x - side * b.escortAhead, z: ball.pos.z + file })
					return frame
				},
			},
		}
	},
}
