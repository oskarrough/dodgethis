import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { readReplay } from '../src/plugins/moba/agent-match.js'

async function call(directory, args) {
	const child = Bun.spawn(['bun', 'scripts/play.js', ...args], {
		env: { ...process.env, PLAY_SESSION_DIR: directory },
		stdout: 'pipe',
		stderr: 'pipe',
		stdin: 'ignore',
	})
	const [stdout, stderr, code] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	])
	if (code !== 0) throw new Error(stderr)
	return stdout
}

async function saved(filename) {
	for (let i = 0; i < 100; i++) {
		try {
			return readReplay(JSON.parse(await readFile(filename, 'utf8')))
		} catch (error) {
			if (error.code !== 'ENOENT') throw error
		}
		await Bun.sleep(20)
	}
	throw new Error('Replay was not saved')
}

test('separate shell processes start, act, retry and stop a frozen session; both signals save replay', async () => {
	const directory = await mkdtemp(tmpdir() + '/moba-session-')
	const pids = []
	try {
		for (const [name, signal] of [
			['term', 'SIGTERM'],
			['int', 'SIGINT'],
		]) {
			const filename = `${directory}/${name}.json`
			const first = await call(directory, [
				'start',
				'--session',
				name,
				'--seat',
				'B2',
				'--replay',
				filename,
			])
			expect(first).toContain('seat B2 t=0s')
			const pid = Number(first.match(/pid=(\d+)/)[1])
			pids.push(pid)
			await Bun.sleep(50)
			expect(await readFile(`${directory}/${name}/pid`, 'utf8')).toBe(String(pid))
			const bad = await call(directory, ['act', '--session', name, '{"action":"dance"}'])
			expect(bad).toContain('error B2 Unknown action')
			const next = await call(directory, [
				'act',
				'--session',
				name,
				'{"action":"move","x":40,"y":4}',
			])
			expect(next).toContain('seat B2 t=0.5s')
			expect(next).toContain('order=move:40,4')
			const waited = await call(directory, [
				'act',
				'--session',
				name,
				'{"action":"wait","seconds":5}',
			])
			expect(waited).toContain('seat B2 t=5.5s')
			const actions = (await readFile(filename + '.actions.jsonl', 'utf8'))
				.trim()
				.split('\n')
				.map(JSON.parse)
			expect(actions.map((a) => a.input.action)).toEqual(['move', 'wait'])
			expect(actions.map((a) => a.tick)).toEqual([0, 30])
			const inputs = (await readFile(filename + '.inputs.jsonl', 'utf8'))
				.trim()
				.split('\n')
				.map(JSON.parse)
			expect(inputs[0][1].some(([id, frame]) => id === 'B2' && frame.order?.kind === 'move')).toBe(
				true,
			)
			process.kill(pid, signal)
			const tape = await saved(filename)
			expect(tape.result.reason).toBe('interrupt')
			expect(tape.result.ticks).toBe(330)
			expect(tape.inputs).toEqual(inputs)
			const result = await call(directory, [
				'act',
				'--session',
				name,
				'{"action":"wait","seconds":1}',
			])
			expect(result).toContain('result interrupt t=5.5s')
		}
		const multiFile = directory + '/multi.json'
		await call(directory, [
			'start',
			'--session',
			'multi',
			'--seat',
			'A1',
			'--seat',
			'B2',
			'--replay',
			multiFile,
		])
		const otherSeat = await call(directory, [
			'act',
			'--session',
			'multi',
			'{"action":"move","x":-44,"y":4}',
		])
		expect(otherSeat).toContain('seat B2 t=0s')
		const advanced = await call(directory, [
			'act',
			'--session',
			'multi',
			'{"action":"move","x":44,"y":4}',
		])
		expect(advanced).toContain('seat A1 t=0.5s')
		expect(advanced).toContain('order=move:-44,4')
		await call(directory, ['stop', '--session', 'multi'])
		expect(
			(await saved(multiFile)).inputs[0][1].filter(([id]) => ['A1', 'B2'].includes(id)),
		).toHaveLength(2)
		const stoppedFile = directory + '/stopped.json'
		await call(directory, ['start', '--session', 'stopped', '--replay', stoppedFile])
		expect(await call(directory, ['stop', '--session', 'stopped'])).toContain(
			'result interrupt t=0s',
		)
		expect((await saved(stoppedFile)).inputs).toEqual([])
		const filename = directory + '/limit.json'
		await call(directory, [
			'start',
			'--session',
			'limit',
			'--max-seconds',
			'1',
			'--replay',
			filename,
		])
		expect(
			await call(directory, ['act', '--session', 'limit', '{"action":"wait","seconds":30}']),
		).toContain('result limit t=1s')
		expect((await saved(filename)).result.reason).toBe('limit')
	} finally {
		for (const pid of pids) {
			try {
				process.kill(pid, 'SIGTERM')
			} catch {}
		}
		await rm(directory, { recursive: true, force: true })
	}
}, 20000)
