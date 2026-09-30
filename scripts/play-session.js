import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { openSync, closeSync } from 'node:fs'
import { createConnection, createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export function sessionDirectory(name) {
	if (!/^[a-zA-Z0-9_-]+$/.test(name ?? ''))
		throw new Error('session must be a name (letters, digits, _ or -)')
	const scope = createHash('sha256').update(process.cwd()).digest('hex').slice(0, 12)
	return join(
		process.env.PLAY_SESSION_DIR ?? join(tmpdir(), `moba-${process.getuid()}-${scope}`),
		name,
	)
}

export function requestSession(directory, request) {
	return new Promise((resolve, reject) => {
		const socket = createConnection(join(directory, 'socket'))
		let text = ''
		socket.on('connect', () => socket.end(JSON.stringify(request) + '\n'))
		socket.on('data', (chunk) => {
			text += chunk
		})
		socket.on('error', reject)
		socket.on('end', () => resolve(text))
	})
}

export async function sessionCommand(command, argv, values, input) {
	const directory = sessionDirectory(values.session)
	if (command === 'start') {
		await mkdir(join(directory, '..'), { recursive: true, mode: 0o700 })
		try {
			await mkdir(directory, { mode: 0o700 })
		} catch {
			throw new Error('Session already exists; choose another name')
		}
		const log = openSync(join(directory, 'daemon.log'), 'a')
		const child = spawn(
			process.execPath,
			[new URL('./play.js', import.meta.url).pathname, 'serve', ...argv],
			{
				detached: true,
				stdio: ['ignore', log, log],
				env: process.env,
			},
		)
		closeSync(log)
		child.unref()
		await writeFile(join(directory, 'pid'), String(child.pid))
		for (let i = 0; i < 200; i++) {
			try {
				return (
					`session ${values.session} pid=${child.pid} log=${join(directory, 'daemon.log')}\n` +
					(await requestSession(directory, { command: 'observe' }))
				)
			} catch (error) {
				if (!['ENOENT', 'ECONNREFUSED'].includes(error.code)) throw error
				try {
					process.kill(child.pid, 0)
				} catch {
					throw new Error(await readFile(join(directory, 'daemon.log'), 'utf8'))
				}
				await new Promise((resolve) => setTimeout(resolve, 25))
			}
		}
		process.kill(child.pid, 'SIGTERM')
		throw new Error('Session startup timed out; inspect ' + join(directory, 'daemon.log'))
	}
	try {
		return await requestSession(directory, { command, input })
	} catch (error) {
		if (!['ENOENT', 'ECONNREFUSED'].includes(error.code)) throw error
		try {
			return await readFile(join(directory, 'result'), 'utf8')
		} catch {
			throw new Error('No running session: ' + values.session)
		}
	}
}

// Each request stays connected until the next prompt. The sim is frozen between requests.
export async function sessionTransport(directory) {
	let prompt = null,
		reply = null,
		next = null,
		stopped = false
	const observers = new Set()
	const server = createServer({ allowHalfOpen: true }, (socket) => {
		let buffer = ''
		socket.on('error', () => {})
		socket.on('data', (chunk) => {
			buffer += chunk
		})
		socket.on('end', () => {
			let request
			try {
				request = JSON.parse(buffer)
			} catch {
				socket.end('error invalid request\n')
				return
			}
			if (request.command === 'observe') {
				if (prompt) socket.end(prompt)
				else observers.add(socket)
			} else if (request.command === 'stop') {
				if (reply) {
					socket.end('error session busy\n')
					return
				}
				reply = socket
				process.kill(process.pid, 'SIGTERM')
			} else if (request.command === 'act') {
				if (reply || !next || stopped) {
					socket.end('error session busy\n')
					return
				}
				reply = socket
				prompt = null
				const resolve = next
				next = null
				resolve({ value: request.input, done: false })
			} else socket.end('error unknown session command\n')
		})
	})
	await new Promise((resolve, reject) => {
		server.once('error', reject)
		server.listen(join(directory, 'socket'), resolve)
	})
	return {
		next() {
			if (stopped) return Promise.resolve({ done: true })
			return new Promise((resolve) => {
				next = resolve
			})
		},
		output(text) {
			prompt = text
			if (reply) {
				reply.end(text)
				reply = null
			}
			for (const socket of observers) socket.end(text)
			observers.clear()
		},
		interrupt() {
			stopped = true
			next?.({ done: true })
			next = null
		},
		async close(result) {
			await writeFile(join(directory, 'result'), result)
			this.output(result)
			await new Promise((resolve) => server.close(resolve))
			await unlink(join(directory, 'socket')).catch(() => {})
		},
	}
}
