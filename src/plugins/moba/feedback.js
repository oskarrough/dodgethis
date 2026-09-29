import * as THREE from 'three'
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
	function beat(dt) {
		const elapsed = Math.max(0, Math.min(dt, 0.1))
		const slowed = Math.min(stop, elapsed)
		stop = Math.max(0, stop - elapsed)
		return elapsed > 0 ? 1 - (slowed / elapsed) * 0.9 : 1
	}

	const unitOf = (id) =>
		sim.heroes.find((h) => h.id === id) ??
		sim.dummies.find((d) => d.id === id) ??
		sim.lane?.minions.find((u) => u.id === id) ??
		sim.lane?.structures.find((u) => u.id === id)

	const sounded = new Map()
	function cue(name, fact, gain = 1) {
		const tick = fact.tick ?? sim.tick
		if (sounded.get(name) === tick) return
		sounded.set(name, tick)
		sfx[name](fact.point, gain)
	}

	function present(fact) {
		const mine = fact.hero === local || fact.source === local
		const onMe = fact.target === local
		switch (fact.type) {
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
				unitOf(fact.hero)?.body.squash(
					{
						primary: tune.juice.attackSquash,
						slot1: tune.juice.castSquash,
						slot2: tune.juice.vaultSquash,
						slot3: tune.juice.rainSquash,
					}[fact.slot] ?? 0,
				)
				if (fact.slot === 'slot2') {
					skillsView.vault(fact.point, fact.direction)
					cue('vault', fact, mine ? 1 : 0.45)
					juice.burst(fact.point, { ...fact.direction, y: 0 }, { count: 8, streak: true })
				} else if (fact.slot === 'slot3' && mine) skillsView.rain(fact.target)
				return
			case 'projectile': {
				const shot = sim.shots.find((s) => s.id === fact.id)
				if (shot) view.bolt(shot, fact.point)
				unitOf(fact.hero)?.body.kick(0.18)
				cue(
					['tower', 'ranged', 'wizard'].includes(fact.slot)
						? fact.slot
						: fact.slot === 'primary'
							? 'attack'
							: 'loose',
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
				view.ping('attack', fact.point, { follow: fact.target })
				return
			case 'xp':
				view.xp?.(fact.amount, fact.point)
				cue('xp', fact)
				return
			case 'structureDown':
				juice.burst(fact.point, { x: 0, y: 1, z: 0 }, tune.juice.structureDown)
				cue('structureDown', fact)
				camera.shake(tune.juice.shakeTakedown)
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
					{ count: 20, speed: 3, life: 0.35, size: 0.1 },
				)
				cue('rain', fact) // once per tick, including multi-target impacts
				return
			case 'hit': {
				view.unbolt(fact.projectile)
				const unit = unitOf(fact.target)
				if (unit) {
					juice.flash(unit.body.visual, tune.juice.flash)
					unit.body.squash(0.28)
				}
				juice.burst(fact.point, fact.direction, { count: 6, speed: 1.4, life: 0.3, size: 0.07 })
				if (fact.slot !== 'slot3')
					cue(
						['tower', 'melee', 'ranged', 'wizard'].includes(fact.slot)
							? fact.slot
							: fact.slot === 'primary'
								? 'attackHit'
								: 'looseHit',
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
			sounded.clear()
		},
	}
}
