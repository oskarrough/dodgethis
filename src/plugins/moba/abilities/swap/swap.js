import { clampWalkable } from '../../obstacles.js'
import { tune } from '../../tune.js'

const PARTNER = 'bank'

// Where Swap would send you: your Bank shot while it flies, then where it stopped for `linger`.
function swapTarget({ hero, sim, tick }) {
	const shot = (sim.shots ?? []).findLast((s) => s.owner === hero.id && s.ability === PARTNER)
	if (shot) return { x: shot.x, z: shot.z, shot }
	const mark = hero.abilityState?.swap?.mark
	return mark && mark.until > tick ? { x: mark.x, z: mark.z } : null
}

// E: trade places with your Bank shot, wherever its bounces took it. Instant, no travel.
export default {
	kind: 'instant',
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="tone" d="M10 18 L30 18 L30 12 L40 22 L30 32 L30 26 L10 26 Z"/><path class="ink-line" d="M38 34 L18 34 M18 30 L10 38 L18 46"/><circle class="gold" cx="38" cy="10" r="5"/></svg>',
	effects: { cast: 'vault', pose: 'vault' },
	state: () => ({ mark: null }),
	blinkTo: swapTarget,
	ready: (context) => swapTarget(context) !== null,
	watch({ hero, sim, tick, ticks, ability }) {
		const shot = (sim.shots ?? []).findLast((s) => s.owner === hero.id && s.ability === PARTNER)
		if (shot)
			hero.abilityState.swap.mark = {
				x: shot.x,
				z: shot.z,
				until: tick + ticks(ability.stats.linger),
			}
	},
	onRelease(context) {
		const { hero, sim } = context
		const to = swapTarget(context)
		if (!to || hero.dead) return
		const p = hero.body.position
		const from = { x: p.x, z: p.z }
		const landing = clampWalkable(to, hero.body.radius, 0, sim.obstacles, sim.bounds)
		hero.body.place(landing.x, p.y, landing.z)
		if (to.shot) {
			to.shot.x = from.x
			to.shot.z = from.z
		}
		hero.abilityState.swap.mark = null
	},
	card: {
		summary: () => 'Trade places with your Bank shot, wherever it has bounced to.',
		notes: () => [`Only while Bank flies, or ${tune.swap.linger}s after it stops`],
	},
}
