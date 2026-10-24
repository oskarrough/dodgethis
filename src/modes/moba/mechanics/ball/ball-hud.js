import { tune } from '../../tune.js'
import { n, pct } from '../../card-text.js'
import { controls } from '../../../../core/controls.js'
import { throwHint } from '../../../../core/intents.js'

// The Ball's countdown in the top bar (hud.js shows every match mechanic's `timer`): a ring that
// fills to the next spawn, then runs down while the Ball is live, and its card.
export const timer = {
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle class="gold" cx="24" cy="24" r="15"/><path class="ink-line" d="M10 20 Q24 28 38 20 M18 10 Q26 24 18 38"/></svg>',
	// What the timer shows for `hero`, `blend` ticks past the last step; null without a Ball.
	read(sim, hero, blend, step, layout) {
		const ball = sim.ball
		if (!ball) return null
		const elapsed = sim.tick * step
		const carrying = ball.carrying(hero)
		// Until it pops: at its own pop time, or sooner if the next spawn replaces it.
		const pop =
			ball.state && ball.state.state !== 'warning'
				? Math.max(0, Math.min(ball.state.popAt, ball.nextBall) - sim.tick - blend) * step
				: null
		const next = (ball.nextBall - sim.tick - blend) * step
		const state = carrying ? 'carried' : pop != null ? 'live' : 'next'
		const left = pop ?? Math.max(0, next)
		const late = elapsed >= (layout?.late ?? tune.match.late)
		const b = tune.ball
		const total =
			pop != null ? b.life : elapsed < b.first ? b.first : late ? b.lateInterval : b.interval
		return {
			state,
			left,
			total,
			full: carrying,
			seconds: carrying ? '' : `${Math.ceil(left)}`,
			warn: state === 'live' || (state === 'next' && left <= tune.hud.warn),
			says: pop != null ? `Ball pops in ${Math.ceil(pop)}s` : `Ball ${Math.ceil(left)}s`,
		}
	},
	card(reading, { device } = {}) {
		const b = tune.ball
		return {
			title: 'The Ball',
			sentence:
				reading?.state === 'carried'
					? `You carry it at ${pct(b.carrySpeed)} speed. ${throwHint(controls.preset, device)} toward your aim, up to ${n(b.range)} m.`
					: reading?.state === 'live'
						? `It's at mid until the ring runs out. Stand still beside it for ${n(b.channel)} s to pick it up.`
						: `Spawns at mid when the ring fills. Stand still beside it for ${n(b.channel)} s to pick it up.`,
			facts: [
				['Hits a hero', `${Math.round(b.damage)} damage and a ${n(b.stun)} s [[Stun]]`],
				['Hits a structure', `${pct(b.structureDamage)} of its max HP and a [[Silence]]`],
			],
		}
	},
}
