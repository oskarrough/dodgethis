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

export function matchReport(roster, { STEP, towerRange, count = [] }) {
	const seats = new Map(roster.map((seat) => [seat.id, seat]))
	const hero = (id) => seats.get(id)?.heroId
	const counters = {
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
		summonsDestroyed: {},
		statusLabels: {},
		abilities: {},
		deathsBy: {},
		taken: {},
		states: {},
		siege: {},
		lanes: {},
		lost: {},
		falls: [],
		counts: Object.fromEntries(count.map((kind) => [kind, { A: 0, B: 0 }])),
	}
	const firstHit = new Map()
	const player = roster.find((seat) => seat.controller === 'agent')?.id
	const ability = (seat, id) =>
		(counters.abilities[`${hero(seat)} ${id ?? '?'}`] ??= {
			casts: 0,
			hits: 0,
			heroHits: 0,
			damage: 0,
		})
	const add = (bucket, key, value) => (bucket[key] = (bucket[key] ?? 0) + value)
	return {
		report: counters,
		row(row) {
			for (const label of Object.keys(row.fact?.statusLabels ?? {}))
				counters.statusLabels[label] = true
			if (row.kind in counters.counts) add(counters.counts[row.kind], row.team ?? '-', 1)
			if (row.kind === 'hit' && row.target && !firstHit.has(row.target))
				firstHit.set(row.target, row.tick * STEP)
			if (row.kind === 'structureDown')
				counters.falls.push({ id: row.target, at: row.tick * STEP, hit: firstHit.get(row.target) })
			const seat = seats.has(row.seat) ? row.seat : null
			if (row.kind === 'cast' && seat) ability(seat, row.ability_id).casts++
			// Support contacts count as hits too, but never as damage.
			if (row.kind === 'contact' && seat) {
				const outcome = ability(seat, row.ability_id)
				outcome.hits++
				if (seats.has(row.target)) outcome.heroHits++
			}
			if (row.kind === 'hit' && seat) {
				const abilityStats = ability(seat, row.ability_id),
					seatStats = counters.seats[seat]
				if (!row.fact?.ambient) abilityStats.hits++
				abilityStats.damage += row.effective_damage
				seatStats.damage += row.effective_damage
				if (seats.has(row.target)) {
					if (!row.fact?.ambient) abilityStats.heroHits++
					seatStats.heroDamage += row.effective_damage
				}
				if (structure(row.target) && !row.fact?.ambient) seatStats.structureHits++
			}
			if (
				row.kind === 'hit' &&
				seats.has(row.target) &&
				!counters.seats[row.target].idle &&
				row.effective_damage
			) {
				const source = seat
					? `${hero(seat)} ${row.ability_id ?? '?'}`
					: killerKind(row.fact?.source, seats)
				add((counters.taken[hero(row.target)] ??= {}), source, row.effective_damage)
			}
			// Ball catches aren't skill; only caught ability shots count.
			if (row.kind === 'caught' && seat && row.fact?.ability) counters.seats[seat].catches++
			// Flagfall: a shove off the court through a fence gap.
			if (row.kind === 'dunk') {
				if (seats.has(row.target)) counters.seats[row.target].dunked++
				if (seats.has(row.fact?.source)) counters.seats[row.fact.source].dunks++
			}
			if (
				row.kind === 'structureDown' &&
				row.target?.startsWith('tower') &&
				counters.firstTower === null
			)
				counters.firstTower = row.tick * STEP
			if (row.kind === 'death' && row.fact?.summon)
				add(
					(counters.summonsDestroyed[row.fact.summon] ??= {}),
					killerKind(row.fact.source, seats),
					1,
				)
			if (row.kind === 'death' && seats.has(row.target)) {
				counters.seats[row.target].deaths++
				if (counters.seats[row.target].idle) return
				const by = (counters.deathsBy[hero(row.target)] ??= {})
				add(by, killerKind(row.fact?.source, seats), 1)
			}
		},
		// Fallen structures by kind; a laser gate reads as one.
		finish(sim) {
			const kinds = new Map(sim.lane.structures.map((item) => [item.id, item.kind]))
			for (const fall of counters.falls) {
				const kind = kinds.get(fall.id) ?? fall.id.split('-')[0]
				fall.kind = kind === 'laser' ? 'laser gate' : kind
			}
		},
		tick(sim) {
			if (sim.lanes?.length > 1) {
				for (const heroUnit of sim.heroes) {
					if (heroUnit.dead) continue
					const key = heroUnit.id === player ? `${heroUnit.id} (player)` : heroUnit.id
					add((counters.lanes[key] ??= {}), zone(sim.lanes, heroUnit), STEP)
				}
				counters.lost = {}
				for (const item of sim.lane.structures)
					if (item.dead && item.lane) add((counters.lost[item.team] ??= {}), item.lane, 1)
			}
			const brains = sim.bots?.brains
			if (!brains) return
			const lane = sim.lane
			for (const brain of brains) {
				const heroUnit = sim.heroes.find((unit) => unit.id === brain.id)
				if (!heroUnit || heroUnit.dead) continue
				const kit = hero(brain.id) ?? heroUnit.definition?.id
				add((counters.states[kit] ??= {}), brain.state ?? '?', STEP)
				const tower = lane.structures.find(
					(candidate) =>
						!candidate.dead &&
						candidate.team !== heroUnit.team &&
						candidate.id.startsWith('tower') &&
						lane.vulnerable(candidate),
				)
				if (!tower) continue
				const towerPosition = tower.body.position
				const near = lane.minions.filter(
					(minion) =>
						!minion.dead &&
						minion.team === heroUnit.team &&
						Math.hypot(
							minion.body.position.x - towerPosition.x,
							minion.body.position.z - towerPosition.z,
						) <= towerRange,
				).length
				if (near < SIEGE_MINIONS) continue
				const distance = Math.hypot(
					heroUnit.body.position.x - towerPosition.x,
					heroUnit.body.position.z - towerPosition.z,
				)
				const where = distance <= towerRange + 1.5 ? 'in' : distance <= 20 ? 'out' : 'far'
				add((counters.siege[kit] ??= {}), `${brain.state ?? '?'}:${where}`, STEP)
			}
		},
	}
}

// Two-lane maps: the lane a hero stands in (within LANE_BAND of its path), home near its spawn, else yard.
const LANE_BAND = 6
const HOME = 15
function zone(lanes, heroUnit) {
	const position = heroUnit.body.position
	if (
		heroUnit.spawn &&
		Math.hypot(position.x - heroUnit.spawn.x, position.z - heroUnit.spawn.z) <= HOME
	)
		return 'home'
	const near = (path) =>
		Math.min(
			...path.slice(1).map((to, index) => {
				const from = path[index],
					dx = to.x - from.x,
					dz = to.z - from.z,
					t = Math.max(
						0,
						Math.min(
							1,
							((position.x - from.x) * dx + (position.z - from.z) * dz) / (dx * dx + dz * dz || 1),
						),
					)
				return Math.hypot(position.x - from.x - dx * t, position.z - from.z - dz * t)
			}),
		)
	return lanes.find((entry) => near(entry.path) <= LANE_BAND)?.id ?? 'yard'
}

export function emptyTotals() {
	return {
		matches: 0,
		summonsDestroyed: {},
		statusLabels: {},
		decided: 0,
		heroes: {},
		abilities: {},
		deathsBy: {},
		taken: {},
		states: {},
		siege: {},
		lanes: {},
		lost: {},
		falls: {},
		counts: {},
	}
}

const sumInto = (into, from) => {
	for (const [key, value] of Object.entries(from)) {
		if (typeof value === 'number') into[key] = (into[key] ?? 0) + value
		else sumInto((into[key] ??= {}), value)
	}
}

export function mergeReport(totals, report, winner) {
	Object.assign(totals.statusLabels, report.statusLabels ?? {})
	totals.matches++
	if (winner) totals.decided++
	const count = { A: {}, B: {} }
	for (const seat of Object.values(report.seats)) {
		if (seat.idle) continue
		count[seat.team][seat.hero] = (count[seat.team][seat.hero] ?? 0) + 1
		const heroTotals = (totals.heroes[seat.hero] ??= {
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
		heroTotals.seats++
		if (winner) heroTotals.decided++
		if (winner === seat.team) heroTotals.wins++
		for (const statKey of [
			'damage',
			'heroDamage',
			'deaths',
			'structureHits',
			'catches',
			'dunks',
			'dunked',
		])
			heroTotals[statKey] += seat[statKey]
	}
	// Edge: in a decided match where one team fields more of this hero, did that team win? One sample
	// per match, so it takes a Wilson interval; for one-hero teams it is simply the hero's win rate.
	if (winner)
		for (const [id, heroTotals] of Object.entries(totals.heroes)) {
			const aCount = count.A[id] ?? 0,
				bCount = count.B[id] ?? 0
			if (aCount === bCount) continue
			heroTotals.edge++
			if ((aCount > bCount ? 'A' : 'B') === winner) heroTotals.edgeWins++
		}
	for (const key of ['abilities', 'deathsBy', 'taken', 'states', 'siege', 'lanes', 'lost'])
		sumInto(totals[key], report[key])
	sumInto(totals.counts, report.counts)
	sumInto(totals.summonsDestroyed, report.summonsDestroyed ?? {})
	for (const { kind, at, hit } of report.falls) {
		const fallStats = (totals.falls[kind] ??= { at: [], took: [] })
		fallStats.at.push(at)
		if (hit !== undefined) fallStats.took.push(at - hit)
	}
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
	for (const seat of Object.values(report.seats))
		for (const statKey of ['deaths', 'damage', 'structureHits'])
			row[seat.team][statKey] += seat[statKey]
	mergeReport(cell.totals, report, winner)
}

export function table(header, rows) {
	const widths = header.map((heading, column) =>
		Math.max(heading.length, ...rows.map((line) => String(line[column]).length)),
	)
	const fmt = (cells) =>
		cells
			.map((cell, column) => String(cell).padEnd(widths[column]))
			.join('  ')
			.trimEnd()
	return [fmt(header), fmt(widths.map((width) => '-'.repeat(width))), ...rows.map(fmt)].join('\n')
}

const clock = (seconds) =>
	`${Math.floor(Math.round(seconds) / 60)}:${String(Math.round(seconds) % 60).padStart(2, '0')}`

// One value, or "base → working" when there is a base.
const pair = (base, work, format) => {
	const show = (value) => (value === undefined || Number.isNaN(value) ? '-' : format(value))
	return base === null ? show(work) : `${show(base)} → ${show(work)}`
}
const fixed = (digits) => (value) => value.toFixed(digits)
const median = (values) => {
	if (!values?.length) return undefined
	const sorted = [...values].sort((a, b) => a - b),
		middle = sorted.length >> 1
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

// The headline win rates: each ordered cross matchup's A win % and each hero's edge.
// Without a base a rate is decided when its interval leaves 50%; with one, when the delta's leaves 0.
function headlines(cell, base) {
	const rates = []
	for (const [key, row] of Object.entries(cell.rows)) {
		const [left, right] = key.split(' v ')
		if (left !== right)
			rates.push([row.aWins, row.decided, base?.rows[key], (entry) => [entry.aWins, entry.decided]])
	}
	for (const [id, heroStats] of Object.entries(cell.totals.heroes))
		if (heroStats.edge)
			rates.push([
				heroStats.edgeWins,
				heroStats.edge,
				base?.totals.heroes[id],
				(entry) => [entry.edgeWins, entry.edge],
			])
	return rates
}

export function undecided(cells, bases) {
	let open = 0,
		all = 0
	cells.forEach((cell, i) => {
		for (const [wins, decided, other, read] of headlines(cell, bases?.[i])) {
			all++
			if (bases) {
				const [wins0, decided0] = other ? read(other) : [0, 0]
				if (!deltaDecided(difference(wins, decided, wins0, decided0))) open++
			} else if (!rateDecided(wins, decided)) open++
		}
	})
	return { open, all }
}

const rateColumns = (wins, decided, other, read) => {
	if (other === null) return [rateCell(wins, decided)]
	const [wins0, decided0] = other ? read(other) : [0, 0]
	const interval = difference(wins, decided, wins0, decided0)
	const delta = (decided ? wins / decided : 0) - (decided0 ? wins0 / decided0 : 0)
	return [
		rateCell(wins0, decided0),
		rateCell(wins, decided),
		decided && decided0 ? deltaCell(interval, delta) : '-',
		decided && decided0 ? deltaVerdict(interval) : '-',
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
	const output = []

	const matchups = []
	work.forEach((cell, index) => {
		const keys = [...new Set([...Object.keys(cell.rows), ...Object.keys(base?.[index].rows ?? {})])]
		for (const key of keys.sort()) {
			const row = cell.rows[key],
				baseRow = base ? (base[index].rows[key] ?? undefined) : null
			const avg = (entry, format) => (entry ? format(entry) : undefined)
			matchups.push([
				labels[index],
				key,
				two ? `${baseRow?.n ?? 0}+${row?.n ?? 0}` : row.n,
				...rateColumns(row?.aWins ?? 0, row?.decided ?? 0, baseRow, (entry) => [
					entry.aWins,
					entry.decided,
				]),
				...(two
					? []
					: [
							`${(row.B.deaths / row.n).toFixed(1)}-${(row.A.deaths / row.n).toFixed(1)}`,
							`${Math.round(row.A.damage / row.n)}-${Math.round(row.B.damage / row.n)}`,
							`${(row.A.structureHits / row.n).toFixed(1)}-${(row.B.structureHits / row.n).toFixed(1)}`,
						]),
				pair(
					baseRow &&
						avg(baseRow, (entry) => (entry.towers ? entry.towerSeconds / entry.towers : NaN)),
					avg(row, (entry) => (entry.towers ? entry.towerSeconds / entry.towers : NaN)),
					clock,
				),
				pair(
					baseRow && avg(baseRow, (entry) => entry.seconds / entry.n / 60),
					avg(row, (entry) => entry.seconds / entry.n / 60),
					fixed(1),
				),
			])
		}
	})
	output.push(
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
	work.forEach((cell, index) => {
		const totals = cell.totals,
			baseTotals = base ? base[index].totals : null
		const ids = [
			...new Set([...Object.keys(totals.heroes), ...Object.keys(baseTotals?.heroes ?? {})]),
		].sort()
		for (const id of ids) {
			const heroStats = totals.heroes[id],
				baseHero = baseTotals ? (baseTotals.heroes[id] ?? undefined) : null
			const per = (stat, digits) =>
				pair(
					baseHero && baseHero[stat] / baseHero.seats,
					heroStats && heroStats[stat] / heroStats.seats,
					fixed(digits),
				)
			heroes.push([
				labels[index],
				id,
				...(heroStats?.edge || baseHero?.edge
					? rateColumns(heroStats?.edgeWins ?? 0, heroStats?.edge ?? 0, baseHero, (entry) => [
							entry.edgeWins,
							entry.edge,
						])
					: rateHeader('').map(() => '-')),
				pair(
					baseHero && (100 * baseHero.wins) / baseHero.decided,
					heroStats && (100 * heroStats.wins) / heroStats.decided,
					fixed(0),
				),
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
	output.push(
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
	return output.join('\n')
}

// `--report`: per ability, deaths by killer, damage taken by source and bot states, for the first
// variant (sweeps compare in the tables above).
export function reportSections(sides) {
	const two = sides.length > 1
	const work = sides.at(-1).cells[0].totals,
		base = two ? sides[0].cells[0].totals : null
	const val = (fn, digits = 0) => pair(base && fn(base), fn(work), fixed(digits))
	const all = [work, ...(base ? [base] : [])]
	const keys = (pick) => [...new Set(all.flatMap((totals) => Object.keys(pick(totals))))].sort()
	const inner = (pick) =>
		[...new Set(all.flatMap((totals) => Object.values(pick(totals)).flatMap(Object.keys)))].sort()
	const seats = (totals, id) => totals.heroes[id]?.seats || totals.matches
	const output = [two ? `\nReport (${sides[0].label} → ${sides[1].label})` : '\nReport']
	const statusLabels = keys((totals) => totals.statusLabels ?? {})
	if (statusLabels.length) output.push(`Statuses: ${statusLabels.join(', ')}`)

	output.push(
		'\nPer ability, per match',
		table(
			['hero ability', 'casts', 'hits', 'hero hits', 'damage'],
			keys((totals) => totals.abilities).map((id) => {
				const per = (stat) => (totals) =>
					totals.abilities[id] ? totals.abilities[id][stat] / totals.matches : 0
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

	const summonKillers = inner((totals) => totals.summonsDestroyed ?? {})
	if (summonKillers.length)
		output.push(
			'\nSummons destroyed per match, by killer',
			table(
				['summon', 'total', ...summonKillers],
				keys((totals) => totals.summonsDestroyed ?? {}).map((id) => [
					id,
					val(
						(totals) =>
							Object.values(totals.summonsDestroyed?.[id] ?? {}).reduce((a, b) => a + b, 0) /
							totals.matches,
						2,
					),
					...summonKillers.map((kind) =>
						val((totals) => (totals.summonsDestroyed?.[id]?.[kind] ?? 0) / totals.matches, 2),
					),
				]),
			),
		)

	const kinds = inner((totals) => totals.deathsBy)
	output.push(
		'\nDeaths per seat and match, by killer',
		table(
			['victim', ...kinds],
			keys((totals) => totals.deathsBy).map((victim) => [
				victim,
				...kinds.map((kind) =>
					val((totals) => (totals.deathsBy[victim]?.[kind] ?? 0) / seats(totals, victim), 2),
				),
			]),
		),
	)

	const taken = []
	for (const victim of keys((totals) => totals.taken)) {
		const sources = inner((totals) => ({ victim: totals.taken[victim] ?? {} }))
		const amount = (totals, source) => (totals.taken[victim]?.[source] ?? 0) / seats(totals, victim)
		sources.sort((a, b) => amount(work, b) - amount(work, a))
		for (const source of sources)
			taken.push([victim, source, val((totals) => amount(totals, source))])
	}
	output.push(
		'\nDamage taken per seat and match, by source',
		table(['victim', 'source', 'damage'], taken),
	)

	for (const [title, pick, share] of [
		['\nBot state, % of alive time', (totals) => totals.states, true],
		['\nWhere each seat spends its alive time, % (two-lane maps)', (totals) => totals.lanes, true],
		[
			'\nBot state in a siege window (≥2 friendly minions at a vulnerable enemy tower), seconds per bot and match; in = within tower range, out = within 20 m',
			(totals) => totals.siege,
			false,
		],
	]) {
		// Columns that never reach a second or a percent are noise.
		const states = inner(pick).filter((state) =>
			all.some((totals) =>
				Object.entries(pick(totals)).some(([kit, row]) => {
					const sum = Object.values(row).reduce((total, value) => total + value, 0)
					return share
						? (100 * (row[state] ?? 0)) / sum >= 1
						: (row[state] ?? 0) / seats(totals, kit) >= 1
				}),
			),
		)
		output.push(
			title,
			table(
				['hero', ...states],
				keys(pick).map((kit) => [
					kit,
					...states.map((state) =>
						val((totals) => {
							const row = pick(totals)[kit]
							if (!row) return undefined
							const sum = Object.values(row).reduce((total, value) => total + value, 0)
							return share
								? (100 * (row[state] ?? 0)) / sum
								: (row[state] ?? 0) / seats(totals, kit)
						}),
					),
				]),
			),
		)
	}
	const order = ['tower', 'gatehouse', 'laser gate', 'fort', 'core']
	const fallKinds = keys((totals) => totals.falls).sort(
		(a, b) => order.indexOf(a) - order.indexOf(b),
	)
	if (fallKinds.length)
		output.push(
			'\nStructure falls: falls per match, median minute it falls, median seconds from first hit to falling',
			table(
				['structure', 'falls', 'minute', 'hit → fall s'],
				fallKinds.map((kind) => [
					kind,
					val((totals) => (totals.falls[kind]?.at.length ?? 0) / totals.matches, 2),
					val((totals) => median(totals.falls[kind]?.at) / 60, 1),
					val((totals) => median(totals.falls[kind]?.took)),
				]),
			),
		)
	const lostLanes = inner((totals) => totals.lost)
	if (lostLanes.length)
		output.push(
			'\nStructures lost per match, by team and lane',
			table(
				['team', ...lostLanes],
				keys((totals) => totals.lost).map((team) => [
					team,
					...lostLanes.map((lane) =>
						val((totals) => (totals.lost[team]?.[lane] ?? 0) / totals.matches, 2),
					),
				]),
			),
		)
	return output.join('\n')
}

// `--count kind,...`: named facts per team and match, per variant.
export function countSections(sides, labels, kinds) {
	const two = sides.length > 1
	const rows = []
	sides.at(-1).cells.forEach((cell, index) => {
		const totals = cell.totals,
			baseTotals = two ? sides[0].cells[index].totals : null
		const per = (source, kind, team) => (source.counts[kind]?.[team] ?? 0) / source.matches
		for (const kind of kinds)
			for (const team of ['A', 'B'])
				rows.push([
					labels[index],
					kind,
					team,
					pair(baseTotals && per(baseTotals, kind, team), per(totals, kind, team), fixed(2)),
				])
	})
	return [
		'\nCounted facts per team and match',
		table(['variant', 'fact', 'team', 'count'], rows),
	].join('\n')
}
