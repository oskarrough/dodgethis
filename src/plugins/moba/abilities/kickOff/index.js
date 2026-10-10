// E for now: a plain dash. The terrain reflection and cooldown refund come later.
export default {
	kind: 'dash',
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="tone" d="M8 30 L20 18 L20 25 L34 25 L34 35 L20 35 L20 42 Z" transform="rotate(-20 24 30)"/><circle class="gold" cx="38" cy="12" r="5"/></svg>',
	held: 'arrow',
	effects: { cast: 'vault', effect: 'vault', pose: 'vault' },
}
