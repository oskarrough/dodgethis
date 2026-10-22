// Shared shield behaviour; abilities opt in with on.absorb like any other aura hook.
export function absorbAura({ unit, status, event, tick, remove, present }) {
	if (unit !== event.target) return
	if ((status.until !== null && status.until <= tick) || status.amount <= 0) {
		remove(unit, status.id, status.until !== null && status.until <= tick ? 'expired' : 'spent')
		return
	}
	const absorbed = Math.max(0, Math.min(status.amount, event.damage))
	status.amount -= absorbed
	event.damage -= absorbed
	event.absorbed += absorbed
	if (absorbed > 0)
		present({
			type: 'absorb',
			source: status.src,
			target: unit.id,
			key: status.key,
			status: status.id,
			amount: absorbed,
		})
}
