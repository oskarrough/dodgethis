import * as THREE from 'three'
import { structureName } from './gates.js'
import { STEP } from '../../core/app.js'
import { abilityOf } from './ability.js'
import { heroDefinition } from './heroes.js'
import { tune } from './tune.js'
import { look } from './look.js'
import { flagfallLayoutTune } from './maps/flagfall.js'

// Moba's fact switch (docs/moba-plan.md, "Hit feedback"): each fact becomes juice-kit verbs, sfx, rumble, pings and HUD.
// `local` is this machine's participant id; facts about anyone else get the quieter version.
export function createFeedback({
	juice,
	sfx,
	camera,
	input,
	view,
	skillsView,
	hud,
	sim,
	local,
	stamps,
}) {
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
	const later = [] // { left, run }: presentation timed to an animation, like a splash on landing
	function beat(dt) {
		const elapsed = Math.max(0, Math.min(dt, 0.1))
		for (let i = later.length - 1; i >= 0; i--)
			if ((later[i].left -= elapsed) <= 0) later.splice(i, 1)[0].run()
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
	let pingedAt = -Infinity // the sim tick of the last order ring
	const sounded = new Map()
	function cue(name, fact, gain = 1, ...extra) {
		const tick = fact.tick ?? sim.tick
		if (sounded.get(name) === tick) return
		sounded.set(name, tick)
		sfx[name]?.(fact.point, gain, ...extra)
	}

	// Streaks count per team. No banner for the hero who is out; the recap says so.
	const streaks = new Map() // team → { count, tick }
	const titleCase = (word) => word[0].toUpperCase() + word.slice(1)
	function who(unit, subject) {
		const localTeam = unitOf(local)?.team
		const said = (text) => (subject ? titleCase(text) : text)
		if (!unit) return said('the enemy')
		if (unit.id === local) return said('you')
		const side = unit.team === localTeam ? 'ally' : 'enemy'
		if (unit.definition) return said(`${side} ${titleCase(unit.definition.id)}`)
		if (unit.structure)
			return said(`${unit.team === localTeam ? 'your' : 'enemy'} ${structureName(unit.kind)}`)
		return said(`${side} minions`)
	}
	function ruling(fact, unit, mine, onMe, verb = 'got', after = ' out') {
		const taker = unitOf(fact.source)
		const team = taker?.team ?? (unit.team === 'A' ? 'B' : 'A')
		const tick = fact.tick ?? sim.tick
		const last = streaks.get(team)
		const count = last && (tick - last.tick) * STEP <= look.out.streak ? last.count + 1 : 1
		streaks.set(team, { count, tick })
		const hero = sim.heroes.includes(unit)
		const side = sim.heroes.filter((h) => h.team === unit.team)
		const wiped = hero && side.length > 1 && side.every((h) => h.dead)
		stamps?.stamp(fact.point, {
			team,
			tilt: ((tick * 7919) % 201) / 100 - 1,
			onLand(at) {
				juice.burst({ x: at.x, y: 0.1, z: at.z }, { x: 0, y: 1, z: 0 }, look.out.splat)
				if (mine && !onMe) camera.kick(look.out.kick)
			},
		})
		cue('whistle', fact, mine || onMe ? 1 : 0.5, wiped ? 3 : count)
		if (hero && !onMe)
			hud.banner?.(
				!wiped
					? `${who(taker, true)} ${verb} ${who(unit)}${after}`
					: unit.team === unitOf(local)?.team
						? 'All out! Your whole team is out'
						: 'All out! The whole enemy team is out',
			)
	}

	// Your sneakers squeak when you reverse out of a run: read once per sim tick against the last running velocity,
	// since a reversal passes through a near stop. A cooldown and fatigue keep it rare.
	const squeak = { tick: -1, x: 0, z: 0, ran: -Infinity, at: -Infinity, recent: [] }
	function stride(hero) {
		if (!hero || sim.tick === squeak.tick) return
		squeak.tick = sim.tick
		const seconds = sim.tick * STEP
		const { speed, window, cooldown, fatigue, quieter } = look.squeak
		const top = (hero.definition?.base?.speed ?? tune.hero.speed) * (hero.body.speedMul ?? 1)
		const v = hero.dead ? { x: 0, z: 0 } : hero.body.velocity
		const now = Math.hypot(v.x, v.z)
		const was = Math.hypot(squeak.x, squeak.z)
		const turned =
			seconds - squeak.ran <= window &&
			now >= speed * top * 0.5 &&
			(squeak.x * v.x + squeak.z * v.z) / Math.max(1e-6, was * now) <=
				Math.cos((look.squeak.turn * Math.PI) / 180)
		if (now >= speed * top) {
			squeak.x = v.x
			squeak.z = v.z
			squeak.ran = seconds
		}
		if (!turned || seconds - squeak.at < cooldown) return
		squeak.ran = -Infinity
		squeak.recent = squeak.recent.filter((at) => seconds - at < fatigue)
		const gain = quieter ** squeak.recent.length
		squeak.recent.push(seconds)
		squeak.at = seconds
		sfx.squeak(hero.body.mesh.position, gain, 0.85 + 0.3 * Math.min(1, was / Math.max(1e-3, top)))
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
				hud.banner?.('Ball contested! Clear the lobby')
				view.ping('move', fact.point)
				cue('ballContested', fact)
				return
			case 'ballWarn':
				hud.banner?.(`Ball at mid in ${Math.ceil(fact.seconds)} s`)
				cue('ballWarn', fact)
				return
			case 'ballSpawn':
				hud.banner?.('Ball is live! Stand on it to pick up')
				juice.burst(fact.point, { x: 0, y: 1, z: 0 }, look.juice.ballBurst)
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
						`${friendly ? 'GOAL!' : 'Enemy scored!'} ${unitOf(fact.target)?.kind === 'core' ? 'Core' : 'Tower'} silenced ${tune.ball.silence} s`,
					)
					freeze = Math.max(freeze, look.juice.ballGoal.freeze)
					camera.shake(look.juice.ballGoal.shake)
					camera.kick(look.juice.ballGoal.kick)
					if (mine || onMe || unitOf(fact.target)?.team === unitOf(local)?.team)
						input.rumble(
							look.juice.ballGoal.rumbleLow,
							look.juice.ballGoal.rumbleHigh,
							look.juice.ballGoal.rumbleMs,
						)
				} else juice.burst(fact.point, { x: 0, y: 1, z: 0 }, look.juice.ballBurst)
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
				juice.burst(fact.point, { x: 0, y: 1, z: 0 }, look.juice.ballDrop)
				cue('ballDrop', fact)
				return
			case 'ballPop':
				if (fact.reason === 'spent') return // structure hit owns the confetti and its cue
				juice.burst(fact.point, { x: 0, y: 1, z: 0 }, look.juice.ballBurst)
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
				if (fact.repeat && sim.tick - pingedAt < tune.orders.repeatPing / STEP - 1e-9) return
				pingedAt = sim.tick
				const attack = fact.kind === 'attack'
				view.ping(fact.kind, fact.point, {
					follow: attack ? fact.target : null,
					size: fact.repeat ? 0.55 : fact.kind === 'attack-move' ? 1.4 : 1,
				})
				return
			}
			case 'cast':
				source?.body.squash(
					fact.slot === 'primary' && !effects.pose
						? look.juice.attackSquash
						: ({
								draw: look.juice.castSquash,
								vault: look.juice.vaultSquash,
								rain: look.juice.rainSquash,
							}[effects.pose] ?? 0),
				)
				if (effects.cast) cue(effects.cast, fact, mine ? 1 : 0.45)
				if (effects.effect === 'vault') {
					skillsView?.vault(fact.point, fact.direction, ability.stats)
					juice.burst(fact.point, { ...fact.direction, y: 0 }, { count: 8, streak: true })
				} else if (effects.effect === 'rain') {
					if (mine) skillsView?.rain(fact.target, ability.stats)
				} else if (look.juice[effects.effect])
					juice.burst(fact.point, { ...fact.direction, y: 0 }, look.juice[effects.effect])
				return
			case 'projectile': {
				source?.body.releaseAbilityPose?.(
					fact.ability === 'return' ? (source.definition?.returnPose ?? 'draw') : effects.pose,
					fact.tick ?? sim.tick,
				)
				const shot = sim.shots.find((s) => s.id === fact.id)
				if (shot) view.bolt(shot, fact.point)
				if (look.juice[effects.projectile])
					juice.burst(fact.point, { ...fact.direction, y: 0 }, look.juice[effects.projectile])
				unitOf(fact.hero)?.body.kick(0.18)
				cue(
					['tower', 'core', 'ranged', 'wizard'].includes(fact.slot)
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
					view.ping('aggro', fact.point, { follow: local, size: look.laneView.aggroPing })
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
				if (!hero.dead) juice.burst(point, { x: 0, y: 1, z: 0 }, look.juice.levelUp)
				cue('levelUp', { ...fact, point })
				return
			}
			case 'globe':
				if (fact.state === 'expired') {
					view.ping('move', fact.point)
					return
				}
				juice.burst(fact.point, { x: 0, y: 1, z: 0 }, look.juice.globe)
				cue('globe', fact)
				return
			case 'matchOver':
				juice.burst(fact.point, { x: 0, y: 1, z: 0 }, look.juice.matchOver)
				cue('matchOver', fact)
				camera.kick(look.juice.winKick)
				return
			case 'structureDown':
				juice.burst(fact.point, { x: 0, y: 1, z: 0 }, look.juice.structureDown)
				cue('structureDown', fact)
				hud.banner?.(
					unitOf(fact.target)?.team === unitOf(local)?.team
						? `Your ${unitOf(fact.target).kind} fell`
						: `Enemy ${unitOf(fact.target)?.kind ?? 'structure'} destroyed`,
				)
				camera.kick(look.juice.structureKick)
				camera.shake(look.juice.structureShake)
				return
			case 'blocked':
				view.unbolt(fact.projectile) // Prevent the generic expiry fizzle from also firing.
				juice.burst(
					fact.point,
					{ x: -fact.direction.x, y: 0, z: -fact.direction.z },
					look.juice.blocked,
				)
				cue('blocked', fact)
				return
			case 'impact':
				juice.burst(
					fact.point,
					{ x: 0, y: 1, z: 0 },
					look.juice[effects.impact] ?? { count: 20, speed: 3, life: 0.35, size: 0.1 },
				)
				cue(effects.impact, fact) // once per tick, including multi-target impacts
				if (mine && fact.hit && effects.impact === 'rain') camera.shake(look.juice.shakeRain)
				return
			case 'hit': {
				view.unbolt(fact.projectile)
				const unit = unitOf(fact.target)
				if (unit) {
					juice.flash(unit.body.visual, look.juice.flash)
					unit.body.squash(0.28)
					unit.body.wobble?.(fact.direction)
				}
				juice.burst(
					fact.point,
					fact.direction,
					look.juice[effects.hit] ?? { count: 6, speed: 1.4, life: 0.3, size: 0.07 },
				)
				if (fact.slot !== 'ball' && !effects.impact)
					cue(
						['tower', 'core', 'melee', 'ranged', 'wizard', 'brute'].includes(fact.slot)
							? fact.slot
							: fact.slot === 'primary'
								? 'attackHit'
								: effects.hit,
						fact,
					)
				if (mine) view.damage?.(fact)
				if (mine && fact.crit) camera.shake(look.juice.shakeTaken)
				if (onMe) {
					camera.shake(look.juice.shakeTaken)
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
				corpse?.resetAbilityPose?.()
				if (unit?.structure) return // The sim already replaced it with solid rubble.
				if (corpse)
					juice.retire(corpse.visual, {
						radius: corpse.radius,
						style: 'card',
						direction: fact.direction,
						card: look.card,
					})
				juice.burst(fact.point, fact.direction, {
					count: 12,
					speed: 3,
					life: 0.4,
					lifeStep: 0.06,
					size: 0.1,
					sizeStep: 0.025,
				})
				cue('cardSlap', fact, mine || onMe ? 1 : 0.4)
				if (unit && (sim.heroes.includes(unit) || sim.dummies.includes(unit)))
					ruling(fact, unit, mine, onMe)
				if (onMe) {
					camera.shake(look.juice.shakeTakedown)
					input.rumble(0.35, 0.6, 85)
				}
				// Your takedown: hitstop now, then the camera kicks when the stamp lands. No shake.
				if (mine && !onMe) {
					stop = look.juice.hitstop
					hitmark('kill', fact.point)
					input.rumble(0.35, 0.6, 85)
				}
				return
			}
			case 'shove': {
				const unit = unitOf(fact.target)
				juice.burst(
					{ ...fact.point, y: 0.1 },
					{ x: -fact.direction.x, y: 0, z: -fact.direction.z },
					tune.flagfall.dunk.scuff,
				)
				unit?.body.lean(fact.direction, 40)
				cue('shove', fact, mine || onMe ? 1 : 0.5)
				return
			}
			case 'dunk': {
				const unit = unitOf(fact.target)
				const corpse = unit?.corpse ?? unit?.body
				corpse?.resetAbilityPose?.()
				const d = tune.flagfall.dunk
				const layout = flagfallLayoutTune()
				const flank = fact.point.z < 0 ? -1 : 1
				// Out, not along: keep the shove's sideways drift but always clear the rim.
				const out = Math.max(Math.abs(fact.direction.z), 0.75)
				const length = Math.hypot(fact.direction.x, out)
				const direction = { x: fact.direction.x / length, y: 0, z: (flank * out) / length }
				const reach =
					(layout.bounds.halfZ + d.flight - Math.abs(fact.point.z)) / Math.abs(direction.z)
				const water = -layout.water.drop * layout.scale
				const splashAt = {
					x: fact.point.x + direction.x * reach,
					y: water,
					z: fact.point.z + direction.z * reach,
				}
				if (corpse)
					juice.retire(corpse.visual, {
						radius: corpse.radius,
						style: 'overboard',
						direction,
						overboard: { reach, hop: d.hop, time: d.fly, sink: d.sink, water },
					})
				later.push({
					left: d.fly,
					run() {
						juice.burst(splashAt, { x: 0, y: 1, z: 0 }, d.splash)
						juice.burst(splashAt, direction, d.spray)
						cue('plunk', { ...fact, point: splashAt }, mine || onMe ? 1 : 0.5)
						sfx.splash?.(splashAt, mine || onMe ? 1 : 0.5)
						if (onMe || mine) camera.shake(look.juice.shakeTakedown)
					},
				})
				if (unit) ruling(fact, unit, mine, onMe, 'dunked', '')
				if (onMe) input.rumble(0.35, 0.6, 85)
				if (mine && !onMe) {
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
				juice.burst(fact.point, { x: 0, y: 1, z: 0 }, look.juice[fact.type])
				cue(fact.type, fact, mine ? 1 : 0.45)
				return
			case 'denied':
				if (fact.reason === 'cancelled') source?.body.resetAbilityPose?.()
				if (fact.hero === local) hud.deny(fact.slot)
				return
		}
	}

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
		stride,
		reset() {
			for (const hero of sim.heroes) hero.body.resetAbilityPose?.()
			for (const dummy of sim.dummies) dummy.body.resetAbilityPose?.()
			stop = 0
			freeze = 0
			later.length = 0
			aggroPingTick = -1
			sounded.clear()
			streaks.clear()
			stamps?.reset()
			squeak.tick = -1
			squeak.x = squeak.z = 0
			squeak.ran = squeak.at = -Infinity
			squeak.recent.length = 0
		},
	}
}
