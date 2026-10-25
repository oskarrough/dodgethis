// bun run shot <map> [--spots name,...] [--out dir] [--gray] [--seed 2]
// Opens a moba match on the shared dev server at 1600×900 and screenshots named spots (`start` plus the map tune's `shots`).
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		spots: { type: 'string' },
		out: { type: 'string' },
		gray: { type: 'boolean', default: false },
		seed: { type: 'string', default: '2' },
	},
})
const map = positionals[0]
if (!map) {
	console.error('usage: bun run shot <map> [--spots name,...] [--out dir] [--gray] [--seed 2]')
	process.exit(1)
}

const root = join(import.meta.dir, '..')
const tuneFile = join(root, 'src/modes/moba/maps', map, `${map}-tune.js`)
const shots = (await import(tuneFile).catch(() => ({}))).shots ?? {}
const names = values.spots ? values.spots.split(',') : ['start', ...Object.keys(shots)]
for (const name of names)
	if (name !== 'start' && !shots[name]) {
		console.error(
			`no spot "${name}" in ${map}-tune.js shots (${Object.keys(shots).join(', ') || 'none'})`,
		)
		process.exit(1)
	}

const out = resolve(values.out ?? join(process.env.BB_THREAD_STORAGE ?? '/tmp', 'shots', map))
mkdirSync(out, { recursive: true })
const session = `shot-${process.env.BB_THREAD_ID ?? process.pid}-${map}`

function run(cmd, args, { quiet = false } = {}) {
	const p = Bun.spawnSync([cmd, ...args], { stdout: 'pipe', stderr: 'pipe' })
	const text = p.stdout.toString().trim()
	if (p.exitCode !== 0 && !quiet)
		throw new Error(`${cmd} ${args[0]}: ${p.stderr.toString().trim() || text}`)
	return text
}
const browser = (...args) => run('agent-browser', ['--session', session, ...args])
const evaluate = (js) => {
	const reply = JSON.parse(run('agent-browser', ['--session', session, '--json', 'eval', js]))
	if (!reply.success) throw new Error(`eval: ${reply.error}`)
	return reply.data?.result
}

const url = run('sh', [join(root, 'scripts/dev-agent.sh')])
const page = `${url}?mode=moba&play&map=${map}&hero=ibis&bots=easy&seed=${values.seed}`

function boot() {
	browser('set', 'viewport', '1600', '900')
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
	try {
		boot()
	} catch (error) {
		console.error(`boot failed, retrying once: ${error.message}`)
		boot()
	}

	for (const name of names) {
		if (name !== 'start') {
			const [x, z] = shots[name]
			evaluate(`(() => {
				const m = dt.game.moba, b = m.sim.heroes[0].body
				b.place(${x}, b.position.y + 2, ${z})
				m.focus({ x: ${x}, z: ${z} })
			})()`)
			browser('wait', '1200')
		}
		const file = join(out, `${name}.png`)
		browser('screenshot', file)
		console.log(file)
		if (values.gray) {
			const gray = join(out, `${name}-gray.png`)
			run('magick', [file, '-colorspace', 'Gray', gray])
			console.log(gray)
		}
	}

	const info = evaluate(
		'(() => { const r = dt.game.renderer.info.render; return [r.triangles, r.calls] })()',
	)
	console.log(`triangles=${info?.[0]} calls=${info?.[1]}`)
	const errors = run('agent-browser', ['--session', session, 'errors'], { quiet: true })
	if (errors && !/no (page )?errors/i.test(errors)) console.log(`errors:\n${errors}`)
} catch (error) {
	console.error(error.message)
	process.exitCode = 1
} finally {
	run('agent-browser', ['--session', session, 'close'], { quiet: true })
}
