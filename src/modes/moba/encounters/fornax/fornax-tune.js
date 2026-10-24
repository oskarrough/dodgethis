export default {
	// Fornax (`fornax-fight.js`): a Warden of `hp`, striking at `damage` of a Warden's blows, in a
	// hall of `hall` m round the encounter's spot. While the fight is on, a hero in the hall but
	// out of the shade gains a stack of Heat every `heat.every` s and takes `heat.burn` for each
	// stack held; in the shade a stack cools away every `heat.cool` s. At `heat.bake` stacks the
	// hero is baked solid for `heat.baked` s and the stacks fall away.
	hp: 1500,
	damage: 0.5,
	hall: 12,
	heat: { every: 1, cool: 0.5, burn: 10, bake: 5, baked: 3 },
	// The awning's shade: a circle of `radius` m that walks `span` m either side of the spot along
	// the hall, end to end and back in `period` s.
	shade: { radius: 3.5, span: 8, period: 40 },
	// Bots step back into the shade once they hold `retreat` stacks.
	retreat: 2,
	// The drawing: the shade on the floor, and each hero's Heat as a ring that fills toward baked.
	view: { ring: 0.9, rim: 0.14, segments: 40, lift: 0.004 },
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	'fornax.damage': 'multiplier',
	'fornax.heat.burn': 'hp',
	'fornax.hall': 'm',
	'fornax.heat.every': 's',
	'fornax.heat.cool': 's',
	'fornax.heat.bake': 'count',
	'fornax.heat.baked': 's',
	'fornax.shade.span': 'm',
	'fornax.shade.period': 's',
	'fornax.retreat': 'count',
}
