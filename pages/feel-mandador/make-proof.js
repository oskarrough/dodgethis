// Mandador's whole kit in one frame-stepped clip, through real inputs: the pointer is a browser mouse, Q W E are key events,
// the basic and the move are right-clicks. Run: bun run capture -- bun pages/feel-mandador/make-proof.js [--out dir] [--every 2]
// It stages the same row `bun run cast` does (a target and an ally on Overthrow's centre line), then asserts what the sim did
// for each step and writes proof.json and proof.webm. The last step is the trait: the hero falls, the cutout throws from the
// touchline, and a hit takes time off the respawn. Authored time only; it measures no FPS and no latency.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import {
	bootMatch,
	browserSession,
	devServer,
	holdCaptureLock,
	run,
} from '../../scripts/capture.js'

holdCaptureLock()
const { values } = parseArgs({
	args: Bun.argv.slice(2).filter((a) => a !== '--'),
	options: {
		out: { type: 'string', default: join(import.meta.dir, 'proof') },
		every: { type: 'string', default: '2' },
		size: { type: 'string', default: '1280x720' },
		clip: { type: 'boolean', default: true },
		only: { type: 'string' },
	},
})
const STEP = 1 / 60
const every = Number(values.every)
const fps = 60 / every
const [width, height] = values.size.split('x').map(Number)
const out = resolve(values.out)
const framesDir = join(out, 'frames')
rmSync(framesDir, { recursive: true, force: true })
mkdirSync(framesDir, { recursive: true })

const { browser, evaluate, errors, close } = browserSession(
	`mandador-proof-${process.env.BB_THREAD_ID ?? 'x'}`,
)
const call = (js) => JSON.parse(evaluate(`JSON.stringify(${js})`))
const page = `${devServer()}?mode=moba&play&map=overthrow&hero=mandador&bots=easy&seed=2`
const started = Date.now()
let frameCount = 0
const segments = []
let current = []

const grab = every
function advance(ticks, settle = 0) {
	const chunk = every * 6
	for (let ran = 0; ran < ticks;) {
		const next = Math.min(chunk, ticks - ran)
		const result = call(
			`(() => ({ ...__cast.step(${next}, { every: ${grab}, settle: ${settle}, fresh: ${ran === 0} }), frames: __cast.takeFrames() }))()`,
		)
		current.push(...result.frames)
		sample()
		ran += result.ran
		if (result.settled) return
	}
}
// Which statuses the hero and the enemy have worn at any point of the step, and whether a ring stood.
function sample() {
	const now =
		call(`(() => { const sim = dt.game.moba.sim; const me = sim.heroes.find((h) => h.id === sim.training.local); const foe = sim.find(__cast.ids.foe);
		const keys = (u) => (u.statuses ?? []).map((s) => s.key);
		return { hero: keys(me), foe: keys(foe), ring: sim.groundFields.some((f) => f.ability === 'rallyRing') } })()`)
	for (const key of now.hero) current.heroSeen.add(key)
	for (const key of now.foe) current.foeSeen.add(key)
	current.ring ||= now.ring
}
const press = (code, ticks) =>
	current.push(
		...call(
			`(() => (__cast.press('${code}', ${ticks}, { every: ${grab} }), __cast.takeFrames()))()`,
		),
	)
const aim = (point) => {
	const pixel = call(`__cast.screen(${point.x}, ${point.z})`)
	browser('mouse', 'move', String(pixel.x), String(pixel.y))
}
const click = (point) => {
	aim(point)
	browser('mouse', 'down', 'right')
	advance(2)
	browser('mouse', 'up', 'right')
}
const sim = (js) => call(`(() => { const sim = dt.game.moba.sim; ${js} })()`)

// --- the steps ------------------------------------------------------------------------------------------------------
// Each step stages, acts and returns what it expects of the facts it caused. `facts` are the compact log; `state` is read after.
const steps = [
	{
		id: 'basic',
		title: 'Tennis ball · basic · enemy',
		act({ foe }) {
			aim(foe)
			advance(8)
			browser('mouse', 'down', 'right')
			advance(2)
			browser('mouse', 'up', 'right')
			advance(240, 14)
			press('KeyS', 2)
			advance(20)
		},
		expect: ({ facts, ids }) => [
			[
				facts.some((f) => f.type === 'activity' && f.now === 'attack:windup'),
				'a basic windup began',
			],
			[
				facts.some((f) => f.type === 'activity' && f.now === 'attack:backswing'),
				'the windup became a backswing',
			],
			[
				facts.some((f) => f.type === 'hit' && f.ability === 'tennisBall' && f.target === ids.foe),
				'the ball hit the enemy',
			],
		],
	},
	{
		id: 'pass-enemy',
		title: 'Pass · enemy hit and slow',
		act({ foe }) {
			aim(foe)
			advance(8)
			press('KeyQ', 10)
			advance(240, 14)
			advance(70)
		},
		expect: ({ facts, ids, state }) => [
			[facts.some((f) => f.type === 'cast' && f.ability === 'pass'), 'Q became a Pass cast'],
			[
				facts.some((f) => f.type === 'hit' && f.ability === 'pass' && f.target === ids.foe),
				'the ball hit the enemy',
			],
			[state.foeSeen.includes('pass.slow'), 'the enemy was slowed'],
		],
	},
	{
		id: 'pass-ally',
		title: 'Pass · ally catches and is healed',
		stage: () => sim(`const f = sim.find(__cast.ids.friend); f.hp = f.maxHp * 0.55; return 1`),
		act({ friend }) {
			aim(friend)
			advance(8)
			press('KeyQ', 10)
			advance(240, 14)
			advance(40)
		},
		expect: ({ facts, ids }) => [
			[facts.some((f) => f.type === 'cast' && f.ability === 'pass'), 'Q became a Pass cast'],
			[
				facts.some((f) => f.type === 'heal' && (f.target === ids.friend || f.hero === ids.friend)),
				'the ally was healed',
			],
		],
	},
	{
		id: 'pass-miss',
		title: 'Pass · thrown wide, expires',
		act({ hero }) {
			aim({ x: hero.x - 7, z: hero.z })
			advance(8)
			press('KeyQ', 10)
			advance(240, 14)
			advance(40)
		},
		expect: ({ facts }) => [
			[facts.some((f) => f.type === 'cast' && f.ability === 'pass'), 'Q became a Pass cast'],
			[!facts.some((f) => f.type === 'hit'), 'it hit nobody'],
		],
	},
	{
		id: 'tag-out',
		title: 'Tag out · swap with the ally, guard up',
		act({ friend }) {
			aim(friend)
			advance(8)
			press('KeyW', 10)
			advance(240, 14)
			advance(140)
		},
		expect: ({ facts, state }) => [
			[facts.some((f) => f.type === 'cast' && f.ability === 'tagOut'), 'W became a Tag out cast'],
			[facts.some((f) => f.type === 'contact' && f.ability === 'tagOut'), 'the swap landed'],
			[state.heroSeen.includes('tagOut.guard'), 'the guard went up'],
			[state.swapped, 'the two traded places'],
		],
	},
	{
		id: 'rally-ring',
		title: 'Rally ring · call, ring, haste and wade',
		act({ hero, foe }) {
			const mid = { x: (hero.x + foe.x) / 2, z: hero.z }
			aim(mid)
			advance(8)
			press('KeyE', 10)
			advance(70)
			click({ x: mid.x - 0.4, z: hero.z })
			advance(60)
			click({ x: mid.x - 3, z: hero.z })
			advance(70)
		},
		expect: ({ facts, state }) => [
			[
				facts.some((f) => f.type === 'cast' && f.ability === 'rallyRing'),
				'E became a Rally ring cast',
			],
			[state.ring, 'the ring went up'],
			[state.heroSeen.includes('rallyRing.groundHaste'), 'she ran hasted inside it'],
			[state.foeSeen.includes('rallyRing.groundSlow'), 'the enemy waded slowed'],
		],
	},
	{
		id: 'out-throw',
		title: 'Out, not gone · the cutout throws from the touchline',
		stage() {
			sim(`sim.setTraining({ godMode: false }); const me = sim.heroes.find((h) => h.id === sim.training.local); const foe = sim.find(__cast.ids.foe); me.hp = 1; me.cd.fill(0);
				foe.body.place(me.body.position.x - 6, me.body.position.y, me.body.position.z); foe.body.face({ x: 1, z: 0 });
				sim.launchShot(foe, { x: 1, z: 0 }, { ability: 'tennisBall', slot: 'primary', damage: 9999, range: 20, radius: 0.3, speed: 30, isAbility: false }, { x: me.body.position.x - 1, z: me.body.position.z }); return 1`)
		},
		act() {
			advance(60)
			const marks = sim(
				`const me = sim.heroes.find((h) => h.id === sim.training.local); const c = sim.cutouts[0]; return { dead: me.dead, cutout: !!c, x: c?.x, z: c?.z, bounds: { halfX: sim.bounds.halfX, halfZ: sim.bounds.halfZ } }`,
			)
			current.marks = marks
			// Bring the target to the cutout's reach: a few metres in from the touchline, on its column.
			sim(`sim.setTraining({ godMode: true }); const foe = sim.find(__cast.ids.foe); const c = sim.cutouts[0]; foe.hp = foe.maxHp;
				foe.body.place(c.x, foe.body.position.y, c.flank * (sim.bounds.halfZ - 6)); return 1`)
			advance(50)
			current.length = 0 // the fall and the walk over are not the proof; the clip starts on the throw's setup
			const foe = call(
				`(() => { const f = dt.game.moba.sim.find(__cast.ids.foe); return { x: f.body.position.x, z: f.body.position.z } })()`,
			)
			current.respawnBefore = sim(
				`const me = sim.heroes.find((h) => h.id === sim.training.local); return me.respawnTick`,
			)
			aim(foe)
			advance(6)
			browser('mouse', 'down', 'left')
			advance(3)
			browser('mouse', 'up', 'left')
			current.debug = sim(
				`const c = sim.cutouts[0]; const me = sim.heroes.find((h) => h.id === sim.training.local); return { cast: c?.cast?.ability ?? null, cd: c?.cooldownUntil, tick: sim.tick, respawn: me.respawnTick, dead: me.dead, x: c?.x, z: c?.z, foe: { x: sim.find(__cast.ids.foe).body.position.x, z: sim.find(__cast.ids.foe).body.position.z } }`,
			)
			advance(120, 20)
			advance(70)
			current.respawnAfter = sim(
				`const me = sim.heroes.find((h) => h.id === sim.training.local); return me.respawnTick`,
			)
		},
		expect: ({ facts, ids }) => [
			[
				facts.some((f) => f.type === 'cast' && f.ability === 'outThrow'),
				'Q became an Out, not gone throw',
			],
			[
				facts.some((f) => f.type === 'hit' && f.ability === 'outThrow' && f.target === ids.foe),
				'the cutout hit the enemy',
			],
		],
	},
]

// --- the run --------------------------------------------------------------------------------------------------------
const results = []
try {
	browser('set', 'viewport', String(width), String(height))
	bootMatch({ browser }, page, { width, height })
	evaluate(readFileSync(join(import.meta.dir, '../../scripts/cast-page.js'), 'utf8'))
	call(`__cast.setup({ at: null, enemy: 'ibis', ally: 'mandador' })`)
	for (const step of steps) {
		if (values.only && !values.only.split(',').includes(step.id)) continue
		const here = call(`__cast.reset(6)`)
		call('(() => { __cast.take(); return 1 })()')
		step.stage?.()
		current = []
		current.heroSeen = new Set()
		current.foeSeen = new Set()
		current.ring = false
		const before = {
			hero: { ...here.hero },
			friend: { ...here.friend },
		}
		step.act(here)
		const record = call('__cast.take()')
		const ids = call('__cast.ids')
		const state =
			call(`(() => { const sim = dt.game.moba.sim; const me = sim.heroes.find((h) => h.id === sim.training.local); const friend = sim.find(__cast.ids.friend);
			return { heroPos: { x: me.body.position.x, z: me.body.position.z }, friendPos: { x: friend.body.position.x, z: friend.body.position.z } } })()`)
		state.swapped =
			Math.hypot(state.heroPos.x - before.friend.x, state.heroPos.z - before.friend.z) < 1.5 &&
			Math.hypot(state.friendPos.x - before.hero.x, state.friendPos.z - before.hero.z) < 1.5
		state.heroSeen = [...current.heroSeen]
		state.foeSeen = [...current.foeSeen]
		state.ring = current.ring
		const facts = record.log
		const checks = step.expect({ facts, ids, state })
		const mine = (f) => step.id !== 'out-throw' || f.ability === 'outThrow'
		const t0 =
			facts.find((f) => f.type === 'cast' && mine(f))?.tick ??
			facts.find((f) => f.type === 'activity')?.tick
		const at = (tick) => (tick == null || t0 == null ? null : +((tick - t0) * STEP).toFixed(3))
		const cast = facts.find((f) => f.type === 'cast' && mine(f))
		const hit = facts.find((f) => f.type === 'hit' && mine(f))
		const problems = checks.filter(([ok]) => !ok).map(([, what]) => `not so: ${what}`)
		for (const f of facts.filter((f) => ['denied', 'castCancelled'].includes(f.type)))
			problems.push(`${f.type}${f.reason ? ` (${f.reason})` : ''}`)
		const row = {
			step: step.id,
			title: step.title,
			ok: problems.length === 0,
			problems,
			castLock: cast?.lock ?? null,
			firstHit: at(hit?.tick),
			firstHitDamage: hit ? Math.round(hit.damage) : null,
			checks: checks.map(([ok, what]) => ({ ok, what })),
			seen: { hero: state.heroSeen, foe: state.foeSeen },
			facts: [...new Set(facts.map((f) => f.type + (f.ability ? ':' + f.ability : '')))],
			...(current.respawnBefore != null && {
				respawnTicksBefore: current.respawnBefore,
				respawnTicksAfter: current.respawnAfter,
			}),
			frames: current.length,
			debug: current.debug,
		}
		if (step.id === 'out-throw' && current.respawnBefore != null) {
			const taken = (current.respawnBefore - current.respawnAfter) / 60
			const ok = taken > 1
			row.checks.push({ ok, what: `the hit took ${taken.toFixed(2)} s off the respawn` })
			if (!ok) {
				row.ok = false
				row.problems.push('the hit took no time off the respawn')
			}
		}
		results.push(row)
		const ours = current
		for (const data of ours) {
			frameCount++
			writeFileSync(
				join(framesDir, `${String(frameCount).padStart(5, '0')}.jpg`),
				Buffer.from(data, 'base64'),
			)
		}
		segments.push({ row, frames: ours.length })
	}
} catch (error) {
	console.error(error.message)
	results.push({ step: '(run)', ok: false, problems: [error.message] })
} finally {
	var pageErrors = errors()
	close()
}
if (pageErrors && !/no (page )?errors/i.test(pageErrors))
	results.push({ step: '(page)', ok: false, problems: [`browser errors: ${pageErrors}`] })

let clip = null
if (values.clip && frameCount) {
	const font = run('fc-match', ['-f', '%{file}', 'monospace'])
	let from = 0
	const filters = ['scale=trunc(iw/2)*2:trunc(ih/2)*2']
	for (const [i, segment] of segments.entries()) {
		const row = segment.row
		const lock = row.castLock == null ? '' : `  cast ${row.castLock.toFixed(2)} s`
		const hit = row.firstHit == null ? '' : `  first hit ${row.firstHit.toFixed(2)} s`
		const file = join(framesDir, `caption-${i}.txt`)
		writeFileSync(file, `${row.title}${lock}${hit}${row.ok ? '' : '  FAILED'}`)
		const length = segment.frames / fps
		filters.push(
			`drawtext=fontfile='${font}':textfile='${file}':x=24:y=h-44:fontsize=22:fontcolor=white:box=1:boxcolor=0x14243dcc:boxborderw=8:enable='between(t,${from.toFixed(3)},${(from + length).toFixed(3)})'`,
		)
		from += length
	}
	writeFileSync(
		join(framesDir, 'caption-note.txt'),
		`frame-stepped: ${every} sim ticks per frame, authored speed (1x)`,
	)
	filters.push(
		`drawtext=fontfile='${font}':textfile='${join(framesDir, 'caption-note.txt')}':x=24:y=18:fontsize=18:fontcolor=0xffffffcc:box=1:boxcolor=0x14243d99:boxborderw=6`,
	)
	const file = join(out, 'proof.webm')
	run('ffmpeg', [
		'-y',
		'-loglevel',
		'error',
		'-framerate',
		String(fps),
		'-i',
		join(framesDir, '%05d.jpg'),
		'-vf',
		filters.join(','),
		'-c:v',
		'libvpx-vp9',
		'-crf',
		'36',
		'-b:v',
		'0',
		'-pix_fmt',
		'yuv420p',
		file,
	])
	clip = {
		file,
		frames: frameCount,
		seconds: +(frameCount / fps).toFixed(2),
		fps,
		ticksPerFrame: every,
	}
}
if (!process.env.KEEP_FRAMES) rmSync(framesDir, { recursive: true, force: true })
const report = {
	hero: 'mandador',
	map: 'overthrow',
	viewport: `${width}x${height}`,
	ok: results.every((r) => r.ok),
	timing: `Frame-stepped: the sim ran exactly 1/60 s per tick whatever the host load, so every time here is authored sim time. Wall time was ${((Date.now() - started) / 1000).toFixed(0)} s on a shared, software-rendered box; FPS and input latency are not measured.`,
	clip,
	steps: results,
}
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'proof.json'), JSON.stringify(report, null, '\t') + '\n')
for (const r of results)
	console.log(
		`${r.ok ? 'ok  ' : 'FAIL'} ${(r.step ?? '').padEnd(12)} lock ${r.castLock ?? '-'}  hit ${r.firstHit ?? '-'}s ${r.firstHitDamage ?? ''}${r.problems?.length ? '  !! ' + r.problems.join('; ') : ''}`,
	)
console.log(join(out, 'proof.json'), clip ? `${clip.seconds} s, ${clip.frames} frames` : '')
if (!report.ok) process.exitCode = 1
