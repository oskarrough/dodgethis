import { tune } from './tune.js'
import { unitFromDeclaration } from './unit-definition.js'

export const STRUCTURE_DEFINITIONS = Object.fromEntries(
	['tower', 'fort', 'gatehouse', 'laser', 'core'].map((kind) => [
		kind,
		unitFromDeclaration(
			kind,
			{
				hp: 'hp',
				radius: 'radius',
				// Stationary: tune[kind].speed belongs to the projectile, not this body.
				speed: () => 0,
				attack: { damage: 'damage', rate: 'rate', range: 'range', tell: 'tell' },
				brain: 'lane',
			},
			() => tune[kind],
		),
	]),
)

// Forts, guns, gates and cores: built from the layout, shielded until their `after` list falls.
export function createStructures({ layout, makeBody, enabled }) {
	return (enabled ? layout.structures : []).map(({ id, kind, team, x, z, lane, after = [] }) => ({
		id,
		team,
		kind,
		structure: true,
		statuses: [],
		lane,
		after,
		hp: STRUCTURE_DEFINITIONS[kind].base.hp,
		maxHp: STRUCTURE_DEFINITIONS[kind].base.hp,
		dead: false,
		body: makeBody(x, z, team, kind),
		target: null,
		forced: null,
		aggroUntil: 0,
		silentUntil: 0,
		attackTick: 0,
		attack: null,
	}))
}

// `after` is a list (all must fall) or `{ all, any }`.
export const vulnerability = (structures) => (unit) => {
	if (!unit.structure) return true
	const after = unit.after
	const fallen = (id) => structures.find((s) => s.id === id)?.dead === true
	return Array.isArray(after)
		? after.every(fallen)
		: (after.all ?? []).every(fallen) && (!after.any?.length || after.any.some(fallen))
}

// A structure's death: the tower comes off the map, a fort reinforces the enemy's waves in its lane,
// the killers get XP, and a core ends the match.
export function structureDown(shared, unit, killerTeam, t, credit) {
	const { removeTower, reinforcements, addXp, present, match } = shared
	removeTower(unit)
	if (unit.kind === 'fort') {
		const key = `${unit.team === 'A' ? 'B' : 'A'}-${unit.lane}`
		reinforcements[key] = (reinforcements[key] ?? 0) + 1
	}
	const xp = tune[unit.kind].xp ?? tune.waves.structureXp
	addXp(killerTeam, xp, unit.body.position, false, credit(xp))
	present({
		type: 'structureDown',
		target: unit.id,
		team: killerTeam,
		point: { ...unit.body.position },
	})
	if (unit.kind === 'core' && !match.winner) {
		match.winner = killerTeam
		match.endedTick = t
		present({
			type: 'matchOver',
			team: killerTeam,
			target: unit.id,
			point: { ...unit.body.position },
		})
	}
}
