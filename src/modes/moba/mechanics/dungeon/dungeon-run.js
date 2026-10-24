import { STEP } from '../../../../core/app.js'
import { tune } from '../../tune.js'
import encounters from '../../encounters/all-encounters.js'
import { createBossPull } from '../boss/boss-pull.js'

const ticks = (s) => Math.max(1, Math.round(s / STEP))
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

// One run through a dungeon map. Each of `layout.encounters` (`{ id, x, z, wing, last }`) is a boss
// with its own pull. The `last` boss sleeps until every boss outside the wings is dead and one of
// `layout.wings` is cleared; its death ends the run. A wipe resets only the boss you fell to, and
// you rise at the last waystone you passed. Stands in for the single boss: `unit` and `state` are
// the boss being fought, or else the next one, so combat, the HUD and the menu read it unchanged.
export function createDungeon(args) {
	const { heroes, layout, lane } = args
	const bosses = layout.encounters.map((spot) => {
		const pull = createBossPull({
			...args,
			encounter: {
				id: spot.id,
				name: encounters[spot.id].name,
				spawn: { x: spot.x, z: spot.z },
				hp: tune.encounters[spot.id].hp,
			},
		})
		pull.unit.dormant = !!spot.last
		return {
			...pull,
			wing: spot.wing ?? null,
			last: !!spot.last,
			killed: false,
		}
	})
	const run = { endedTick: null }
	const engaged = () => bosses.find((b) => b.state.phase === 'engaged')
	// Bots take the bosses in map order; the last one first once it wakes.
	const next = () =>
		bosses.find((b) => b.last && !b.unit.dormant && !b.killed) ??
		bosses.find((b) => !b.killed && !b.unit.dormant)
	const current = () => engaged() ?? next() ?? bosses.at(-1)
	// The bosses outside the wings must all fall, and every boss of one wing.
	const stairOpen = () =>
		bosses.every((b) => b.killed || b.last || layout.wings.includes(b.wing)) &&
		layout.wings.some((wing) => bosses.every((b) => b.wing !== wing || b.killed))
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
		for (const boss of bosses) {
			if (boss.killed || boss.unit.dormant) continue
			boss.step(t, dt)
			if (boss.state.phase !== 'ended' || !boss.unit.dead) continue
			boss.killed = true
			// The fight is won: whoever fell in it rises at their waystone.
			for (const h of heroes) if (h.dead) h.respawnTick = t + ticks(tune.waystone.rise)
			if (boss.last) {
				run.endedTick = t
				lane.match.winner = 'A'
				lane.match.endedTick = t
				return
			}
		}
		const last = bosses.find((b) => b.last)
		if (last?.unit.dormant && stairOpen()) last.unit.dormant = false
	}
	return {
		bosses,
		run,
		units: bosses.map((b) => b.unit),
		get unit() {
			return current().unit
		},
		get state() {
			return current().state
		},
		next,
		step,
		addThreat(source, damage, unit) {
			bosses.find((b) => b.unit === unit)?.addThreat(source, damage)
		},
		addHealingThreat(source, amount) {
			for (const boss of bosses) boss.addHealingThreat(source, amount)
		},
	}
}
