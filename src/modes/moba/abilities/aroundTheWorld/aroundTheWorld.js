import { distance } from '../../../../core/spatial.js'

const wideLoop = (hero) =>
	(hero.talents ?? []).some(
		(column, row) => hero.definition.talents?.rows[row]?.[column]?.id === 'wideLoop',
	)

export default {
	name: 'Around the world',
	kind: 'instant',
	tell: 'ring',
	held: 'circle',
	// Two enemy heroes in the circle, as before; Wide Loop spends the same swing on a Warden or pack.
	bot: {
		priority: 16,
		act(ctx, slot) {
			const { h, p, enemies, near, cast, frame, safe } = ctx
			const stats = h.definition.abilities[slot].stats
			const loop = wideLoop(h)
			const victims = loop
				? enemies.filter((u) => distance(u.pos, p) <= stats.radius + (u.radius ?? 0))
				: near(enemies, p, stats.radius)
			if (victims.length >= (loop ? 1 : stats.botEnemies) && safe(p, victims) && cast(slot, p))
				return frame
			return null
		},
	},
	effects: { cast: true, impact: true, pose: 'aroundTheWorld' },
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle class="ink-line" cx="24" cy="24" r="16"/><circle class="gold" cx="40" cy="24" r="7"/></svg>',
	card: {
		sentence: `Loops the yo-yo around you: enemy heroes within {radius} take {damage:damage} and are [[knocked back|knockback]] {knockback}.`,
	},
	stages: {
		release: {
			do: [
				{
					deliver: 'area',
					from: 'self',
					shape: 'circle',
					targets: 'enemyHero',
					hit: ['damage', 'knockback'],
				},
			],
			after({ hero, ability, event, present }) {
				present({
					type: 'contact',
					part: 'sweep',
					source: hero.id,
					ability: ability.id,
					point: { ...hero.body.position },
					direction: { ...event.dir, y: 0 },
				})
			},
		},
	},
}
