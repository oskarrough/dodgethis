// Shared browser-capture plumbing for shot.js and cast.js: one lock, one agent-browser session, one match boot.
// The box is shared and often loaded past 30, so every capture takes /tmp/dodgethis-capture.lock first and queues
// behind the others (flock, so a crashed holder frees it by dying). Wrap other browser work the same way:
//   bun run capture -- <command…>     bun run capture --status
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const CAPTURE_LOCK = '/tmp/dodgethis-capture.lock'
const HOLDER = '/tmp/dodgethis-capture.holder'
const root = join(import.meta.dir, '..')

const alive = (pid) => {
	try {
		process.kill(pid, 0)
		return true
	} catch {
		return false
	}
}
function holder() {
	try {
		const info = JSON.parse(readFileSync(HOLDER, 'utf8'))
		return alive(info.pid) ? info : null
	} catch {
		return null
	}
}
const describe = (info) =>
	info
		? `${info.command} (thread ${info.thread || '?'}, since ${info.since}, pid ${info.pid})`
		: 'nobody'

// Re-runs the calling script under the lock unless it already holds it, then exits with its status.
// Call first in a script. DT_CAPTURE_WAIT is the longest wait in seconds (default 900).
export function holdCaptureLock(script = process.argv[1]) {
	if (process.env.DT_CAPTURE_LOCKED !== '1')
		runLocked([process.execPath, script, ...Bun.argv.slice(2)])
}

// Runs a command with the lock held, leaving a note of who holds it, and exits with its status.
export function runLocked(command) {
	const wait = Number(process.env.DT_CAPTURE_WAIT ?? 900)
	if (Bun.spawnSync(['flock', '-n', CAPTURE_LOCK, 'true']).exitCode !== 0)
		console.error(`capture lock busy: ${describe(holder())}; waiting up to ${wait}s`)
	const note =
		'printf \'{"pid":%s,"thread":"%s","command":"%s","since":"%s"}\' "$$" "$BB_THREAD_ID" "$DT_CAPTURE_NOTE" "$(date -u +%H:%M:%S)Z" > ' +
		HOLDER +
		'; "$@"; code=$?; rm -f ' +
		HOLDER +
		'; exit $code'
	const label = command.map((part) => part.split('/').pop()).join(' ')
	const child = Bun.spawnSync(
		['flock', '-w', String(wait), '-E', '200', CAPTURE_LOCK, 'sh', '-c', note, 'sh', ...command],
		{
			stdio: ['inherit', 'inherit', 'inherit'],
			env: {
				...process.env,
				DT_CAPTURE_LOCKED: '1',
				DT_CAPTURE_NOTE: label.replace(/["\\]/g, "'").slice(0, 120),
			},
		},
	)
	if (child.exitCode === 200)
		console.error(`could not get the capture lock within ${wait}s; try again later`)
	process.exit(child.exitCode ?? 1)
}

export function run(cmd, args, { quiet = false } = {}) {
	const p = Bun.spawnSync([cmd, ...args], { stdout: 'pipe', stderr: 'pipe' })
	const text = p.stdout.toString().trim()
	if (p.exitCode !== 0 && !quiet)
		throw new Error(`${cmd} ${args[0]}: ${p.stderr.toString().trim() || text}`)
	return text
}

// An agent-browser session of its own. `evaluate` runs the JS and returns its (JSON-able) result;
// a promise is awaited by the page.
export function browserSession(name) {
	const session = `${name}-${process.pid}`
	const browser = (...args) => run('agent-browser', ['--session', session, ...args])
	const evaluate = (js) => {
		const reply = JSON.parse(run('agent-browser', ['--session', session, '--json', 'eval', js]))
		if (!reply.success) throw new Error(`eval: ${reply.error}`)
		return reply.data?.result
	}
	return {
		session,
		browser,
		evaluate,
		errors: () => run('agent-browser', ['--session', session, 'errors'], { quiet: true }),
		close: () => run('agent-browser', ['--session', session, 'close'], { quiet: true }),
	}
}

// The shared dev server's URL, started if needed.
export const devServer = () => run('sh', [join(root, 'scripts/dev-agent.sh')])

// Opens `page` at 1600×900 and waits for the match to land (retries once); the HUD is up and the descent over.
export function bootMatch({ browser }, page, { width = 1600, height = 900 } = {}) {
	const boot = () => {
		browser('set', 'viewport', String(width), String(height))
		browser('open', page)
		browser(
			'wait',
			'--timeout',
			'90000',
			'--fn',
			"window.dt?.screen()==='match' && !document.querySelector('.moba-front')",
		)
		browser('wait', '1500')
	}
	try {
		boot()
	} catch (error) {
		console.error(`boot failed, retrying once: ${error.message}`)
		boot()
	}
}

if (import.meta.main) {
	const args = Bun.argv.slice(2).filter((argument) => argument !== '--')
	if (args[0] === '--status') {
		const info = holder()
		console.log(info ? `held by ${describe(info)}` : 'free')
	} else if (!args.length) {
		console.error('usage: bun run capture -- <command…> | bun run capture --status')
		process.exit(1)
	} else runLocked(args)
}
