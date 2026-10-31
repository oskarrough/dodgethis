import { tune } from './tune.js'
import { HEROES } from './heroes.js'

// Talent trees (docs/pve.md). A hero's tree is data in its own folder, `heroes/<id>/<id>-talents.js`,
// handed to the hero as `talents`: `{ bot: [column per row], rows: [[talent, talent, talent], …] }`.
// Row n opens at level `tune.talents.first + n`; you pick one of its three, lowest open row first,
// and the pick lasts the run. Each talent's numbers live in the hero's tune at `talents.<id>`.
//
// A talent changes the hero by changing its definition, never the shared tables:
// - `stats: { <ability>: { key: value | (value, numbers, stats) => value } }` restates live numbers;
// - `ability: { <ability>: { field: value } }` overrides manifest fields (pierce, root, …);
// - `after: { <ability>: { onStart | onEnd | onTick | watch: fn } }` runs after the ability's own hook;
// - `stages: { <ability>: { release | land | dashEnd | end | hit: fn } }` runs after that stage;
// - `traits: { onHit | onTick | onDeath | onCatch: fn }` runs after the hero's own trait;
// - `on: { cast | tick | amplify | damage | absorb | hit | damaged | death: fn }` are aura hooks.
// Every hook gets `numbers` (its tune) and `state` (its own scratch object on the hero).

export const treeOf = (heroId) => HEROES[heroId]?.talents ?? null
export const rowLevel = (row) => tune.talents.first + row
export const numbersOf = (heroId, talentId) => tune.heroes[heroId]?.talents?.[talentId] ?? {}

// The lowest row without a pick, if the hero's level has reached it; otherwise -1.
export function openRow(hero) {
	const tree = treeOf(hero.heroId)
	if (!tree || !hero.talents) return -1
	const row = tree.rows.findIndex((_, r) => hero.talents[r] == null)
	return row >= 0 && hero.level >= rowLevel(row) ? row : -1
}

// The talents a set of picks names, in row order.
export function pickedTalents(heroId, picks) {
	const tree = treeOf(heroId)
	return (picks ?? []).map((column, row) => tree?.rows[row]?.[column]).filter(Boolean)
}

const copy = (object) => Object.defineProperties({}, Object.getOwnPropertyDescriptors(object))
const chain = (first, then) => (context) => {
	const result = first?.(context)
	then(context)
	return result
}
// An ability stage may be a function, an action list or a { before, do, replace, after } record.
function afterStage(stage, then) {
	if (stage === undefined) return { after: then }
	if (typeof stage === 'function') return { replace: stage, after: then }
	if (Array.isArray(stage)) return { do: stage, after: then }
	return { ...stage, after: chain(stage.after, then) }
}

function talentedAbility(heroId, ability, talents, state) {
	const id = ability.id
	const touching = talents.filter((t) =>
		['stats', 'ability', 'after', 'stages'].some((field) => t[field]?.[id]),
	)
	if (!touching.length) return ability
	const out = copy(ability)
	const restated = touching.filter((t) => t.stats?.[id])
	if (restated.length)
		Object.defineProperty(out, 'stats', {
			enumerable: true,
			configurable: true,
			get() {
				let stats = ability.stats
				for (const t of restated) {
					stats = { ...stats }
					for (const [key, value] of Object.entries(t.stats[id]))
						stats[key] =
							typeof value === 'function'
								? value(stats[key], numbersOf(heroId, t.id), stats)
								: value
				}
				return stats
			},
		})
	for (const t of touching) {
		Object.assign(out, t.ability?.[id])
		const extra = (context) => ({ ...context, numbers: numbersOf(heroId, t.id), state: state(t) })
		for (const [name, fn] of Object.entries(t.after?.[id] ?? {})) {
			const own = out[name]
			out[name] = (context) => {
				const result = own?.call(out, context)
				fn(extra(context))
				return result
			}
		}
		if (t.stages?.[id]) {
			out.stages = { ...out.stages }
			for (const [name, fn] of Object.entries(t.stages[id]))
				out.stages[name] = afterStage(out.stages[name], (context) => fn(extra(context)))
		}
	}
	return out
}

// A hero's definition with its picks applied: a copy of the shared one, built once per hero and
// pick list. `state(talent)` is the talent's scratch object on that hero.
export function talentedDefinition(base, picks, state) {
	const talents = pickedTalents(base.id, picks)
	if (!talents.length) return base
	const out = copy(base)
	out.abilities = Object.fromEntries(
		Object.entries(base.abilities).map(([slot, ability]) => [
			slot,
			ability && talentedAbility(base.id, ability, talents, state),
		]),
	)
	const traits = { ...base.traits }
	for (const t of talents)
		for (const [name, fn] of Object.entries(t.traits ?? {}))
			traits[name] = chain(traits[name], (context) =>
				fn({ ...context, numbers: numbersOf(base.id, t.id), state: state(t) }),
			)
	out.traits = traits
	out.talentAuras = talents
		.filter((t) => t.on)
		.map((t) => ({
			id: t.id,
			on: t.on,
			get numbers() {
				return numbersOf(base.id, t.id)
			},
			get state() {
				return state(t)
			},
		}))
	return out
}

// Take the open row's `column` for this hero; null when no row is open or the column is wrong.
export function pickTalent(hero, column) {
	const row = openRow(hero)
	const talent = row >= 0 ? treeOf(hero.heroId).rows[row][column] : null
	if (!talent) return null
	hero.talents[row] = column
	hero.talentState ??= {}
	const state = (t) => (hero.talentState[t.id] ??= {})
	hero.definition = talentedDefinition(HEROES[hero.heroId], hero.talents, state)
	return { row, column, talent }
}

// What a bot takes in an open row: its hero's preference, else the first.
export const botColumn = (hero, row) => treeOf(hero.heroId)?.bot?.[row] ?? 0

// Aura hooks of the picked talents, for statuses.js reactAuras.
export function talentListeners(unit, name) {
	return (unit.definition?.talentAuras ?? [])
		.filter((talent) => talent.on[name])
		.map((talent) => ({ talent, hook: talent.on[name] }))
}
