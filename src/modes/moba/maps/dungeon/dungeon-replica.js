import { createUnitReplica } from '../../lobby-replica.js'

// Dungeon uses the shared combat buffer, not the lane's mandatory teams, waves and structures.
export function createDungeonReplica(simulation, scene) {
	const tick = (value) => Number.isSafeInteger(value) && value >= 0
	const hero = (id) => simulation.heroes.some((h) => h.id === id)
	let sampled = null
	const reportListeners = []
	const replica = createUnitReplica(simulation, scene, {
		validateState(state) {
			if (state.map !== simulation.bounds.id) return 'Dungeon map mismatch'
			const boss = state.boss
			if (
				!boss ||
				!['idle', 'engaged', 'ended', 'reset'].includes(boss.phase) ||
				!['started', 'resetTick'].every((key) => boss[key] === null || tick(boss[key])) ||
				!tick(boss.nextSwing) ||
				!tick(boss.nextSlam)
			)
				return 'Invalid dungeon pull'
			const unit = state.dummies.find((d) => d.id === simulation.boss.unit.id)
			if (
				!unit ||
				!(unit.target === null || hero(unit.target)) ||
				!unit.threat ||
				Array.isArray(unit.threat) ||
				!Object.entries(unit.threat).every(
					([id, amount]) => hero(id) && Number.isFinite(amount) && amount >= 0,
				)
			)
				return 'Invalid dungeon threat'
			if (
				!Array.isArray(state.cover) ||
				!state.cover.every(
					(o) =>
						typeof o.id === 'string' &&
						o.kind === 'cushion' &&
						['x', 'z', 'halfX', 'halfZ'].every((key) => Number.isFinite(o[key])),
				)
			)
				return 'Invalid dungeon cover'
			return null
		},
		applySample({ before }, sim) {
			if (before === sampled) return
			sampled = before
			Object.assign(simulation.boss.state, structuredClone(before.boss))
			if (before.matchStats) sim.matchStats = structuredClone(before.matchStats)
			const wanted = new Map(before.cover.map((o) => [o.id, o]))
			for (const o of simulation.obstacles.filter((o) => o.kind === 'cushion'))
				if (!wanted.delete(o.id)) simulation.removeCover(o)
			for (const o of wanted.values()) simulation.addCover({ ...o })
		},
	})
	// Reports consume the reliable fact stream, not the expiring visual-cue queue.
	const present = replica.present
	replica.present = (fact) => {
		for (const listener of reportListeners) listener(fact)
		present(fact)
	}
	replica.onReportFact = (listener) => reportListeners.push(listener)
	const dispose = replica.dispose
	replica.dispose = () => {
		reportListeners.length = 0
		dispose()
	}
	return replica
}
