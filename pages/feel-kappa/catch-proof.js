// Kappa's catch, frame-stepped through the cast tool's page half (scripts/cast-page.js), under the capture lock:
//   bun pages/feel-kappa/catch-proof.js [--out dir]
// `bun run cast` cannot stage an incoming shot, so this is a one-off: a real W key opens the catch, the foe's shot is
// launched at Kappa through the sim (the foe is a stand-in that cannot aim), then a real Q key throws it back at the foe.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
	bootMatch,
	browserSession,
	devServer,
	holdCaptureLock,
	run,
} from '../../scripts/capture.js'

holdCaptureLock()
const root = join(import.meta.dir, '../..')
const out = resolve(
	Bun.argv.includes('--out') ? Bun.argv[Bun.argv.indexOf('--out') + 1] : import.meta.dir,
)
const every = 2
const fps = 30
const framesDir = join(out, 'catch-frames')
rmSync(framesDir, { recursive: true, force: true })
mkdirSync(framesDir, { recursive: true })
const { browser, evaluate, errors, close } = browserSession('catch-proof')
const call = (js) => JSON.parse(evaluate(`JSON.stringify(${js})`))
let count = 0
const keep = (frames) => {
	for (const data of frames) {
		count++
		writeFileSync(
			join(framesDir, `${String(count).padStart(5, '0')}.jpg`),
			Buffer.from(data, 'base64'),
		)
	}
}
const advance = (ticks, extra = '') => {
	for (let ran = 0; ran < ticks; ran += 12) {
		const n = Math.min(12, ticks - ran)
		keep(call(`(() => (__cast.step(${n}, { every: ${every}${extra} }), __cast.takeFrames()))()`))
	}
}
const press = (code, ticks) =>
	keep(
		call(`(() => (__cast.press('${code}', ${ticks}, { every: ${every} }), __cast.takeFrames()))()`),
	)
const marks = []
const log = []
const note = (text) => marks.push({ frame: count, text })
try {
	browser('set', 'viewport', '1280', '720')
	bootMatch(
		{ browser },
		`${devServer()}?mode=moba&play&map=overthrow&hero=kappa&bots=easy&seed=2`,
		{
			width: 1280,
			height: 720,
		},
	)
	evaluate(readFileSync(join(root, 'scripts/cast-page.js'), 'utf8'))
	call('__cast.setup({})')
	const here = call('__cast.reset(6)')
	call('(() => { __cast.take(); return 1 })()')
	const foe = call('__cast.screen(' + here.foe.x + ',' + here.foe.z + ')')
	browser('mouse', 'move', String(foe.x), String(foe.y))
	advance(8)
	note('W: the catch opens')
	press('KeyW', 10)
	advance(10)
	note('the foe fires; the cone takes it')
	call(
		`(() => { const s = dt.game.moba.sim, me = s.heroes.find((h) => h.id === s.training.local), f = s.find(__cast.ids.foe); s.launchShot(f, { x: -1, z: 0 }, { ability: 'loose', slot: 'slot1', catchable: true, isAbility: true, damage: 150, speed: 14, radius: 0.35, range: 14 }); return 1 })()`,
	)
	advance(26)
	call('(() => { const r = __cast.take(); window.__log = r.log; return 1 })()')
	const caught = call('(window.__log ?? []).some((f) => f.type === "caught")')
	log.push({ caught })
	note('the shot waits in the glove as a ball')
	advance(60)
	note('Q: Toss throws it back')
	press('KeyQ', 10)
	advance(70)
	const result = call('__cast.take()')
	log.push({ hp: result.hp, facts: [...new Set(result.log.map((f) => f.type))] })
} finally {
	const problems = errors()
	if (problems && !/no (page )?errors/i.test(problems)) log.push({ browserErrors: problems })
	close()
}
const font = run('fc-match', ['-f', '%{file}', 'monospace'])
const filters = ['scale=trunc(iw/2)*2:trunc(ih/2)*2']
marks.forEach((mark, i) => {
	const from = mark.frame / fps
	const to = (marks[i + 1]?.frame ?? count) / fps
	const file = join(framesDir, `caption-${i}.txt`)
	writeFileSync(file, `Kappa · catch → pocket → return · ${mark.text}`)
	filters.push(
		`drawtext=fontfile='${font}':textfile='${file}':x=24:y=h-44:fontsize=22:fontcolor=white:box=1:boxcolor=0x14243dcc:boxborderw=8:enable='between(t,${from.toFixed(3)},${to.toFixed(3)})'`,
	)
})
writeFileSync(
	join(framesDir, 'note.txt'),
	`frame-stepped: ${every} sim ticks per frame, authored speed; the foe's shot is injected through the sim`,
)
filters.push(
	`drawtext=fontfile='${font}':textfile='${join(framesDir, 'note.txt')}':x=24:y=18:fontsize=18:fontcolor=0xffffffcc:box=1:boxcolor=0x14243d99:boxborderw=6`,
)
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
	join(out, 'catch.webm'),
])
rmSync(framesDir, { recursive: true, force: true })
writeFileSync(
	join(out, 'catch.json'),
	JSON.stringify(
		{ frames: count, seconds: +(count / fps).toFixed(2), ticksPerFrame: every, log, marks },
		null,
		'\t',
	) + '\n',
)
console.log(JSON.stringify({ frames: count, log }))
