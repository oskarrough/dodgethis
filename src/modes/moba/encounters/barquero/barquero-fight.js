import { STEP } from '../../../../core/app.js'
import { tune } from '../../tune.js'
import { distance } from '../../../../core/spatial.js'

const ticks = (s) => Math.max(1, Math.round(s / STEP))

// Bring Tara down the road to Barquero's ferry. The idol (`idol`, with `leg`, the road point it
// rolls toward) moves while someone stands in its ring and for a moment after; hounds come in
// packs and run at the pusher. The fight is `idle` until the first push, then `engaged`. If the
// whole party falls, the hounds scatter and Tara rolls home. Won when Tara reaches the ferry.
export function createBarquero({ heroes, spot, lane, makeMinion }) {
	const g = () => tune.encounters.barquero
	const road = () => g().road.map((o) => ({ x: spot.x + o.x, z: spot.z + o.z }))
	const idol = { ...road()[0], leg: 1 }
	const state = { phase: 'idle', rollsUntil: 0, nextPack: 0, dune: 0, delivered: false }
	const hounds = []
	let made = 0
	const living = () => heroes.filter((h) => !h.dead)
	const pushers = () => living().filter((h) => distance(h.body.position, idol) <= g().ring)
	function roll(t, dt) {
		if (pushers().length) state.rollsUntil = t + ticks(g().coast)
		if (t >= state.rollsUntil) return
		let left = g().speed * dt
		const points = road()
		while (left > 0 && idol.leg < points.length) {
			const to = points[idol.leg]
			const d = distance(idol, to)
			if (d <= left) {
				Object.assign(idol, { x: to.x, z: to.z })
				idol.leg++
				left -= d
			} else {
				idol.x += ((to.x - idol.x) / d) * left
				idol.z += ((to.z - idol.z) / d) * left
				left = 0
			}
		}
		state.delivered = idol.leg >= points.length
	}
	function loose(t) {
		if (t < state.nextPack) return
		state.nextPack = t + ticks(g().every)
		for (let i = 0; i < g().pack && hounds.filter((h) => !h.dead).length < g().most; i++) {
			const o = g().dunes[state.dune++ % g().dunes.length]
			const at = { x: spot.x + o.x, z: spot.z + o.z }
			const hound = {
				id: `hound-${++made}`,
				passive: true,
				lane: 'barquero',
				route: [{ ...at }, { ...at }],
				routeLeg: 1,
				file: 0,
				team: 'N',
				kind: 'melee',
				hp: g().hound.hp,
				maxHp: g().hound.hp,
				damageScale: g().hound.damage,
				dead: false,
				body: makeMinion(at.x, at.z, 'N', 'melee'),
				target: null,
				forced: null,
				aggroUntil: 0,
				attackTick: 0,
				attack: null,
				statuses: [],
			}
			hounds.push(hound)
			lane.minions.push(hound)
		}
	}
	// Every hound runs at the nearest pusher, or the nearest hero when no one pushes.
	function hunt(t) {
		const prey = pushers().length ? pushers() : living()
		for (const hound of hounds) {
			if (hound.dead) continue
			const at = hound.body.position
			const foe = [...prey].sort(
				(a, b) =>
					distance(a.body.position, at) - distance(b.body.position, at) || a.id.localeCompare(b.id),
			)[0]
			if (!foe) continue
			// A hound walks its route at its prey until it is near enough to bite, and never leashes.
			const to = foe.body.position
			hound.route = [
				{ x: at.x, z: at.z },
				{ x: to.x, z: to.z },
			]
			hound.routeLeg = 1
			hound.aggroOrigin = { x: at.x, z: at.z }
			hound.forced = foe.id
			hound.aggroUntil = t + 2
		}
	}
	function scatter() {
		for (const hound of hounds) hound.dead = true
		hounds.length = 0
	}
	function step(t, dt) {
		if (state.delivered) return
		if (state.phase === 'idle') {
			if (!pushers().length) return
			state.phase = 'engaged'
			state.nextPack = t
		}
		if (!living().length) {
			// The fallen of a lost push rise at their waystone, as after any wipe.
			for (const h of heroes) h.respawnTick = t + ticks(tune.waystone.rise)
			scatter()
			Object.assign(idol, road()[0], { leg: 1 })
			Object.assign(state, { phase: 'idle', rollsUntil: 0 })
			return
		}
		roll(t, dt)
		if (state.delivered) {
			scatter()
			state.phase = 'ended'
			return
		}
		loose(t)
		hunt(t)
	}
	return {
		spot,
		state,
		idol,
		road,
		units: [],
		step,
		won: () => state.delivered,
		// What bots see: Tara and where it rolls next, and the hounds still running.
		botView: () => ({
			phase: state.phase,
			idol: { x: idol.x, z: idol.z },
			ahead: road()[Math.min(idol.leg, road().length - 1)],
			hounds: hounds
				.filter((h) => !h.dead)
				.map((h) => ({ id: h.id, pos: { x: h.body.position.x, z: h.body.position.z } })),
		}),
	}
}
