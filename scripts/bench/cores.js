import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { join } from 'node:path'

// One core budget per machine, shared by every farm on it, so parallel threads queue instead of
// thrashing. Each farm writes `<pid>.json` with its cores; dead pids free theirs.
const DIR = process.env.FARM_CORES_DIR ?? '/tmp/dodgethis-farm-cores'
const LOCK = join(DIR, 'lock')

export const coreBudget = () => {
	const budget = Number(process.env.FARM_CORES ?? Math.max(1, availableParallelism() - 2))
	if (!Number.isSafeInteger(budget) || budget < 1)
		throw new Error('FARM_CORES must be a positive integer')
	return budget
}

const alive = (pid) => {
	try {
		process.kill(pid, 0)
		return true
	} catch (error) {
		return error.code === 'EPERM'
	}
}

function holders() {
	const out = []
	for (const name of readdirSync(DIR)) {
		const pid = Number(name.replace(/\.json$/, ''))
		if (!name.endsWith('.json') || !Number.isSafeInteger(pid)) continue
		if (!alive(pid) || pid === process.pid) {
			if (pid !== process.pid) rmSync(join(DIR, name), { force: true })
			continue
		}
		try {
			out.push({ pid, ...JSON.parse(readFileSync(join(DIR, name), 'utf8')) })
		} catch {}
	}
	return out
}

// mkdir is the atomic step; a lock older than ten seconds belonged to a crashed farm.
async function locked(fn) {
	for (;;) {
		try {
			mkdirSync(LOCK)
			break
		} catch (error) {
			if (error.code !== 'EEXIST') throw error
			try {
				if (Date.now() - statSync(LOCK).mtimeMs > 10_000) rmSync(LOCK, { recursive: true })
			} catch {}
			await new Promise((resolve) => setTimeout(resolve, 50))
		}
	}
	try {
		return fn()
	} finally {
		rmSync(LOCK, { recursive: true, force: true })
	}
}

// Waits until at least min(wanted, a quarter of the budget) cores are free, then takes up to `wanted`.
export async function reserveCores(wanted, { log = console.log, label = '' } = {}) {
	mkdirSync(DIR, { recursive: true })
	const budget = coreBudget()
	const floor = Math.min(wanted, Math.max(1, Math.floor(budget / 4)))
	let told = ''
	for (;;) {
		const granted = await locked(() => {
			const others = holders()
			const free = budget - others.reduce((sum, h) => sum + h.cores, 0)
			if (free < floor) {
				const message = `Waiting for cores: ${budget - free}/${budget} held by ${others.map((h) => `pid ${h.pid} (${h.cores}${h.label ? `, ${h.label}` : ''})`).join(', ')}`
				if (message !== told) log((told = message))
				return 0
			}
			const cores = Math.min(wanted, free)
			writeFileSync(
				join(DIR, `${process.pid}.json`),
				JSON.stringify({ cores, label, started: new Date().toISOString() }),
			)
			return cores
		})
		if (granted) {
			const release = () => rmSync(join(DIR, `${process.pid}.json`), { force: true })
			process.once('exit', release)
			return { cores: granted, budget, release, shared: granted < wanted }
		}
		await new Promise((resolve) => setTimeout(resolve, 2000))
	}
}
