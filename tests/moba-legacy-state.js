// Compare the complete pre-table wire shape; new replication fields are tested
// separately. Preserve old key order because every tick enters a JSON digest.
export function legacyState(state) {
	delete state.boards
	delete state.cutouts
	for (const list of [state.heroes, state.dummies, state.minions ?? []]) {
		for (let i = 0; i < list.length; i++) {
			const unit = Object.fromEntries(
				Object.entries(list[i]).map(([key, value]) =>
					key === 'slow' ? ['slowUntil', value.until] : [key, value],
				),
			)
			for (const key of [
				'heroId',
				'abilityState',
				'freezeUntil',
				'stance',
				'channel',
				'proneUntil',
				'catchWindow',
			])
				delete unit[key]
			if (unit.cast && !unit.id.startsWith('dummy'))
				unit.cast = { slot: unit.cast.slot, left: unit.cast.left, yaw: unit.cast.yaw }
			else if (unit.cast) delete unit.cast.ability
			list[i] = unit
		}
	}
	state.zones = state.zones.map((z) => ({
		id: z.id,
		owner: z.owner,
		pos: z.pos,
		left: z.left,
		total: z.total,
	}))
	state.projectiles = state.projectiles.map((s) => ({
		id: s.id,
		owner: s.owner,
		slot: s.slot,
		target: s.target ?? null,
		damage: s.damage,
		pos: s.pos,
		dir: s.dir,
		travelled: s.travelled,
	}))
	return state
}
