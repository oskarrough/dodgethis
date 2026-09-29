// Participant identity survives round rebuilds; physics unit ids do not.
// Offline the one human is "local", the solo session's participant id.
export function createSoloRoster(enemies = 3, allies = 0) {
	for (const count of [enemies, allies]) {
		if (!Number.isInteger(count) || count < 0)
			throw new Error('Solo team counts must be non-negative integers')
	}
	return [
		{ id: 'local', team: 'A', controller: 'human' },
		...Array.from({ length: enemies }, (_, i) => ({
			id: `bot-B-${i + 1}`,
			team: 'B',
			controller: 'bot',
		})),
		...Array.from({ length: allies }, (_, i) => ({
			id: `bot-A-${i + 1}`,
			team: 'A',
			controller: 'bot',
		})),
	]
}
