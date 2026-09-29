// A roster is the people a mode starts with (docs/plugin-architecture.md, line 4). Two teams, human or bot.
// Return owned, immutable records so caller edits cannot invalidate a live round.
export function validateRoster(roster) {
	if (!Array.isArray(roster) || !roster.length) throw new Error('Roster must be a non-empty array')
	const ids = new Set()
	return Array.from(roster, (participant) => {
		if (!participant || typeof participant !== 'object') throw new Error('Invalid participant')
		const { id, team, controller } = participant
		if (typeof id !== 'string' || !id.trim())
			throw new Error('Participant id must be a non-empty string')
		if (ids.has(id)) throw new Error(`Duplicate participant id: ${id}`)
		ids.add(id)
		if (team !== 'A' && team !== 'B') throw new Error(`Invalid participant team: ${team}`)
		if (controller !== 'human' && controller !== 'bot')
			throw new Error(`Invalid participant controller: ${controller}`)
		return Object.freeze({ id, team, controller })
	})
}
