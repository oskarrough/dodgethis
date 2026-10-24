// The damage meter's ledger: presented facts in, segments out. Facts are the whole contract, as in
// Oskar's balancemender combat log: no tune, no live units, and time is the sim's own tick, never the
// wall clock. `describe(id)` names a unit once, the first time the ledger sees it.
//
// Segments: `overall` counts everything; a fight opens on the first hit or heal and closes after `idle`
// seconds of quiet; an `encounter` fact (start/end) closes whatever is open and holds one segment for the
// whole boss fight, however long its lulls. The newest `keep` segments are kept.
export const MODES = ['damage', 'healing', 'taken', 'deaths']

function row(unit) {
	return {
		id: unit.id,
		name: unit.name,
		team: unit.team,
		damage: 0,
		healing: 0,
		overheal: 0,
		taken: 0,
		deaths: 0,
		// mode → ability (or source, for taken) → amount
		parts: { damage: {}, healing: {}, taken: {} },
		falls: [],
	}
}

function segment(name, kind, tick) {
	return {
		name,
		kind,
		start: tick,
		last: tick,
		end: null,
		result: null,
		rows: new Map(),
		enemies: {},
	}
}

const add = (parts, key, amount) => (parts[key ?? 'other'] = (parts[key ?? 'other'] ?? 0) + amount)

export function createMeter({ step, idle = 6, keep = 12 } = {}) {
	const known = new Map()
	const overall = segment('Overall', 'overall', 0)
	const segments = []
	let open = null
	let fights = 0
	let first = true

	function unit(id, describe) {
		if (id == null) return null
		if (!known.has(id)) known.set(id, describe(id))
		return known.get(id)
	}
	function rowOf(seg, who) {
		if (!seg.rows.has(who.id)) seg.rows.set(who.id, row(who))
		return seg.rows.get(who.id)
	}
	function begin(name, kind, tick) {
		close(tick)
		open = segment(name, kind, tick)
		segments.push(open)
		if (segments.length > keep) segments.shift()
	}
	function close(tick, result = null) {
		if (!open) return
		open.end = open.kind === 'encounter' ? tick : open.last
		open.result = result
		open = null
	}
	// A fight takes the name of the enemy the party hit hardest, as a Details segment does.
	function fightName(seg) {
		const [top] = Object.entries(seg.enemies).sort((a, b) => b[1] - a[1])
		return top ? top[0] : `Fight ${seg.number}`
	}
	// Damage dealt to or by a non-hero names the fight after it.
	function foe(seg, name, damage) {
		seg.enemies[name] = (seg.enemies[name] ?? 0) + damage
		if (seg.kind === 'fight') seg.name = fightName(seg)
	}
	function spend(seg, fact, source, target, tick) {
		seg.last = tick
		if (fact.type === 'hit') {
			if (source?.hero) {
				const r = rowOf(seg, source)
				r.damage += fact.damage
				// A basic attack's hit names its slot, not its ability.
				const ability =
					fact.ability ?? (fact.slot === 'primary' ? (source.basic ?? 'attack') : fact.slot)
				add(r.parts.damage, ability, fact.damage)
			}
			if (target?.hero) {
				const r = rowOf(seg, target)
				r.taken += fact.damage
				add(r.parts.taken, source?.name ?? 'the world', fact.damage)
			}
			if (target?.hero && source && !source.hero) foe(seg, source.name, fact.damage)
			if (source?.hero && target && !target.hero && target.team !== source.team)
				foe(seg, target.name, fact.damage)
		} else if (fact.type === 'heal' && source?.hero) {
			const r = rowOf(seg, source)
			r.healing += fact.amount
			r.overheal += fact.overheal ?? 0
			add(r.parts.healing, fact.ability, fact.amount)
		} else if (fact.type === 'death' && target?.hero) {
			const r = rowOf(seg, target)
			r.deaths++
			r.falls.push({ at: tick - seg.start, by: source?.name ?? null })
		}
	}

	return {
		overall,
		segments,
		current: () => open ?? segments.at(-1) ?? null,
		seconds: (seg) => Math.max(1, ((seg.end ?? seg.last) - seg.start) * step),
		// Overall time is time spent fighting: the sum of its segments, so lulls don't thin the numbers.
		overallSeconds() {
			const fought = segments.reduce((sum, s) => sum + ((s.end ?? s.last) - s.start) * step, 0)
			return Math.max(1, fought)
		},
		add(fact, tick, describe) {
			if (fact.type === 'encounter') {
				// The blow that wakes a boss lands a tick before its encounter says so: a fight
				// that has only just begun is the encounter's opening, not a fight of its own.
				if (fact.state === 'start' && open?.kind === 'fight' && tick - open.start <= 1 / step)
					Object.assign(open, { name: fact.name, kind: 'encounter' })
				else if (fact.state === 'start') begin(fact.name, 'encounter', tick)
				else if (open?.kind === 'encounter') close(tick, fact.result)
				return true
			}
			const counts =
				(fact.type === 'hit' && fact.damage > 0) ||
				(fact.type === 'heal' && fact.amount > 0) ||
				fact.type === 'death'
			if (!counts) return false
			const source = unit(fact.source, describe)
			const target = unit(fact.target, describe)
			if (!source?.hero && !target?.hero) return false
			if (open?.kind === 'fight' && tick - open.last > idle / step) close(tick)
			if (!open) {
				if (fact.type === 'death') return false
				begin(`Fight ${++fights}`, 'fight', tick)
				open.number = fights
			}
			if (first) overall.start = tick
			first = false
			spend(open, fact, source, target, tick)
			spend(overall, fact, source, target, tick)
			return true
		},
		reset() {
			segments.length = 0
			open = null
			fights = 0
			first = true
			Object.assign(overall, segment('Overall', 'overall', 0))
		},
	}
}

// One segment's rows for a mode, biggest first, with each row's share of the top and of the total.
export function standings(seg, mode) {
	const rows = [...seg.rows.values()].filter((r) => r[mode] > 0)
	rows.sort((a, b) => b[mode] - a[mode])
	const top = rows[0]?.[mode] ?? 0
	const total = rows.reduce((sum, r) => sum + r[mode], 0)
	return { rows, top, total }
}
