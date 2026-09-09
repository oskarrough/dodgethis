// Participant identity survives round rebuilds; physics unit ids do not.
// Human ownership is explicit even offline, where "local" is a reserved convention.
export function createSoloRoster(enemies = 3, allies = 0) {
	for (const count of [enemies, allies]) {
		if (!Number.isInteger(count) || count < 0)
			throw new Error('Solo team counts must be non-negative integers')
	}
	return [
		{ id: 'local', team: 'A', controller: 'human', peerId: 'local' },
		...Array.from({ length: enemies }, (_, i) => ({
			id: `bot-B-${i + 1}`,
			team: 'B',
			controller: 'bot',
			peerId: null,
		})),
		...Array.from({ length: allies }, (_, i) => ({
			id: `bot-A-${i + 1}`,
			team: 'A',
			controller: 'bot',
			peerId: null,
		})),
	]
}

// Return owned, immutable records so caller edits cannot invalidate a live round.
export function validateRoster(roster) {
	if (!Array.isArray(roster) || !roster.length) throw new Error('Roster must be a non-empty array')
	const ids = new Set()
	const owners = new Set()
	return Array.from(roster, (participant) => {
		if (!participant || typeof participant !== 'object') throw new Error('Invalid participant')
		const { id, team, controller, peerId = null } = participant
		if (typeof id !== 'string' || !id.trim())
			throw new Error('Participant id must be a non-empty string')
		if (ids.has(id)) throw new Error(`Duplicate participant id: ${id}`)
		ids.add(id)
		if (team !== 'A' && team !== 'B') throw new Error(`Invalid participant team: ${team}`)
		if (controller !== 'human' && controller !== 'bot')
			throw new Error(`Invalid participant controller: ${controller}`)
		if (controller === 'human') {
			if (typeof peerId !== 'string' || !peerId.trim())
				throw new Error('Human participant requires a peerId owner')
			if (owners.has(peerId)) throw new Error(`Duplicate human owner: ${peerId}`)
			owners.add(peerId)
		} else if (peerId !== null) throw new Error('Bot participant cannot have a peerId owner')
		return Object.freeze({ id, team, controller, peerId })
	})
}
