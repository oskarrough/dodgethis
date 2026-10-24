import { tune } from '../../tune.js'
import encounterViews from '../../encounters/all-encounter-views.js'

export { dressBoss as dress } from './dungeon-dress.js'

// The run's drawing is its encounters' drawings, each from its folder's view.
export function view(scene) {
	const views = Object.values(encounterViews).flatMap((v) => (v.view ? [v.view(scene)] : []))
	return {
		get markerPosition() {
			return null
		},
		present() {},
		update(...args) {
			for (const v of views) v.update(...args)
		},
		dispose() {
			for (const v of views) v.dispose()
		},
	}
}

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const MARKS = [
	['glass', 'Glass'],
	['clay', 'Clay'],
	['stone', 'Stone'],
]

// The hourglass in the top bar: the ring runs down to the next of its three marks, Glass for the
// swift, Clay for the able and Stone for the slow. Past Stone it stands empty.
export const timer = {
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="ink-line" d="M14 8 H34 M14 40 H34 M16 8 C16 20 24 20 24 24 C24 28 16 28 16 40 M32 8 C32 20 24 20 24 24 C24 28 32 28 32 40"/></svg>',
	read(sim, _hero, blend, step) {
		const run = sim.dungeon?.run
		if (!run) return null
		const elapsed = (run.endedTick ?? sim.tick + blend) * step
		const mark = MARKS.find(([key]) => elapsed < tune.hourglass[key])
		if (!mark)
			return {
				state: 'past',
				left: 0,
				total: 1,
				seconds: clock(elapsed),
				says: `Past the Stone mark at ${clock(elapsed)}`,
			}
		const total = tune.hourglass[mark[0]]
		const left = total - elapsed
		return {
			state: mark[0],
			left,
			total,
			seconds: clock(left),
			warn: left <= tune.hud.warn,
			says: `${mark[1]} mark in ${clock(left)}`,
		}
	},
	card(reading) {
		const h = tune.hourglass
		return {
			title: 'The Hourglass',
			sentence:
				'The sand began to fall when you came through the gate. Beat a mark and the run card remembers it.',
			facts: [
				['Glass', clock(h.glass)],
				['Clay', clock(h.clay)],
				['Stone', clock(h.stone)],
				...(reading ? [['Now', reading.says]] : []),
			],
		}
	},
}

// The top bar's goal line and its card.
export const goal = {
	line: 'Fell Gnomon atop the stair',
	card: (sim) => {
		const boons = sim?.dungeon?.run.boons ?? []
		return {
			title: 'How to win',
			sentence:
				'Gnomon sleeps until the court is cleared and one wing has lost all its bosses. Fell it and the mesa is yours. Fall, and you rise at the last waystone you passed, while the boss that beat you is made whole. Each wing boss leaves a boon that weakens Gnomon.',
			facts: boons.length ? boons.map((boon) => [boon.name, boon.line]) : [['Boons', 'None yet']],
		}
	},
}
