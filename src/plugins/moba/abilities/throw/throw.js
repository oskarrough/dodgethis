import { tune } from '../../tune.js'

export default {
	name: 'Throw',
	kind: 'shot',
	catchable: true,
	tell: 'line',
	held: 'line',
	aimAssist: true,
	effects: { cast: 'throwWindup', projectile: 'throwYoYo', hit: 'throwHit', pose: 'throwYoYo' },
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="ink-line" d="M6 38 L35 12"/><circle class="gold" cx="35" cy="12" r="9"/></svg>',
	card: {
		summary: () =>
			`The first body takes ${tune.throw.damage} damage and is dragged to ${tune.throw.dragDistance} m in front of Hook. Cover and structures stop the yo-yo; caught returns carry no drag.`,
	},
	projectileStats({ ability }) {
		return { drag: { distance: ability.stats.dragDistance, duration: ability.stats.dragTime } }
	},
	onHit({ hero, sim, target, shot }) {
		const unit = target.unit
		if (!shot.drag || unit.dead || unit.structure) return
		const p = hero.body.position
		sim.displace(
			unit,
			{ x: p.x + shot.dx * shot.drag.distance, z: p.z + shot.dz * shot.drag.distance },
			shot.drag.duration,
		)
	},
}
