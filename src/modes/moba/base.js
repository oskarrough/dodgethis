import { tune } from './tune.js'

// Each team's base is the end of the map behind `layout.bases[team].x`. Only your own base keeps you:
// hits on you there are shielded (combat.js `hit`), and you heal from any health to full in
// `tune.base.fullHealSeconds`. Layouts without bases (the lobby) have no zone.
export function inOwnBase(layout, hero) {
	const base = layout.bases?.[hero.team]
	if (!base || hero.dead) return false
	return (hero.team === 'A' ? -1 : 1) * (hero.body.position.x - base.x) >= 0
}

export function healInBase(layout, heroes, dt) {
	const rate = dt / Math.max(dt, tune.base.fullHealSeconds)
	for (const h of heroes) if (inOwnBase(layout, h)) h.hp = Math.min(h.maxHp, h.hp + h.maxHp * rate)
}
