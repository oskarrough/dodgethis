import { afterEach, beforeEach, expect, test } from 'bun:test'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { buildCourt } from '../src/plugins/dodgeball/court.js'
import { createRound } from '../src/plugins/dodgeball/round.js'
import { createSharedMatch, frame } from './shared-match.js'
import { makeRng } from '../src/plugins/dodgeball/arena.js'
import { solveLaunch } from '../src/plugins/dodgeball/arrow.js'
import { tune } from '../src/plugins/dodgeball/tune.js'
import { tune as coreTune } from '../src/core/tune.js'

// Characterization: record what today's game does with a fixed script and pin it as a snapshot, so the plugin refactor can prove it changed nothing. Math.random is seeded because online rounds and grounded arrows still draw from it.
await RAPIER.init({})

const DT = 1 / 60
const r = (n) => {
	const v = Math.round(n * 1e4) / 1e4
	return Object.is(v, -0) ? 0 : v
}
const vec = (p) => (p ? { x: r(p.x), y: r(p.y ?? 0), z: r(p.z) } : null)
// Unit and arrow ids come from module-level counters, so they are recorded relative to the round's first ones.
const base = { unit: 0, arrow: 0 }
function rebase(round) {
	base.unit = Math.min(...round.units.map((u) => u.id))
	base.arrow = Math.min(...round.arrows.map((a) => a.id))
}
const unitId = (id) => (id === undefined ? undefined : id - base.unit)
const fact = (e) => ({
	type: e.type,
	arrowId: e.arrowId === undefined ? undefined : e.arrowId - base.arrow,
	kind: e.kind,
	outcome: e.outcome,
	surface: e.surface,
	source: unitId(e.source?.id),
	target: unitId(e.target?.id),
	point: vec(e.point),
	direction: vec(e.direction),
})

let random, saved
beforeEach(() => {
	random = Math.random
	Math.random = makeRng(1234)
	saved = {
		ai: tune.ai.enabled,
		godmode: tune.cheats.godmode,
		infiniteAmmo: tune.cheats.infiniteAmmo,
	}
	tune.ai.enabled = true
	tune.cheats.godmode = false
	tune.cheats.infiniteAmmo = false
})
afterEach(() => {
	Math.random = random
	tune.ai.enabled = saved.ai
	tune.cheats.godmode = saved.godmode
	tune.cheats.infiniteAmmo = saved.infiniteAmmo
})

// Closed-loop walking toward a waypoint keeps scripted humans on the court.
function steer(unit, x, z) {
	const dx = x - unit.position.x
	const dz = z - unit.position.z
	const len = Math.hypot(dx, dz)
	return len < 0.2 ? { x: 0, z: 0 } : { x: dx / Math.max(len, 1), z: dz / Math.max(len, 1) }
}

function world() {
	const scene = new THREE.Scene()
	const w = new RAPIER.World({ x: 0, y: coreTune.physics.gravity, z: 0 })
	w.timestep = DT
	buildCourt(scene, w, RAPIER)
	return { scene, world: w, queue: new RAPIER.EventQueue(true) }
}

test('scripted solo round: every shot and where it lands', () => {
	const { scene, world: w, queue } = world()
	const events = []
	const round = createRound(
		{
			scene,
			world: w,
			RAPIER,
			eventQueue: queue,
			combat: { push() {} },
			present: (e) => events.push(e),
		},
		{ enemies: 2, allies: 0, arrowCount: 5, seed: 42 },
	)
	rebase(round)
	const human = round.localPlayer
	const shots = []
	const byArrow = new Map()
	let tick = 0
	for (; tick < 60 * 40 && !round.over; tick++) {
		// Strafe between waypoints, dash every two seconds, shoot the nearest bot once a second.
		const before = events.length
		const move = steer(human, 3 * Math.sin(tick / 45), 8 + (tick % 240 < 120 ? -1 : 1))
		if (tick % 120 === 60) round.dashHuman(move)
		if (tick % 60 === 30 && human.alive && human.heldArrow) {
			const bot = round.units.find((u) => u.team === 'B' && u.alive)
			const dx = bot.position.x - human.position.x
			const dz = bot.position.z - human.position.z
			const dist = Math.hypot(dx, dz)
			round.looseHuman({ x: dx / dist, z: dz / dist }, solveLaunch(dist), { kind: 'arrow' })
		}
		round.step(DT, move)
		round.lateUpdate(DT)
		for (const e of events.slice(before)) {
			if (e.type === 'shot') {
				const shot = { tick, ...fact(e), landing: null }
				shots.push(shot)
				byArrow.set(shot.arrowId, shot)
			} else if (e.type === 'impact' && byArrow.get(e.arrowId - base.arrow)?.landing === null) {
				byArrow.get(e.arrowId - base.arrow).landing = { tick, ...fact(e) }
			}
		}
		// Launch speed as the physics body carries it after the first step.
		for (const s of shots)
			if (s.tick === tick)
				s.speed = r(round.arrows.find((a) => a.id - base.arrow === s.arrowId).velocity.length())
	}
	const result = {
		ticks: tick,
		over: round.over,
		winner: round.winner,
		shots,
		units: round.units.map((u) => ({
			id: unitId(u.id),
			alive: u.alive,
			position: vec(u.position),
		})),
	}
	expect(shots.length).toBeGreaterThan(3)
	expect(shots.some((s) => s.source === unitId(human.id))).toBe(true)
	expect(result).toMatchSnapshot()
	round.dispose()
	queue.free()
	w.free()
})

test('host plus guest round: fact stream and final positions', () => {
	const match = createSharedMatch({ present: (_, e) => fact(e) })
	const { host, guest } = match
	rebase(host.flow.round)
	const unit = (id) => host.flow.round.units.find((u) => u.participantId === id)
	// Each side walks, charges the bow at the other and releases; the guest also dashes and jumps.
	function script(side, tick) {
		const self = unit(side)
		const other = unit(side === 'host' ? 'guest' : 'host')
		const aim = { x: other.position.x, z: other.position.z }
		const phase = (tick + (side === 'guest' ? 50 : 0)) % 150
		const move =
			side === 'host'
				? steer(self, 3 * Math.sin(tick / 40), 8)
				: steer(self, 3 * Math.cos(tick / 55), -8)
		const pressed = []
		if (phase === 40) pressed.push('primary')
		else if (side === 'guest' && tick % 200 === 120) pressed.push('dash')
		else if (side === 'guest' && tick % 200 === 170) pressed.push('jump')
		return frame({ move, aim, held: phase >= 40 && phase < 100, pressed, released: phase === 100 })
	}
	let tick = 0
	for (; tick < 60 * 30 && host.flow.phase === 'playing'; tick++)
		match.tick({ host: script('host', tick), guest: script('guest', tick) })
	host.link.broadcast()
	match.deliver()
	guest.flow.round.lateUpdate(match.now())
	const positions = (flow) =>
		flow.round.units.map((u) => ({
			id: u.participantId,
			alive: u.alive,
			position: vec(u.position),
		}))
	const result = {
		ticks: tick,
		phase: host.flow.phase,
		winner: host.flow.winner,
		wins: host.flow.match.wins,
		hostFacts: host.facts,
		guestFacts: guest.facts,
		hostPositions: positions(host.flow),
		guestPositions: positions(guest.flow),
		cards: { host: host.cards, guest: guest.cards },
	}
	expect(result.hostFacts.filter((f) => f.type === 'shot').length).toBeGreaterThan(1)
	expect(result.guestFacts.length).toBeGreaterThan(0)
	expect(result).toMatchSnapshot()
	match.dispose()
})
