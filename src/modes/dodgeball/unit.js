import { tune } from './tune.js'
import { bounds } from './arena.js'
import { createBody } from '../../core/body.js'
import { validateRoster } from '../../core/roster.js'
import { createLoadout } from './loadout.js'

// A dodgeball unit: a core body on dodgeball's movement profile, kept to the court when dashing, wearing the loadout.

let _uid = 0

export function createPlayer(
	scene,
	world,
	RAPIER,
	{
		position = [0, 0, 0],
		role = 'teamA',
		team = 'A',
		isHuman = false,
		hp = 1,
		participant,
		replica = false,
		smooth = null,
	} = {},
) {
	// Validate before allocating meshes, bodies or character controllers.
	participant = validateRoster([
		participant ?? {
			id: `unit-${_uid}`,
			team,
			controller: isHuman ? 'human' : 'bot',
		},
	])[0]
	const id = replica ? null : _uid++
	const body = createBody(scene, world, RAPIER, {
		profile: tune.player,
		position,
		role,
		bounds,
		smooth,
		replica,
	})
	return createLoadout(body, { id, participant, hp, replica })
}
