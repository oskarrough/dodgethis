import { tune } from '../../tune.js'
import { distance } from '../../../../core/spatial.js'

// Undine alone slides into planting range; Slide itself only knows how to escape.
export function undineBot(ctx) {
	const { h, p, now, own, enemies, abilities, cast, frame, safe } = ctx
	if (ctx.skillsLocked || ctx.castBusy || h.cast || h.body.dashing) return null
	const [sprinklerSlot, sprinkler] = abilities.find(([, a]) => a.id === 'sprinkler') ?? []
	const [slideSlot, slide] = abilities.find(([, a]) => a.id === 'slide') ?? []
	if (!sprinkler || !slide) return null
	const index = Number(sprinklerSlot.slice(-1)) - 1
	if (h.cd[index] || (h.cancelUntil?.[index] ?? 0) > now) return null
	// Leave the ability's escape higher priority than saving an ally.
	if (
		h.hp / h.maxHp < slide.stats.bot.escapeHp &&
		enemies.some((u) => distance(p, u.pos) <= slide.stats.bot.danger)
	)
		return null
	const ally = own
		.filter(
			(u) =>
				u.id !== h.id &&
				u.hp / u.maxHp < tune.heroes.undine.bot.saveHp &&
				distance(p, u.pos) > sprinkler.stats.range &&
				distance(p, u.pos) <= sprinkler.stats.range + slide.stats.range,
		)
		.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id.localeCompare(b.id))[0]
	if (ally && safe(ally.pos, enemies) && cast(slideSlot, ally.pos)) return frame
	return null
}
