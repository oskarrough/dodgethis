import { STEP } from '../../../../core/app.js'
import { tune } from '../../tune.js'
import encounters from '../../encounters/all-encounters.js'
import { createBossPull } from './dungeon-warden.js'
import { distance } from '../../../../core/spatial.js'

const ticks = (s) => Math.max(1, Math.round(s / STEP))
// An encounter is under way from its first stir until it ends or resets; its own words for that differ.
const fighting = (phase) => phase !== 'idle' && phase !== 'ended' && phase !== 'reset'

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
// run. A wipe resets only the boss you fell to, and you rise at the last waystone you passed; a
// waystone also mends whoever stands beside it while no boss fight is on.
// `current()` is the encounter being fought, or else the next one; `bossUnit()` is its boss for the
// HUD bar, `engaged()` says a pull is on, and `addThreat` routes damage to the unit's own encounter.
export function createDungeon(args) {
	const { heroes, layout, lane, present } = args
	const list = layout.encounters.map((spot) => {
		const create = encounters[spot.id].create
		const fight = create ? create({ ...args, spot }) : wardenStandIn(args, spot)
		// Onto the fight itself, so its getters (a twin fight's `unit`) stay live.
		const entry = Object.assign(fight, {
			id: spot.id,
			wing: spot.wing ?? null,
			last: !!spot.last,
			name: encounters[spot.id].name,
			killed: false,
			dormant: false,
			fighting: false,
		})
		sleep(entry, !!spot.last)
		return entry
	})
	function sleep(entry, dormant) {
		entry.dormant = dormant
		for (const unit of entry.units) unit.dormant = dormant
	}
	const run = { endedTick: null }
	const engaged = () => list.find((e) => !e.killed && e.state.phase === 'engaged')
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
	// `encounter` facts mark a boss fight's start and end for whoever keeps score (the damage meter).
	function announce(entry) {
		const now = fighting(entry.state.phase)
		if (now === entry.fighting) return
		entry.fighting = now
		present?.({
			type: 'encounter',
			state: now ? 'start' : 'end',
			id: entry.id,
			name: entry.name,
			...(!now && { result: entry.won() ? 'killed' : 'wiped' }),
		})
	}
	// A waystone you pass becomes where you rise, and while you stand beside it out of a boss fight,
	// it mends you.
	function attune(dt) {
		for (const h of heroes) {
			if (h.dead) continue
			const stone = layout.waystones.find(
				(w) => distance(h.body.position, w) <= tune.waystone.reach,
			)
			if (!stone) continue
			h.spawn = { x: stone.x, z: stone.z }
			if (!engaged()) h.hp = Math.min(h.maxHp, h.hp + (h.maxHp * dt) / tune.waystone.mend)
		}
	}
	function step(t, dt) {
		if (run.endedTick != null) return
		attune(dt)
		for (const entry of list) {
			if (entry.killed || entry.dormant) continue
			entry.step(t, dt)
			announce(entry)
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
			list.find((e) => e.units.includes(unit))?.addThreat?.(source, damage, unit)
		},
		addHealingThreat(source, amount) {
			for (const entry of list) entry.addHealingThreat?.(source, amount)
		},
	}
}
