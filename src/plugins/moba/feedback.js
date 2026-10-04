import * as THREE from 'three'
import { abilityOf } from './ability.js'
import { heroDefinition } from './heroes.js'
import { tune } from './tune.js'

// Moba's fact switch (docs/moba-plan.md, "Hit feedback"): each fact becomes juice-kit verbs, sfx, rumble, pings and HUD.
// `local` is this machine's participant id; facts about anyone else get the quieter version.
export function createFeedback({ juice, sfx, camera, input, view, skillsView, hud, sim, local }) {
	const hitmarker = document.querySelector('.hitmarker')
	const _hm = new THREE.Vector3()
	function hitmark(kind, point) {
		if (!hitmarker) return
		_hm.set(point.x, point.y ?? 1, point.z).project(camera.view)
		hitmarker.style.left = `${((_hm.x + 1) / 2) * 100}%`
		hitmarker.style.top = `${((1 - _hm.y) / 2) * 100}%`
		hitmarker.classList.remove('near', 'kill')
		void hitmarker.offsetWidth
		hitmarker.classList.add(kind)
	}

	// Your own takedowns get a short hitstop; the core ignores it when the session is shared.
	let stop = 0
	let freeze = 0
	function beat(dt) {
		const elapsed = Math.max(0, Math.min(dt, 0.1))
		const frozen = Math.min(freeze, elapsed)
		freeze = Math.max(0, freeze - elapsed)
		const slowed = Math.min(stop, elapsed - frozen)
		stop = Math.max(0, stop - (elapsed - frozen))
		return elapsed > 0 ? 1 - (frozen + slowed * 0.9) / elapsed : 1
	}

	const unitOf = (id) =>
		sim.heroes.find((h) => h.id === id) ??
		sim.dummies.find((d) => d.id === id) ??
		sim.lane?.minions.find((u) => u.id === id) ??
		sim.lane?.structures.find((u) => u.id === id)

	let aggroPingTick = -1
	const sounded = new Map()
	function cue(name, fact, gain = 1) {
		const tick = fact.tick ?? sim.tick
		if (sounded.get(name) === tick) return
		sounded.set(name, tick)
		sfx[name]?.(fact.point, gain)
	}

	function present(fact) {
		const mine = fact.hero === local || fact.source === local
		const onMe = fact.target === local
		const source = unitOf(fact.hero ?? fact.source)
		const ability =
			abilityOf(fact.ability, source) ??
			(fact.ability ? null : (source?.definition ?? heroDefinition()).abilities[fact.slot])
		const effects = ability?.effects ?? {}
		switch (fact.type) {
			case 'ballContested':
				hud.banner?.('Ball contested! Clear the plaza')
				view.ping('move', fact.point)
				cue('ballContested', fact)
				return
			case 'ballWarn':
				hud.banner?.(`Ball at mid in ${Math.ceil(fact.seconds)} s`)
				cue('ballWarn', fact)
				return
			case 'ballSpawn':
				hud.banner?.('Ball is live! Stand on it to pick up')
				juice.burst(fact.point, { x: 0, y: 1, z: 0 }, tune.juice.ballBurst)
				cue('ballSpawn', fact)
				return
			case 'ballChannel':
				cue('ballChannel', fact, mine ? 1 : 0.4)
				return
			case 'ballPickup':
				hud.banner?.(
					`${mine ? 'You have' : fact.team === unitOf(local)?.team ? 'Your team has' : 'Enemy has'} the Ball!`,
				)
				unitOf(fact.hero)?.body.squash(tune.ballView.pickupSquash)
				cue('ballPickup', fact)
				return
			case 'ballWindup':
				unitOf(fact.hero)?.body.squash(tune.ballView.throwSquash)
				cue('ballWindup', fact)
				return
			case 'ballThrow':
				unitOf(fact.hero)?.body.kick(tune.ballView.radius)
				cue('ballThrow', fact)
				return
			case 'ballHit':
				if (fact.kind === 'structure') {
					const friendly = unitOf(fact.hero)?.team === unitOf(local)?.team
					hud.banner?.(
						`${friendly ? 'GOAL!' : 'Enemy scored!'} ${unitOf(fact.target)?.kind === 'fort' ? 'Fort' : unitOf(fact.target)?.kind === 'core' ? 'Core' : 'Tower'} silenced ${tune.ball.silence} s`,
					)
					freeze = Math.max(freeze, tune.juice.ballGoal.freeze)
					camera.shake(tune.juice.ballGoal.shake)
					camera.kick(tune.juice.ballGoal.kick)
					if (mine || onMe || unitOf(fact.target)?.team === unitOf(local)?.team)
						input.rumble(
							tune.juice.ballGoal.rumbleLow,
							tune.juice.ballGoal.rumbleHigh,
							tune.juice.ballGoal.rumbleMs,
						)
				} else juice.burst(fact.point, { x: 0, y: 1, z: 0 }, tune.juice.ballBurst)
				cue(fact.kind === 'structure' ? 'ballGoal' : 'ballHit', fact)
				return
			case 'ballBounce':
				if (fact.reason === 'shielded') sim.laneView?.shield(unitOf(fact.target)?.body)
				view.ping('move', fact.point)
				cue('ballBounce', fact)
				return
			case 'ballDrop':
				if (mine && fact.reason === 'death')
					hud.banner?.('You died carrying the Ball · Ball dropped')
				juice.burst(fact.point, { x: 0, y: 1, z: 0 }, tune.juice.ballDrop)
				cue('ballDrop', fact)
				return
			case 'ballPop':
				if (fact.reason === 'spent') return // structure hit owns the confetti and its cue
				juice.burst(fact.point, { x: 0, y: 1, z: 0 }, tune.juice.ballBurst)
				cue('ballPop', fact)
				return
			case 'ballInterrupted':
			case 'ballDenied':
				view.ping('move', fact.point)
				if (mine) hud.deny('slot1')
				cue(fact.type, fact, mine ? 1 : 0.4)
				return
			case 'order': {
				if (fact.hero !== local) return
				const attack = fact.kind === 'attack'
				view.ping(fact.kind, fact.point, {
					follow: attack ? fact.target : null,
					size: fact.repeat ? 0.55 : 1,
				})
				if (!fact.repeat) sfx.tick(attack ? 0.5 : 0)
				return
			}
			case 'cast':
				source?.body.squash(
					fact.slot === 'primary' && !effects.pose
						? tune.juice.attackSquash
						: ({
								draw: tune.juice.castSquash,
								vault: tune.juice.vaultSquash,
								rain: tune.juice.rainSquash,
							}[effects.pose] ?? 0),
				)
				if (effects.cast) cue(effects.cast, fact, mine ? 1 : 0.45)
				if (effects.effect === 'vault') {
					skillsView?.vault(fact.point, fact.direction, ability.stats)
					juice.burst(fact.point, { ...fact.direction, y: 0 }, { count: 8, streak: true })
				} else if (effects.effect === 'rain' && mine) skillsView?.rain(fact.target, ability.stats)
				else if (tune.juice[effects.effect])
					juice.burst(fact.point, { ...fact.direction, y: 0 }, tune.juice[effects.effect])
				return
			case 'projectile': {
				const shot = sim.shots.find((s) => s.id === fact.id)
				if (shot) view.bolt(shot, fact.point)
				if (tune.juice[effects.projectile])
					juice.burst(fact.point, { ...fact.direction, y: 0 }, tune.juice[effects.projectile])
				unitOf(fact.hero)?.body.kick(0.18)
				cue(
					['tower', 'fort', 'core', 'ranged', 'wizard'].includes(fact.slot)
						? fact.slot
						: fact.slot === 'primary'
							? 'attack'
							: effects.projectile,
					fact,
					mine ? 1 : 0.45,
				)
				return
			}
			case 'expired': {
				const bolt = view.unbolt(fact.projectile)
				if (bolt) fizzle([bolt])
				return
			}
			case 'aggro':
				sim.laneView?.aggro(unitOf(fact.source)?.body)
				if (onMe && aggroPingTick !== fact.tick) {
					aggroPingTick = fact.tick
					view.ping('aggro', fact.point, { follow: local, size: tune.laneView.aggroPing })
				}
				return
			case 'xp':
				if (fact.passive || fact.team !== unitOf(local)?.team) return
				view.xp?.(fact.amount, fact.point)
				cue('xp', fact)
				return
			case 'shielded':
				view.unbolt(fact.projectile)
				sim.laneView?.shield(unitOf(fact.target)?.body)
				cue('shielded', fact)
				return
			case 'levelUp': {
				const hero = unitOf(local)
				if (fact.team !== hero?.team) return
				// Shared XP may level us at base: the pop and sound belong at our hero, not the kill.
				const point = hero.body.mesh.position
				if (!hero.dead) juice.burst(point, { x: 0, y: 1, z: 0 }, tune.juice.levelUp)
				cue('levelUp', { ...fact, point })
				return
			}
			case 'globe':
				if (fact.state === 'expired') {
					view.ping('move', fact.point)
					return
				}
				juice.burst(fact.point, { x: 0, y: 1, z: 0 }, tune.juice.globe)
				cue('globe', fact)
				return
			case 'matchOver':
				juice.burst(fact.point, { x: 0, y: 1, z: 0 }, tune.juice.matchOver)
				cue('matchOver', fact)
				camera.kick(tune.juice.winKick)
				return
			case 'structureDown':
				juice.burst(fact.point, { x: 0, y: 1, z: 0 }, tune.juice.structureDown)
				cue('structureDown', fact)
				hud.banner?.(
					unitOf(fact.target)?.team === unitOf(local)?.team
						? `Your ${unitOf(fact.target).kind} fell`
						: `Enemy ${unitOf(fact.target)?.kind ?? 'structure'} destroyed`,
				)
				camera.kick(tune.juice.structureKick)
				camera.shake(tune.juice.structureShake)
				return
			case 'blocked':
				view.unbolt(fact.projectile) // Prevent the generic expiry fizzle from also firing.
				juice.burst(
					fact.point,
					{ x: -fact.direction.x, y: 0, z: -fact.direction.z },
					tune.juice.blocked,
				)
				cue('blocked', fact)
				return
			case 'impact':
				juice.burst(
					fact.point,
					{ x: 0, y: 1, z: 0 },
					tune.juice[effects.impact] ?? { count: 20, speed: 3, life: 0.35, size: 0.1 },
				)
				cue(effects.impact, fact) // once per tick, including multi-target impacts
				return
			case 'hit': {
				view.unbolt(fact.projectile)
				const unit = unitOf(fact.target)
				if (unit) {
					juice.flash(unit.body.visual, tune.juice.flash)
					unit.body.squash(0.28)
				}
				juice.burst(
					fact.point,
					fact.direction,
					tune.juice[effects.hit] ?? { count: 6, speed: 1.4, life: 0.3, size: 0.07 },
				)
				if (fact.slot !== 'ball' && !effects.impact)
					cue(
						['tower', 'fort', 'core', 'melee', 'ranged', 'wizard', 'brute'].includes(fact.slot)
							? fact.slot
							: fact.slot === 'primary'
								? 'attackHit'
								: effects.hit,
						fact,
					)
				if (onMe) {
					camera.shake(tune.juice.shakeTaken)
					input.rumble(0.2, 0.3, 60)
				}
				if (mine) {
					hitmark('near', fact.point)
					input.rumble(0.1, 0.2, 40)
				}
				return
			}
			case 'nearMiss':
				// The close cue plays for both players; the shooter also gets a cream streak along the pass.
				if (mine) {
					sfx.close(fact.point)
					const shot = sim.shots.find((s) => s.id === fact.projectile)
					if (shot)
						juice.mark(fact.point.x, 0.03, fact.point.z, Math.atan2(shot.dx, shot.dz), {
							width: 0.08,
							length: 0.9,
							life: 0.8,
							cream: true,
						})
				}
				if (onMe) sfx.whoosh(fact.point, 1 - Math.min(1, fact.distance / tune.loose.nearMiss))
				return
			case 'death': {
				const unit = unitOf(fact.target)
				const corpse = unit?.corpse ?? unit?.body
				if (unit?.structure) return // The sim already replaced it with solid rubble.
				if (corpse) juice.retire(corpse.visual, { radius: corpse.radius })
				juice.burst(fact.point, fact.direction, {
					count: 12,
					speed: 3,
					life: 0.4,
					lifeStep: 0.06,
					size: 0.1,
					sizeStep: 0.025,
				})
				if (onMe) {
					camera.shake(tune.juice.shakeTakedown)
					input.rumble(0.35, 0.6, 85)
				}
				if (mine && !onMe) {
					camera.kick(2)
					stop = tune.juice.hitstop
					camera.shake(tune.juice.shakeTakedown)
					hitmark('kill', fact.point)
					input.rumble(0.35, 0.6, 85)
				}
				return
			}
			case 'spawn': {
				unitOf(fact.target)?.body.squash(0.35)
				juice.burst({ ...fact.point, y: 0.2 }, { x: 0, y: 1, z: 0 }, { count: 5, speed: 0.8 })
				return
			}
			case 'boardExpired':
			case 'caught':
			case 'catchExpired':
			case 'channelCancelled':
			case 'channelEnd':
				juice.burst(fact.point, { x: 0, y: 1, z: 0 }, tune.juice[fact.type])
				cue(fact.type, fact, mine ? 1 : 0.45)
				return
			case 'denied':
				if (fact.hero === local) hud.deny(fact.slot)
				return
		}
	}

	// Skillshots that ran out of range fizzle where they stopped.
	function fizzle(gone) {
		for (const b of gone) {
			if (!b) continue
			const p = b.mesh.position
			juice.burst(
				{ x: p.x, y: p.y, z: p.z },
				{ x: b.shot.dx, y: 0, z: b.shot.dz },
				{ count: 2, speed: 0.6 },
			)
		}
	}

	return {
		present,
		fizzle,
		beat,
		reset() {
			stop = 0
			freeze = 0
			aggroPingTick = -1
			sounded.clear()
		},
	}
}
