// `farm --summary --report`: per-match counters gathered in the worker from the combat log and the
// bots' brains, merged per side and variant in the main thread, printed as compact sections.
import {
	deltaCell,
	deltaDecided,
	deltaVerdict,
	difference,
	rateCell,
	rateDecided,
} from './stats.js'

const structure = (id) => /^(tower|core)-/.test(id ?? '')
const killerKind = (source, seats) =>
	seats.has(source) ? 'hero' : structure(source) ? 'tower' : (source?.split('-')[0] ?? 'other')

// Siege window, after the siege thread's probe: an enemy tower is vulnerable and at least two
// friendly minions stand in its range. Bots' states in that window say whether they commit.
const SIEGE_MINIONS = 2

export function matchReport(roster, { STEP, towerRange }) {
	const seats = new Map(roster.map((seat) => [seat.id, seat]))
	const hero = (id) => seats.get(id)?.heroId
	const r = {
		seats: Object.fromEntries(
			roster.map((seat) => [
				seat.id,
				{
					hero: seat.heroId,
					team: seat.team,
					idle: seat.controller === 'idle',
					damage: 0,
					heroDamage: 0,
					structureHits: 0,
					deaths: 0,
					catches: 0,
					dunks: 0,
					dunked: 0,
				},
			]),
		),
		firstTower: null,
		abilities: {},
		deathsBy: {},
		taken: {},
		states: {},
		siege: {},
		lanes: {},
		lost: {},
	}
	const player = roster.find((seat) => seat.controller === 'agent')?.id
	const ability = (seat, id) =>
		(r.abilities[`${hero(seat)} ${id ?? '?'}`] ??= { casts: 0, hits: 0, heroHits: 0, damage: 0 })
	const add = (bucket, key, value) => (bucket[key] = (bucket[key] ?? 0) + value)
	return {
		report: r,
		row(row) {
			const seat = seats.has(row.seat) ? row.seat : null
			if (row.kind === 'cast' && seat) ability(seat, row.ability_id).casts++
			if (row.kind === 'hit' && seat) {
				const a = ability(seat, row.ability_id),
					s = r.seats[seat]
				a.hits++
				a.damage += row.effective_damage
				s.damage += row.effective_damage
				if (seats.has(row.target)) {
					a.heroHits++
					s.heroDamage += row.effective_damage
				}
				if (structure(row.target)) s.structureHits++
			}
			if (
				row.kind === 'hit' &&
				seats.has(row.target) &&
				!r.seats[row.target].idle &&
				row.effective_damage
			) {
				const source = seat
					? `${hero(seat)} ${row.ability_id ?? '?'}`
					: killerKind(row.fact?.source, seats)
				add((r.taken[hero(row.target)] ??= {}), source, row.effective_damage)
			}
			// Ball catches aren't skill; only caught ability shots count.
			if (row.kind === 'caught' && seat && row.fact?.ability) r.seats[seat].catches++
			// Flagfall: a shove off the court through a fence gap.
			if (row.kind === 'dunk') {
				if (seats.has(row.target)) r.seats[row.target].dunked++
				if (seats.has(row.fact?.source)) r.seats[row.fact.source].dunks++
			}
			if (row.kind === 'structureDown' && row.target?.startsWith('tower') && r.firstTower === null)
				r.firstTower = row.tick * STEP
			if (row.kind === 'death' && seats.has(row.target)) {
				r.seats[row.target].deaths++
				if (r.seats[row.target].idle) return
				const by = (r.deathsBy[hero(row.target)] ??= {})
				add(by, killerKind(row.fact?.source, seats), 1)
			}
		},
		tick(sim) {
			if (sim.lanes?.length > 1) {
				for (const h of sim.heroes) {
					if (h.dead) continue
					const key = h.id === player ? `${h.id} (player)` : h.id
					add((r.lanes[key] ??= {}), zone(sim.lanes, h), STEP)
				}
				r.lost = {}
				for (const s of sim.lane.structures)
					if (s.dead && s.lane) add((r.lost[s.team] ??= {}), s.lane, 1)
			}
			const brains = sim.bots?.brains
			if (!brains) return
			const lane = sim.lane
			for (const brain of brains) {
				const h = sim.heroes.find((u) => u.id === brain.id)
				if (!h || h.dead) continue
				const kit = hero(brain.id) ?? h.definition?.id
				add((r.states[kit] ??= {}), brain.state ?? '?', STEP)
				const tower = lane.structures.find(
					(s) => !s.dead && s.team !== h.team && s.id.startsWith('tower') && lane.vulnerable(s),
				)
				if (!tower) continue
				const tp = tower.body.position
				const near = lane.minions.filter(
					(u) =>
						!u.dead &&
						u.team === h.team &&
						Math.hypot(u.body.position.x - tp.x, u.body.position.z - tp.z) <= towerRange,
				).length
				if (near < SIEGE_MINIONS) continue
				const d = Math.hypot(h.body.position.x - tp.x, h.body.position.z - tp.z)
				const where = d <= towerRange + 1.5 ? 'in' : d <= 20 ? 'out' : 'far'
				add((r.siege[kit] ??= {}), `${brain.state ?? '?'}:${where}`, STEP)
			}
		},
	}
}

// Two-lane maps: the lane a hero stands in (within LANE_BAND of its path), home near its spawn, else yard.
const LANE_BAND = 6
const HOME = 15
function zone(lanes, h) {
	const p = h.body.position
	if (h.spawn && Math.hypot(p.x - h.spawn.x, p.z - h.spawn.z) <= HOME) return 'home'
	const near = (path) =>
		Math.min(
			...path.slice(1).map((to, i) => {
				const from = path[i],
					dx = to.x - from.x,
					dz = to.z - from.z,
					t = Math.max(
						0,
						Math.min(1, ((p.x - from.x) * dx + (p.z - from.z) * dz) / (dx * dx + dz * dz || 1)),
					)
				return Math.hypot(p.x - from.x - dx * t, p.z - from.z - dz * t)
			}),
		)
	return lanes.find((l) => near(l.path) <= LANE_BAND)?.id ?? 'yard'
}

export function emptyTotals() {
	return {
		matches: 0,
		decided: 0,
		heroes: {},
		abilities: {},
		deathsBy: {},
		taken: {},
		states: {},
		siege: {},
		lanes: {},
		lost: {},
	}
}

const sumInto = (into, from) => {
	for (const [k, v] of Object.entries(from)) {
		if (typeof v === 'number') into[k] = (into[k] ?? 0) + v
		else sumInto((into[k] ??= {}), v)
	}
}

export function mergeReport(totals, report, winner) {
	totals.matches++
	if (winner) totals.decided++
	const count = { A: {}, B: {} }
	for (const s of Object.values(report.seats)) {
		if (s.idle) continue
		count[s.team][s.hero] = (count[s.team][s.hero] ?? 0) + 1
		const h = (totals.heroes[s.hero] ??= {
			seats: 0,
			decided: 0,
			wins: 0,
			edge: 0,
			edgeWins: 0,
			damage: 0,
			heroDamage: 0,
			deaths: 0,
			structureHits: 0,
			catches: 0,
			dunks: 0,
			dunked: 0,
		})
		h.seats++
		if (winner) h.decided++
		if (winner === s.team) h.wins++
		for (const k of [
			'damage',
			'heroDamage',
			'deaths',
			'structureHits',
			'catches',
			'dunks',
			'dunked',
		])
			h[k] += s[k]
	}
	// Edge: in a decided match where one team fields more of this hero, did that team win? One sample
	// per match, so it takes a Wilson interval; for one-hero teams it is simply the hero's win rate.
	if (winner)
		for (const [id, h] of Object.entries(totals.heroes)) {
			const a = count.A[id] ?? 0,
				b = count.B[id] ?? 0
			if (a === b) continue
			h.edge++
			if ((a > b ? 'A' : 'B') === winner) h.edgeWins++
		}
	for (const key of ['abilities', 'deathsBy', 'taken', 'states', 'siege', 'lanes', 'lost'])
		sumInto(totals[key], report[key])
}

export const emptyCell = () => ({ rows: {}, totals: emptyTotals() })

export function addResult(cell, { pair, winner, duration, report }) {
	const row = (cell.rows[pair.join(' v ')] ??= {
		n: 0,
		decided: 0,
		aWins: 0,
		seconds: 0,
		towers: 0,
		towerSeconds: 0,
		A: { deaths: 0, damage: 0, structureHits: 0 },
		B: { deaths: 0, damage: 0, structureHits: 0 },
	})
	row.n++
	row.seconds += duration
	if (winner) row.decided++
	if (winner === 'A') row.aWins++
	if (report.firstTower !== null) {
		row.towers++
		row.towerSeconds += report.firstTower
	}
	for (const s of Object.values(report.seats))
		for (const k of ['deaths', 'damage', 'structureHits']) row[s.team][k] += s[k]
	mergeReport(cell.totals, report, winner)
}

export function table(header, rows) {
	const widths = header.map((h, c) => Math.max(h.length, ...rows.map((l) => String(l[c]).length)))
	const fmt = (cells) =>
		cells
			.map((cell, c) => String(cell).padEnd(widths[c]))
			.join('  ')
			.trimEnd()
	return [fmt(header), fmt(widths.map((w) => '-'.repeat(w))), ...rows.map(fmt)].join('\n')
}

const clock = (seconds) =>
	`${Math.floor(Math.round(seconds) / 60)}:${String(Math.round(seconds) % 60).padStart(2, '0')}`

// One value, or "base → working" when there is a base.
const pair = (base, work, f) => {
	const show = (x) => (x === undefined || Number.isNaN(x) ? '-' : f(x))
	return base === null ? show(work) : `${show(base)} → ${show(work)}`
}
const fixed = (digits) => (x) => x.toFixed(digits)

// The headline win rates: each ordered cross matchup's A win % and each hero's edge.
// Without a base a rate is decided when its interval leaves 50%; with one, when the delta's leaves 0.
function headlines(cell, base) {
	const rates = []
	for (const [key, r] of Object.entries(cell.rows)) {
		const [a, b] = key.split(' v ')
		if (a !== b) rates.push([r.aWins, r.decided, base?.rows[key], (x) => [x.aWins, x.decided]])
	}
	for (const [id, h] of Object.entries(cell.totals.heroes))
		if (h.edge)
			rates.push([h.edgeWins, h.edge, base?.totals.heroes[id], (x) => [x.edgeWins, x.edge]])
	return rates
}

export function undecided(cells, bases) {
	let open = 0,
		all = 0
	cells.forEach((cell, i) => {
		for (const [k, n, other, read] of headlines(cell, bases?.[i])) {
			all++
			if (bases) {
				const [k0, n0] = other ? read(other) : [0, 0]
				if (!deltaDecided(difference(k, n, k0, n0))) open++
			} else if (!rateDecided(k, n)) open++
		}
	})
	return { open, all }
}

const rateColumns = (k, n, other, read) => {
	if (other === null) return [rateCell(k, n)]
	const [k0, n0] = other ? read(other) : [0, 0]
	const interval = difference(k, n, k0, n0)
	const d = (n ? k / n : 0) - (n0 ? k0 / n0 : 0)
	return [
		rateCell(k0, n0),
		rateCell(k, n),
		n && n0 ? deltaCell(interval, d) : '-',
		n && n0 ? deltaVerdict(interval) : '-',
	]
}

// Matchup and hero tables, always printed. sides: [{ label, cells }] with the base first, if any;
// cells are per variant.
export function summarySections(sides, labels) {
	const two = sides.length > 1
	const work = sides.at(-1).cells,
		base = two ? sides[0].cells : null
	const rateHeader = (name) =>
		two
			? [`${name} base`, `${name} working`, 'Δ points [approx. 95%]', 'verdict']
			: [`${name} [95%]`]
	const out = []

	const matchups = []
	work.forEach((cell, v) => {
		const keys = [...new Set([...Object.keys(cell.rows), ...Object.keys(base?.[v].rows ?? {})])]
		for (const key of keys.sort()) {
			const r = cell.rows[key],
				b = base ? (base[v].rows[key] ?? undefined) : null
			const avg = (x, f) => (x ? f(x) : undefined)
			matchups.push([
				labels[v],
				key,
				two ? `${b?.n ?? 0}+${r?.n ?? 0}` : r.n,
				...rateColumns(r?.aWins ?? 0, r?.decided ?? 0, b, (x) => [x.aWins, x.decided]),
				...(two
					? []
					: [
							`${(r.B.deaths / r.n).toFixed(1)}-${(r.A.deaths / r.n).toFixed(1)}`,
							`${Math.round(r.A.damage / r.n)}-${Math.round(r.B.damage / r.n)}`,
							`${(r.A.structureHits / r.n).toFixed(1)}-${(r.B.structureHits / r.n).toFixed(1)}`,
						]),
				pair(
					b && avg(b, (x) => (x.towers ? x.towerSeconds / x.towers : NaN)),
					avg(r, (x) => (x.towers ? x.towerSeconds / x.towers : NaN)),
					clock,
				),
				pair(
					b && avg(b, (x) => x.seconds / x.n / 60),
					avg(r, (x) => x.seconds / x.n / 60),
					fixed(1),
				),
			])
		}
	})
	out.push(
		table(
			[
				'variant',
				'matchup (A v B)',
				two ? 'matches b+w' : 'matches',
				...rateHeader('A win %'),
				...(two ? [] : ['kills A-B', 'dmg A-B', 'struct hits A-B']),
				'1st tower m:ss',
				'minutes',
			],
			matchups,
		),
	)

	const heroes = []
	work.forEach((cell, v) => {
		const t = cell.totals,
			bt = base ? base[v].totals : null
		const ids = [...new Set([...Object.keys(t.heroes), ...Object.keys(bt?.heroes ?? {})])].sort()
		for (const id of ids) {
			const h = t.heroes[id],
				bh = bt ? (bt.heroes[id] ?? undefined) : null
			const per = (k, digits) => pair(bh && bh[k] / bh.seats, h && h[k] / h.seats, fixed(digits))
			heroes.push([
				labels[v],
				id,
				...(h?.edge || bh?.edge
					? rateColumns(h?.edgeWins ?? 0, h?.edge ?? 0, bh, (x) => [x.edgeWins, x.edge])
					: rateHeader('').map(() => '-')),
				pair(bh && (100 * bh.wins) / bh.decided, h && (100 * h.wins) / h.decided, fixed(0)),
				per('damage', 0),
				per('heroDamage', 0),
				per('deaths', 1),
				per('structureHits', 1),
				per('catches', 1),
				per('dunks', 2),
				per('dunked', 2),
			])
		}
	})
	out.push(
		'\nPer hero, per seat and match. Edge: win % of the team fielding more of this hero.',
		table(
			[
				'variant',
				'hero',
				...rateHeader('edge %'),
				'seat win %',
				'dmg',
				'hero dmg',
				'deaths',
				'struct hits',
				'catches',
				'dunks',
				'dunked',
			],
			heroes,
		),
	)
	return out.join('\n')
}

// `--report`: per ability, deaths by killer, damage taken by source and bot states, for the first
// variant (sweeps compare in the tables above).
export function reportSections(sides) {
	const two = sides.length > 1
	const work = sides.at(-1).cells[0].totals,
		base = two ? sides[0].cells[0].totals : null
	const val = (fn, digits = 0) => pair(base && fn(base), fn(work), fixed(digits))
	const all = [work, ...(base ? [base] : [])]
	const keys = (pick) => [...new Set(all.flatMap((t) => Object.keys(pick(t))))].sort()
	const inner = (pick) =>
		[...new Set(all.flatMap((t) => Object.values(pick(t)).flatMap(Object.keys)))].sort()
	const seats = (t, id) => t.heroes[id]?.seats || t.matches
	const out = [two ? `\nReport (${sides[0].label} → ${sides[1].label})` : '\nReport']

	out.push(
		'\nPer ability, per match',
		table(
			['hero ability', 'casts', 'hits', 'hero hits', 'damage'],
			keys((t) => t.abilities).map((id) => {
				const per = (k) => (t) => (t.abilities[id] ? t.abilities[id][k] / t.matches : 0)
				return [
					id,
					val(per('casts'), 1),
					val(per('hits'), 1),
					val(per('heroHits'), 1),
					val(per('damage')),
				]
			}),
		),
	)

	const kinds = inner((t) => t.deathsBy)
	out.push(
		'\nDeaths per seat and match, by killer',
		table(
			['victim', ...kinds],
			keys((t) => t.deathsBy).map((v) => [
				v,
				...kinds.map((k) => val((t) => (t.deathsBy[v]?.[k] ?? 0) / seats(t, v), 2)),
			]),
		),
	)

	const taken = []
	for (const victim of keys((t) => t.taken)) {
		const sources = inner((t) => ({ v: t.taken[victim] ?? {} }))
		const amount = (t, src) => (t.taken[victim]?.[src] ?? 0) / seats(t, victim)
		sources.sort((a, b) => amount(work, b) - amount(work, a))
		for (const src of sources) taken.push([victim, src, val((t) => amount(t, src))])
	}
	out.push(
		'\nDamage taken per seat and match, by source',
		table(['victim', 'source', 'damage'], taken),
	)

	for (const [title, pick, share] of [
		['\nBot state, % of alive time', (t) => t.states, true],
		['\nWhere each seat spends its alive time, % (two-lane maps)', (t) => t.lanes, true],
		[
			'\nBot state in a siege window (≥2 friendly minions at a vulnerable enemy tower), seconds per bot and match; in = within tower range, out = within 20 m',
			(t) => t.siege,
			false,
		],
	]) {
		// Columns that never reach a second or a percent are noise.
		const states = inner(pick).filter((state) =>
			all.some((t) =>
				Object.entries(pick(t)).some(([kit, row]) => {
					const sum = Object.values(row).reduce((a, b) => a + b, 0)
					return share
						? (100 * (row[state] ?? 0)) / sum >= 1
						: (row[state] ?? 0) / seats(t, kit) >= 1
				}),
			),
		)
		out.push(
			title,
			table(
				['hero', ...states],
				keys(pick).map((kit) => [
					kit,
					...states.map((state) =>
						val((t) => {
							const row = pick(t)[kit]
							if (!row) return undefined
							const sum = Object.values(row).reduce((a, b) => a + b, 0)
							return share ? (100 * (row[state] ?? 0)) / sum : (row[state] ?? 0) / seats(t, kit)
						}),
					),
				]),
			),
		)
	}
	const lostLanes = inner((t) => t.lost)
	if (lostLanes.length)
		out.push(
			'\nStructures lost per match, by team and lane',
			table(
				['team', ...lostLanes],
				keys((t) => t.lost).map((team) => [
					team,
					...lostLanes.map((l) => val((t) => (t.lost[team]?.[l] ?? 0) / t.matches, 2)),
				]),
			),
		)
	return out.join('\n')
}
