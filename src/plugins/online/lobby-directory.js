export function createLobbyDirectory({ request = globalThis.fetch.bind(globalThis) } = {}) {
	let listing = null
	let timer = null
	let reportError = () => {}
	let queue = Promise.resolve()
	async function send(method, body) {
		const response = await request('/api/lobbies', {
			method,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(5000),
			keepalive: true,
		})
		if (!response.ok) throw new Error('Could not update the public lobby. Please try again.')
	}
	return {
		async list() {
			const response = await request('/api/lobbies', {
				signal: AbortSignal.timeout(5000),
				cache: 'no-store',
			})
			if (!response.ok) throw new Error('Could not find public lobbies. Please try again.')
			return response.json()
		},
		async start(state, onError) {
			reportError = onError
			listing = {
				code: state.code,
				token: uuid(),
				players: state.humans.length,
				accepting: state.phase === 'lobby',
			}
			const current = listing
			queue = queue.catch(() => {}).then(() => send('PUT', current))
			await queue
			if (listing !== current) return
			timer = setInterval(() => {
				queue = queue.catch(() => {}).then(() => send('PUT', { ...current }))
				queue.catch(onError)
			}, 15000)
		},
		update(state) {
			if (!listing) return
			listing.players = state.humans.length
			listing.accepting = state.phase === 'lobby'
			const current = { ...listing }
			queue = queue.catch(() => {}).then(() => send('PUT', current))
			queue.catch(reportError)
		},
		stop() {
			clearInterval(timer)
			timer = null
			const previous = listing
			listing = null
			if (previous)
				queue = queue
					.catch(() => {})
					.then(() => send('DELETE', previous))
					.catch(() => {})
		},
	}
}

// randomUUID exists only on https and localhost; LAN play is plain http, so build the same shape by hand.
function uuid() {
	const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
		n.toString(16).padStart(2, '0'),
	).join('')
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
