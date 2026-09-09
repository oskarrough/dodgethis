export default {
	async fetch(request, env) {
		if (new URL(request.url).pathname === '/api/lobbies') {
			return env.LOBBIES.get(env.LOBBIES.idFromName('public')).fetch(request)
		}
		return env.ASSETS.fetch(request)
	},
}

export class LobbyDirectory {
	constructor(ctx) {
		this.sql = ctx.storage.sql
		this.sql.exec(
			'CREATE TABLE IF NOT EXISTS lobbies (code TEXT PRIMARY KEY, token TEXT NOT NULL, players INTEGER NOT NULL, accepting INTEGER NOT NULL, expires INTEGER NOT NULL)',
		)
	}
	async fetch(request) {
		this.sql.exec('DELETE FROM lobbies WHERE expires <= ?', Date.now())
		if (request.method === 'GET') {
			const lobbies = [
				...this.sql.exec(
					'SELECT code FROM lobbies WHERE accepting = 1 AND players < 8 ORDER BY players DESC, code LIMIT 100',
				),
			]
			return Response.json(lobbies, { headers: { 'Cache-Control': 'no-store' } })
		}
		if (!['PUT', 'DELETE'].includes(request.method))
			return new Response('Method not allowed', { status: 405 })
		let body
		try {
			body = await request.json()
		} catch {
			return new Response('Invalid JSON', { status: 400 })
		}
		if (
			!/^[A-HJ-NP-Z2-9]{5,6}$/.test(body?.code) ||
			typeof body?.token !== 'string' ||
			!/^[a-f0-9-]{36}$/.test(body.token)
		)
			return new Response('Invalid lobby', { status: 400 })
		const existing = [...this.sql.exec('SELECT token FROM lobbies WHERE code = ?', body.code)][0]
		if (existing && existing.token !== body.token)
			return new Response('Lobby already registered', { status: 403 })
		if (request.method === 'DELETE') this.sql.exec('DELETE FROM lobbies WHERE code = ?', body.code)
		else {
			if (
				!Number.isInteger(body.players) ||
				body.players < 1 ||
				body.players > 8 ||
				typeof body.accepting !== 'boolean'
			)
				return new Response('Invalid lobby', { status: 400 })
			this.sql.exec(
				'INSERT OR REPLACE INTO lobbies VALUES (?, ?, ?, ?, ?)',
				body.code,
				body.token,
				body.players,
				Number(body.accepting),
				Date.now() + 45000,
			)
		}
		return new Response(null, { status: 204 })
	}
}
