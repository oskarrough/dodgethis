import { STEP } from '../../../../core/app.js'
import { tune } from '../../tune.js'
import encounters from '../../encounters/all-encounters.js'
import { createBossPull } from './dungeon-warden.js'

const ticks = (s) => Math.max(1, Math.round(s / STEP))
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

// An encounter folder without its own fight: a Warden under the encounter's name and HP.
function wardenStandIn(args, spot) {
	const pull = createBossPull({
		...args,
		encounter: {
			id: spot.id,
			name: encounters[spot.id].name,
			spawn: { x: spot.x, z: spot.z },
			hp: tune.encounters[spot.id].hp,
		},
	})
	return { ...pull, units: [pull.unit], won: () => pull.unit.dead && pull.state.phase === 'ended' }
}

// One run through a dungeon map. Each of `layout.encounters` (`{ id, x, z, wing, last }`) is a fight
// from its encounter folder: its `create` (a Warden stand-in without one) returns `state`, `step`,
// `won`, its `units`, and optionally threat, bot hooks and `unit`, its boss. The `last` sleeps until
// every encounter outside the wings is won and one of `layout.wings` is cleared; winning it ends the
// run. A wipe resets only the boss you fell to, and you rise at the last waystone you passed.
// `current()` is the encounter being fought, or else the next one; `bossUnit()` is its boss for the
// HUD bar, `engaged()` says a pull is on, and `addThreat` routes damage to the unit's own encounter.
export function createDungeon(args) {
	const { heroes, layout, lane } = args
	const list = layout.encounters.map((spot) => {
		const create = encounters[spot.id].create
		const fight = create ? create({ ...args, spot }) : wardenStandIn(args, spot)
		const entry = {
			...fight,
			id: spot.id,
			wing: spot.wing ?? null,
			last: !!spot.last,
			killed: false,
			dormant: false,
		}
		sleep(entry, !!spot.last)
		return entry
	})
	function sleep(entry, dormant) {
		entry.dormant = dormant
		for (const unit of entry.units) unit.dormant = dormant
	}
	const run = { endedTick: null }
	const engaged = () => list.find((e) => e.state.phase === 'engaged')
	// Bots take the encounters in map order; the last one first once it wakes.
	const next = () =>
		list.find((e) => e.last && !e.dormant && !e.killed) ?? list.find((e) => !e.killed && !e.dormant)
	const current = () => engaged() ?? next() ?? list.at(-1)
	// A boss stands in for the bar when the current encounter has none.
	const anyBoss = list.find((e) => e.unit)
	// The encounters outside the wings must all be won, and every one of one wing.
	const stairOpen = () =>
		list.every((e) => e.killed || e.last || layout.wings.includes(e.wing)) &&
		layout.wings.some((wing) => list.every((e) => e.wing !== wing || e.killed))
	function attune() {
		for (const h of heroes) {
			if (h.dead) continue
			const stone = layout.waystones.find(
				(w) => distance(h.body.position, w) <= tune.waystone.reach,
			)
			if (stone) h.spawn = { x: stone.x, z: stone.z }
		}
	}
	function step(t, dt) {
		if (run.endedTick != null) return
		attune()
		for (const entry of list) {
			if (entry.killed || entry.dormant) continue
			entry.step(t, dt)
			if (!entry.won()) continue
			entry.killed = true
			// The fight is won: whoever fell in it rises at their waystone.
			for (const h of heroes) if (h.dead) h.respawnTick = t + ticks(tune.waystone.rise)
			if (entry.last) {
				run.endedTick = t
				lane.match.winner = 'A'
				lane.match.endedTick = t
				return
			}
		}
		const last = list.find((e) => e.last)
		if (last?.dormant && stairOpen()) sleep(last, false)
	}
	return {
		encounters: list,
		run,
		units: list.flatMap((e) => e.units),
		current,
		engaged: () => !!engaged(),
		bossUnit: () => current().unit ?? anyBoss?.unit,
		step,
		addThreat(source, damage, unit) {
			list.find((e) => e.units.includes(unit))?.addThreat?.(source, damage)
		},
		addHealingThreat(source, amount) {
			for (const entry of list) entry.addHealingThreat?.(source, amount)
		},
	}
}
