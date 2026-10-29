// bun pages/feel-salvia/prove.js [cast args…]
// Runs scripts/cast.js (the real-input cast driver) with three extra step options it lacks, patched in from outside
// so no shared file changes. The patched copies go to /tmp; every patch is asserted to have applied.
//   hurt=<hp>            the ally stands that much below full, so a heal has something to mend
//   volley=<s>+<dmg>/…   the enemy throws tennis balls at the ally at those seconds after the press (Ward's soak and break)
//   cancel=<s>           S (stop) that many seconds into the cast: the cast is dropped, as a player would
//   rush=<s>             after the cast settles, steps that long with no frames grabbed (the idle wait of Ward's 8 s)
//   note=<text>          words (underscores for spaces) added to this step's caption
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const scripts = resolve(import.meta.dir, '../../scripts')
const work = '/tmp/salvia-prove'
mkdirSync(work, { recursive: true })

function patch(source, edits, name) {
	for (const [from, to] of edits) {
		if (!source.includes(from))
			throw new Error(`prove.js: patch target missing in ${name}: ${from.slice(0, 60)}`)
		source = source.replace(from, to)
	}
	return source
}

const page = patch(
	readFileSync(join(scripts, 'cast-page.js'), 'utf8'),
	[
		['ran++\n\t\t\t\tdrain()', 'ran++\n\t\t\t\tapi.volleyTick?.()\n\t\t\t\tdrain()'],
		[
			'\t\ttakeFrames: () => frames.splice(0),',
			`\t\thurtFriend(hp) {
			const friend = sim.find(api.ids.friend)
			friend.hp = Math.max(1, friend.maxHp - hp)
		},
		volley(list) {
			const start = sim.tick
			api.volleys = list.map(([at, damage]) => ({ tick: start + Math.round(at * 60), damage }))
		},
		volleyTick() {
			for (const v of api.volleys ?? []) {
				if (v.done || sim.tick < v.tick) continue
				v.done = true
				const foe = sim.find(api.ids.foe),
					friend = sim.find(api.ids.friend)
				const dx = friend.body.position.x - foe.body.position.x,
					dz = friend.body.position.z - foe.body.position.z
				sim.launchShot(foe, { x: dx, z: dz }, {
					ability: 'tennisBall',
					slot: 'primary',
					damage: v.damage,
					speed: 16,
					radius: 0.2,
					range: 14,
					isAbility: false,
				})
			}
		},
		takeFrames: () => frames.splice(0),`,
		],
	],
	'cast-page.js',
)
writeFileSync(join(work, 'cast-page.js'), page)

const imports = `import { bootMatch, browserSession, devServer, holdCaptureLock, run } from '${join(scripts, 'capture.js')}'`
const cast = patch(
	readFileSync(join(scripts, 'cast.js'), 'utf8'),
	[
		[
			"import { bootMatch, browserSession, devServer, holdCaptureLock, run } from './capture.js'",
			imports,
		],
		["join(import.meta.dir, '..')", `'${resolve(scripts, '..')}'`],
		["join(import.meta.dir, 'cast-page.js')", `'${join(work, 'cast-page.js')}'`],
		// Before the press: the volley clock starts.
		[
			'\tadvance(lead)\n\tif (step.kind',
			`\tadvance(lead)
	if (step.options.volley)
		call(\`__cast.volley(\${JSON.stringify(step.options.volley.split('/').map((v) => v.split('+').map(Number)))})\`)
	if (step.kind`,
		],
		// Cancel part way through, or rush through the idle wait after it settles.
		[
			'\t\tpress(code, hold)\n\t\tadvance(240, 14)\n',
			`\t\tpress(code, hold)
		if (step.options.cancel) {
			advance(Math.round(Number(step.options.cancel) / STEP))
			press('KeyS', 2)
			advance(30)
		} else advance(240, 14)
		if (step.options.rush)
			call(\`(() => { __cast.step(\${Math.round(Number(step.options.rush) / STEP)}, { every: 0 }); return 1 })()\`)
`,
		],
		[
			"\t\tcall('(() => { __cast.take(); return 1 })()')\n",
			`\t\tcall('(() => { __cast.take(); return 1 })()')
		if (step.options.hurt) call(\`__cast.hurtFriend(\${Number(step.options.hurt)})\`)
`,
		],
		[
			'\t\tstep: step.text,\n\t\tability: castFact?.ability ?? step.name,',
			'\t\tstep: step.text,\n\t\tnote: step.options.note,\n\t\tability: castFact?.ability ?? step.name,',
		],
		// A step that asks for a cancel must see one, and does not count it as a failure.
		[
			"for (const f of log.filter((f) => ['denied', 'castCancelled'].includes(f.type) && f.hero === me))",
			"if (step.options.cancel && !log.some((f) => f.type === 'castCancelled' && f.hero === me)) problems.push('the stop never cancelled the cast')\n\tfor (const f of log.filter((f) => ['denied', 'castCancelled'].includes(f.type) && f.hero === me && !(step.options.cancel && (f.type === 'castCancelled' || f.reason === 'cancelled'))))",
		],
		[
			"const text = `${hero.name} · ${row.ability} · ${row.aim}${lock}${hit}${row.ok ? '' : '  FAILED'}`",
			"const text = `${hero.name} · ${row.ability} · ${row.aim}${lock}${hit}${row.note ? '  · ' + row.note.replaceAll('_', ' ') : ''}${row.ok ? '' : '  FAILED'}`",
		],
	],
	'cast.js',
)
writeFileSync(join(work, 'cast.mjs'), cast)

const child = Bun.spawn(['bun', join(work, 'cast.mjs'), ...Bun.argv.slice(2)], {
	stdout: 'inherit',
	stderr: 'inherit',
	cwd: resolve(scripts, '..'),
})
process.exit(await child.exited)
