import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { LobbyDirectory } from '../worker/index.js'
import { createLobbyDirectory } from '../src/lobby-directory.js'

function directory() {
	const db = new Database(':memory:')
	const service = new LobbyDirectory({
		storage: { sql: { exec: (sql, ...args) => db.query(sql).all(...args) } },
	})
	return {
		db,
		request: (path, options) => service.fetch(new Request(`https://game.test${path}`, options)),
	}
}

test('public discovery excludes full, running and expired lobbies and protects ownership', async () => {
	const { db, request } = directory()
	const token = crypto.randomUUID()
	const put = (code, players, accepting) =>
		request('/api/lobbies', {
			method: 'PUT',
			body: JSON.stringify({ code, token, players, accepting }),
		})
	await put('ABCDE', 2, true)
	await put('BCDEF', 8, true)
	await put('CDEFG', 3, false)
	await put('DEFGH', 1, true)
	db.query('UPDATE lobbies SET expires = 0 WHERE code = ?').run('DEFGH')
	expect(await (await request('/api/lobbies')).json()).toEqual([{ code: 'ABCDE' }])
	const forbidden = await request('/api/lobbies', {
		method: 'DELETE',
		body: JSON.stringify({ code: 'ABCDE', token: crypto.randomUUID() }),
	})
	expect(forbidden.status).toBe(403)
	await put('CDEFG', 3, true)
	expect(await (await request('/api/lobbies')).json()).toEqual([
		{ code: 'CDEFG' },
		{ code: 'ABCDE' },
	])
	db.close()
})

test('listing client publishes changes and removes the listing after leaving', async () => {
	const { db, request } = directory()
	const client = createLobbyDirectory({ request })
	const state = { code: 'ABCDE', humans: [{}, {}], phase: 'lobby' }
	await client.start(state, () => {})
	expect(await client.list()).toEqual([{ code: 'ABCDE' }])
	client.update({ ...state, phase: 'match' })
	await new Promise((resolve) => setTimeout(resolve, 0))
	expect(await client.list()).toEqual([])
	client.stop()
	await new Promise((resolve) => setTimeout(resolve, 0))
	expect(db.query('SELECT * FROM lobbies').all()).toEqual([])
	db.close()
})
