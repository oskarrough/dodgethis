export default {
	// Hints (`hints-view.js`): the first time a danger matters, the key that answers it is printed on
	// the floor, and once the player has answered it, never again. A dodge hint shows when a threat that
	// covers you lands in `lead` s or more; low health below `lowHp` of your maximum; an ally below
	// `allyHp` within `allyReach` m. A hint left unanswered `patience` times counts as read, and the
	// same hint rests `rest` s before it shows again. The glyph is `size` m wide, `offset` m in front of
	// the feet, at `opacity`; it fades in over `fadeIn` s and, once answered, sinks and fades over
	// `fadeOut` s. A dodge hint's ink arrow is `arrow` m long and points the way out.
	hints: {
		lead: 0.3,
		lowHp: 0.3,
		allyHp: 0.45,
		allyReach: 11,
		patience: 3,
		rest: 12,
		size: 1.35,
		offset: 0.6,
		opacity: 0.88,
		fadeIn: 0.16,
		fadeOut: 0.22,
		arrow: 1.1,
		// The controls card (`scheme-view.js`): switching presets prints how to walk, attack and cast
		// on the floor around the hero, `width` m across. It lasts `hold` s, or until the hero walks
		// `leave` m from where they stood when it appeared.
		scheme: { width: 8.5, hold: 6, leave: 2.2 },
	},
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	'hints.lead': 's',
	'hints.lowHp': 'fraction',
	'hints.allyHp': 'fraction',
	'hints.allyReach': 'm',
	'hints.patience': 'count',
	'hints.rest': 's',
	'hints.size': 'm',
	'hints.offset': 'm',
	'hints.opacity': 'fraction',
	'hints.fadeIn': 's',
	'hints.fadeOut': 's',
	'hints.arrow': 'm',
	'hints.scheme.width': 'm',
	'hints.scheme.hold': 's',
	'hints.scheme.leave': 'm',
}
