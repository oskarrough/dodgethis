// bun run cast <hero> [--steps basic,slot1,slot2:miss,…] [--clip] [--map overthrow] [--out dir] [--every 2] [--size 1280x720]
// Casts a hero's kit through real inputs on the real map, one step at a time, and asserts what the sim did.
// A step is `basic`, a slot (`slot1`…) or an ability id, then optional `:aim` and `:key=value` parts:
//   aim  enemy (default for most), ally (Pass, Mend, Ward, Tag out), self (stances, channels), miss (empty ground behind you)
//   gap=<m> where the target stands, hold=<s> how long the key is held, tail=<s> frames after the cast settles
// Without --clip it only steps the sim (seconds, one browser page). With --clip every `--every` ticks of the
// frame-stepped sim becomes one video frame, so the clip plays at authored speed whatever the load on the box:
// the sim never runs on the browser's clock here. It shows the match camera but no HUD (the canvas only).
// The row stands on Overthrow's centre line, clear of cover (`--at x,z` for another map or spot; the hero faces +x).
// Writes cast.json (the assertions and authored times), frames/ and cast.webm to --out. Takes the capture lock.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { bootMatch, browserSession, devServer, holdCaptureLock, run } from './capture.js'

holdCaptureLock()

const { values, positionals } = parseArgs({
	args: Bun.argv.slice(2).filter((argument) => argument !== '--'),
	allowPositionals: true,
	options: {
		steps: { type: 'string' },
		clip: { type: 'boolean', default: false },
		map: { type: 'string', default: 'overthrow' },
		seed: { type: 'string', default: '2' },
		out: { type: 'string' },
		every: { type: 'string', default: '2' },
		size: { type: 'string', default: '1280x720' },
		at: { type: 'string' },
		enemy: { type: 'string', default: 'ibis' },
		ally: { type: 'string', default: 'mandador' },
		tail: { type: 'string', default: '0.5' },
		budget: { type: 'string', default: '300' },
		slow: { type: 'string', default: '1' },
	},
})
const usage =
	'usage: bun run cast <hero> [--steps basic,slot1,slot2:miss,slot3:tail=2] [--clip] [--map overthrow] [--out dir] [--every 2] [--size 1280x720] [--at x,z] [--enemy ibis] [--ally mandador] [--tail 0.5] [--budget 300] [--slow 1]'
const root = join(import.meta.dir, '..')
const { HEROES } = await import(join(root, 'src/modes/moba/heroes.js'))
const heroId = positionals[0]
const hero = HEROES[heroId]
if (!hero?.playable) {
	console.error(
		`${usage}\nno playable hero "${heroId}" (${Object.keys(HEROES)
			.filter((id) => HEROES[id].playable)
			.join(', ')})`,
	)
	process.exit(1)
}

const STEP = 1 / 60
const SLOT_KEYS = { slot1: 'KeyQ', slot2: 'KeyW', slot3: 'KeyE', slot4: 'KeyR' }
const every = Math.max(1, Number(values.every))
const fps = 60 / every / Number(values.slow)
const [width, height] = values.size.split('x').map(Number)

// --- steps -----------------------------------------------------------------------------------------------------
const slotOf = (name) =>
	SLOT_KEYS[name]
		? name
		: Object.keys(hero.abilities).find((slot) => hero.abilities[slot]?.id === name)
function parseStep(text) {
	const [name, ...parts] = text.split(':')
	const options = {}
	for (const part of parts) {
		const [key, value] = part.split('=')
		if (value === undefined) options.aim = key
		else options[key] = value
	}
	if (name === 'basic') {
		const range = hero.basic.range ?? 3
		return {
			text,
			name,
			kind: 'basic',
			stats: hero.basic,
			aim: options.aim ?? 'enemy',
			gap: Number(options.gap ?? range * 0.8),
			options,
		}
	}
	const slot = slotOf(name)
	const ability = hero.abilities[slot]
	if (!ability)
		throw new Error(
			`${hero.id} has no "${name}" (basic, ${Object.entries(hero.abilities)
				.filter(([, a]) => a)
				.map(([s, a]) => `${s}=${a.id}`)
				.join(', ')})`,
		)
	const stats = ability.stats
	const self = ['stance', 'channel'].includes(ability.kind)
	const toAlly = /"targets":"(ally|allies|heroes)"/.test(JSON.stringify(ability.stages ?? ''))
	const aim = options.aim ?? (self ? 'self' : toAlly ? 'ally' : 'enemy')
	const reach = stats.range > 0 ? stats.range * 0.75 : (stats.radius ?? 2) * 0.7
	return {
		text,
		name: ability.id,
		slot,
		ability,
		kind: ability.kind,
		stats,
		aim,
		gap: Number(options.gap ?? Math.min(reach, 8)),
		options,
	}
}
const stepTexts = values.steps
	? values.steps.split(',')
	: [
			'basic',
			...Object.entries(hero.abilities)
				.filter(([, a]) => a)
				.map(([slot]) => slot),
		]
const steps = stepTexts.map(parseStep)

// --- the page --------------------------------------------------------------------------------------------------
const out = resolve(values.out ?? join(process.env.BB_THREAD_STORAGE ?? '/tmp', 'cast', heroId))
const framesDir = join(out, 'frames')
rmSync(framesDir, { recursive: true, force: true })
mkdirSync(framesDir, { recursive: true })
const { browser, evaluate, errors, close } = browserSession(
	`cast-${process.env.BB_THREAD_ID ?? 'x'}-${heroId}`,
)
const call = (js) => JSON.parse(evaluate(`JSON.stringify(${js})`))
const page = `${devServer()}?mode=moba&play&map=${values.map}&hero=${heroId}&bots=easy&seed=${values.seed}`
const started = Date.now()
const load = Number(readFileSync('/proc/loadavg', 'utf8').split(' ')[0])
let frameCount = 0
const segments = []

// Frames the page grabbed, written in order; a step's frames are one video segment.
function keepFrames(encoded, label) {
	if (!values.clip) return
	for (const data of encoded) {
		frameCount++
		writeFileSync(
			join(framesDir, `${String(frameCount).padStart(5, '0')}.jpg`),
			Buffer.from(data, 'base64'),
		)
	}
	return label
}

function castStep(step, staged) {
	const code = SLOT_KEYS[step.slot]
	const hold = Math.round(Number(step.options.hold ?? 0.17) / STEP)
	const lead = every * 4
	const grab = values.clip ? every : 0
	const dir = step.aim === 'miss' ? -1 : 1
	const target =
		step.aim === 'ally'
			? staged.friend
			: step.aim === 'self'
				? { x: staged.hero.x + 0.4, z: staged.hero.z }
				: step.aim === 'miss'
					? { x: staged.hero.x + dir * step.gap, z: staged.hero.z }
					: staged.foe
	const pixel = call(`__cast.screen(${target.x}, ${target.z})`)
	browser('mouse', 'move', String(pixel.x), String(pixel.y))
	const tail = Math.round(Number(step.options.tail ?? values.tail) / STEP)
	const frames = []
	// Runs `ticks` in chunks, each a few seconds of browser work (a longer evaluation times out), keeping the frames.
	const chunk = grab ? every * 6 : 120
	function advance(ticks, settle = 0) {
		for (let ran = 0; ran < ticks;) {
			const next = Math.min(chunk, ticks - ran)
			const result = call(
				`(() => ({ ...__cast.step(${next}, { every: ${grab}, settle: ${settle}, fresh: ${ran === 0} }), frames: __cast.takeFrames() }))()`,
			)
			frames.push(...result.frames)
			ran += result.ran
			if (result.settled) return
		}
	}
	// A key held and released within one page evaluation.
	const press = (code, ticks) =>
		frames.push(
			...call(
				`(() => (__cast.press('${code}', ${ticks}, { every: ${grab} }), __cast.takeFrames()))()`,
			),
		)
	advance(lead)
	if (step.kind === 'basic') {
		browser('mouse', 'down', 'right')
		advance(2)
		browser('mouse', 'up', 'right')
		advance(240, 14)
		// S is the MOBA preset's stop: the swing lands, then the order ends so the next step starts clean.
		press('KeyS', 2)
	} else {
		press(code, hold)
		advance(240, 14)
	}
	advance(tail)
	return { record: { ...call('__cast.take()'), frames }, target }
}

// What the log says the step did, against what it should have done.
function judge(step, staged, { record, target }) {
	const log = record.log
	const me = 'local'
	const problems = []
	const castFact = log.find(
		(f) =>
			f.type === 'cast' && f.hero === me && (step.kind === 'basic' ? f.slot === 'primary' : true),
	)
	const attacked = log.some((f) => f.type === 'activity' && f.now.includes('attack'))
	const t0 =
		castFact?.tick ?? log.find((f) => f.type === 'activity' && f.now.includes('attack'))?.tick
	const seconds = (tick) => (tick == null || t0 == null ? null : +((tick - t0) * STEP).toFixed(3))
	if (step.kind === 'basic' ? !attacked : !castFact)
		problems.push('no cast: the press never became an action')
	if (castFact && step.kind !== 'basic' && castFact.ability !== step.name)
		problems.push(`cast ${castFact.ability}, expected ${step.name}`)
	for (const f of log.filter((f) => ['denied', 'castCancelled'].includes(f.type) && f.hero === me))
		problems.push(`${f.type}${f.reason ? ` (${f.reason})` : ''} at ${seconds(f.tick)} s`)
	// Phases the hero went through, with authored lengths from the tick each began to the next change.
	const changes = log.filter((f) => f.type === 'activity')
	const phases = changes
		.map((f, i) => ({
			now: f.now,
			at: seconds(f.tick),
			seconds: changes[i + 1] ? +((changes[i + 1].tick - f.tick) * STEP).toFixed(3) : null,
		}))
		.filter((p) => p.now)
	const hits = log.filter(
		(f) => f.type === 'hit' && f.source === me && (t0 == null || f.tick >= t0),
	)
	const heals = log.filter((f) => f.type === 'heal' && (f.source ?? f.hero) === me)
	const aimFact = castFact?.target
	if (aimFact && step.stats.range > 0 && step.aim !== 'self' && castFact.targetId == null) {
		const dx = target.x - staged.hero.x,
			dz = target.z - staged.hero.z
		const len = Math.hypot(dx, dz) || 1
		const reach = Math.min(len, step.stats.range)
		const error = Math.hypot(
			aimFact.x - (staged.hero.x + (dx / len) * reach),
			aimFact.z - (staged.hero.z + (dz / len) * reach),
		)
		if (error > 1.2 && step.kind !== 'basic')
			problems.push(`aim ${error.toFixed(1)} m off the cursor`)
	}
	if (step.aim === 'enemy' && !hits.length && log.some((f) => f.type === 'blocked'))
		problems.push('the shot was blocked by cover: restage with --at x,z')
	if (step.aim === 'miss' && hits.some((h) => h.target !== me))
		problems.push('a "miss" step hit someone')
	const cooldown = step.slot ? record.cooldowns[Number(step.slot.slice(4)) - 1] : null
	return {
		step: step.text,
		ability: castFact?.ability ?? step.name,
		kind: step.kind,
		aim: step.aim,
		ok: problems.length === 0,
		problems,
		authored: {
			castPoint: step.stats.castPoint ?? step.stats.windup ?? null,
			castLock: castFact?.lock ?? null,
			phases,
			firstHit: seconds(hits[0]?.tick),
			settled: seconds(log.at(-1)?.tick),
		},
		cooldownTicksLeft: cooldown,
		hits: hits.map((h) => ({
			at: seconds(h.tick),
			damage: Math.round(h.damage),
			target: h.target,
		})),
		heals: heals.length,
		facts: [
			...new Set(log.filter((f) => f.type !== 'activity' && f.type !== 'aggro').map((f) => f.type)),
		],
		hp: record.hp,
		log: record.log,
		frames: record.frames.length,
	}
}

const results = []
let problems = ''
try {
	browser('set', 'viewport', String(width), String(height))
	bootMatch({ browser }, page, { width, height })
	evaluate(readFileSync(join(import.meta.dir, 'cast-page.js'), 'utf8'))
	call(
		`__cast.setup(${JSON.stringify({ at: values.at ? values.at.split(',').map(Number) : null, enemy: values.enemy, ally: values.ally })})`,
	)
	for (const step of steps) {
		if ((Date.now() - started) / 1000 > Number(values.budget)) {
			results.push({
				step: step.text,
				ability: step.name,
				ok: false,
				problems: [`skipped: the ${values.budget} s budget ran out`],
			})
			continue
		}
		const here = call(`__cast.reset(${step.gap})`)
		call('(() => { __cast.take(); return 1 })()')
		const result = castStep(step, here)
		const row = judge(step, here, result)
		keepFrames(result.record.frames)
		segments.push({ step: step.text, ability: step.name, frames: result.record.frames.length, row })
		results.push(row)
	}
} catch (error) {
	console.error(error.message)
	results.push({ step: '(run)', ok: false, problems: [error.message] })
} finally {
	problems = errors()
	close()
}
if (problems && !/no (page )?errors/i.test(problems))
	results.push({ step: '(page)', ok: false, problems: [`browser errors: ${problems}`] })

// --- the clip --------------------------------------------------------------------------------------------------
let clip = null
if (values.clip && frameCount) {
	const font = run('fc-match', ['-f', '%{file}', 'monospace'])
	let from = 0
	const filters = ['scale=trunc(iw/2)*2:trunc(ih/2)*2']
	for (const segment of segments) {
		const row = segment.row
		const lock =
			row.authored?.castLock == null ? '' : `  cast ${row.authored.castLock.toFixed(2)} s`
		const hit =
			row.authored?.firstHit == null ? '' : `  first hit ${row.authored.firstHit.toFixed(2)} s`
		const text = `${hero.name} · ${row.ability} · ${row.aim}${lock}${hit}${row.ok ? '' : '  FAILED'}`
		const file = join(framesDir, `caption-${segments.indexOf(segment)}.txt`)
		writeFileSync(file, text)
		const length = segment.frames / fps
		filters.push(
			`drawtext=fontfile='${font}':textfile='${file}':x=24:y=h-44:fontsize=22:fontcolor=white:box=1:boxcolor=0x14243dcc:boxborderw=8:enable='between(t,${from.toFixed(3)},${(from + length).toFixed(3)})'`,
		)
		from += length
	}
	const note = `frame-stepped: ${every} sim ticks per frame, ${Number(values.slow) === 1 ? 'authored speed' : `${values.slow}x slower than authored`}`
	writeFileSync(join(framesDir, 'caption-note.txt'), note)
	filters.push(
		`drawtext=fontfile='${font}':textfile='${join(framesDir, 'caption-note.txt')}':x=24:y=18:fontsize=18:fontcolor=0xffffffcc:box=1:boxcolor=0x14243d99:boxborderw=6`,
	)
	const file = join(out, 'cast.webm')
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
		slow: Number(values.slow),
	}
}
if (!values.clip || clip) rmSync(framesDir, { recursive: true, force: true })

const report = {
	hero: heroId,
	map: values.map,
	seed: Number(values.seed),
	viewport: `${width}x${height}`,
	ok: results.every((r) => r.ok),
	timing: `Frame-stepped: the sim ran exactly 1/60 s per tick, whatever the host load; every time below is authored sim time. Wall time (${((Date.now() - started) / 1000).toFixed(0)} s, load ${load}) and software-rendered frames say nothing about hardware FPS or input latency, which this does not measure.`,
	clip,
	steps: results,
}
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'cast.json'), JSON.stringify(report, null, '\t') + '\n')
for (const r of results) {
	const phases = (r.authored?.phases ?? []).map((p) => `${p.now} ${p.seconds ?? '…'}s`).join(', ')
	const hits = (r.hits ?? []).map((h) => `${h.damage}hp@${h.at}s`).join(' ')
	console.log(
		`${r.ok ? 'ok  ' : 'FAIL'} ${r.step.padEnd(16)} ${(r.ability ?? '').padEnd(14)} ${(r.aim ?? '').padEnd(6)} lock ${r.authored?.castLock ?? '-'}  ${phases}  ${hits}${r.problems?.length ? '  !! ' + r.problems.join('; ') : ''}`,
	)
}
console.log(
	`${join(out, 'cast.json')}${clip ? `\n${clip.file} (${clip.frames} frames, ${clip.seconds} s at ${clip.fps} fps)` : ''}`,
)
if (!report.ok) process.exitCode = 1
