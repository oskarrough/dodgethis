export default {
	projectileShape: 'ball',
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle class="cream" cx="24" cy="24" r="14"/><path class="ink-line" d="M12 14 Q24 24 12 34 M36 14 Q24 24 36 34"/></svg>',
	name: 'Tennis ball',
	kind: 'homing',
	tell: 'line',
	effects: { cast: 'tennisWindup', projectile: 'tennisBall', hit: 'tennisHit', pose: 'coachBasic' },
}
