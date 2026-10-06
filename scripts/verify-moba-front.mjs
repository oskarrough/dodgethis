// Production preview: node scripts/verify-moba-front.mjs <base URL> <artifact directory>
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const base = process.argv[2] ?? 'http://127.0.0.1:4173'
const dir = resolve(process.argv[3] ?? process.env.BB_THREAD_STORAGE ?? '.front-proof')
mkdirSync(dir, { recursive: true })
const browser = (...args) =>
	execFileSync('agent-browser', ['--session', 'front', ...args], { encoding: 'utf8' }).trim()
const evaluate = (script) => JSON.parse(browser('eval', script))
const wait = (ms) => browser('wait', String(ms))
// window.dt (src/core/proof.js) drives keys and the pad.
const key = (code) => evaluate(`dt.key('${code}')`)
const pad = (button) => evaluate(`dt.pad.press('${button}')`)
// Every run starts where a player does: a fresh / on the splash. A production build shows
// window.dt after one Backquote; it stays when the HUD hides again.
function boot() {
	browser('open', 'about:blank')
	browser('open', new URL('/', base).href)
	browser('wait', '.front-tile')
	evaluate(
		"for(const type of ['keydown','keyup','keydown','keyup'])window.dispatchEvent(new KeyboardEvent(type,{code:'Backquote'}));true",
	)
}
const screen = () => evaluate('document.querySelector(".moba-front")?.dataset.screen ?? null')
const report = {}
boot()
report.splash =
	evaluate(
		`[...document.querySelectorAll('.front-modes .front-tile')].map((tile) => tile.dataset.mode).join()`,
	) === 'dodgeball,moba'
key('ArrowRight')
key('Enter')
key('Enter')
wait(200)
report.keyboard = screen() === 'hero' && evaluate('dt.game.front.difficulty') === 'easy'
key('Escape')
const afterOne = screen()
key('Escape')
const afterTwo = screen()
key('Escape')
report.keyboardBack = afterOne === 'difficulty' && afterTwo === 'modes' && screen() === 'modes'
boot()
browser('click', '.front-tile[data-mode=moba]')
browser('click', '.front-tile[data-difficulty=hard]')
wait(200)
report.mouse = screen() === 'hero' && evaluate('dt.game.front.difficulty') === 'hard'
browser('click', '.front-return')
browser('click', '.front-return')
report.mouseBack = screen() === 'modes' && evaluate('location.search') === ''
// Readable on every tile state: resting, focused (flooded) and the remembered difficulty.
report.contrast = evaluate(`(() => {
	const rgb = (value) => {
		const srgb = /color\\(srgb ([\\d.]+) ([\\d.]+) ([\\d.]+)/.exec(value)
		return srgb ? srgb.slice(1).map((c) => c * 255) : value.match(/[\\d.]+/g).slice(0, 3).map(Number)
	}
	const lum = (c) => {
		const [r, g, b] = c.map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
		return 0.2126 * r + 0.7152 * g + 0.0722 * b
	}
	const ratio = (a, b) => {
		const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p)
		return (x + 0.05) / (y + 0.05)
	}
	return [...document.querySelectorAll('.front-tile')].flatMap((tile) =>
		[false, true].map((selected) => {
			const was = tile.classList.contains('selected')
			tile.classList.toggle('selected', selected)
			const face = tile.querySelector('.front-tile-face')
			const fill = selected ? getComputedStyle(face, '::before').backgroundColor : getComputedStyle(face).backgroundColor
			const label = getComputedStyle(tile.querySelector('.front-tile-line'))
			const line = label.color
			const behind = label.backgroundColor.endsWith(', 0)') ? fill : label.backgroundColor
			tile.classList.toggle('selected', was)
			return { tile: tile.dataset.mode ?? tile.dataset.difficulty, selected, ratio: +ratio(behind, line).toFixed(2) }
		}),
	)
})()`)
boot()
browser('click', '.front-tile[data-mode=dodgeball]')
wait(1500)
report.dodgeball = evaluate(
	`!document.querySelector('.moba-front') && !document.querySelector('.mode-picker, [data-mode]') && !document.querySelector('.hub-exit').hidden && location.search === '?mode=dodgeball'`,
)
key('Escape')
wait(300)
report.hubKeyboardBack = screen() === 'modes'
browser('click', '.front-tile[data-mode=dodgeball]')
wait(1500)
browser('click', '.hub-exit')
wait(300)
report.hubMouseBack = screen() === 'modes'
boot()
pad('right')
pad('a')
report.pad = screen() === 'difficulty'
report.screens = []
for (const [width, height] of [
	[1440, 900],
	[2560, 1080],
	[390, 844],
]) {
	browser('set', 'viewport', String(width), String(height))
	wait(300)
	report.screens.push(
		evaluate(
			`({size:[innerWidth,innerHeight],circle:(()=>{const m=document.querySelector('.front-backdrop circle').getScreenCTM();return m.a/m.d})(),prompts:document.querySelectorAll('.front-prompts span').length,back:document.querySelector('.front-return-key').textContent})`,
		),
	)
	browser('screenshot', `${dir}/front-${width}x${height}.png`)
}
pad('b')
report.padBack = screen() === 'modes'
pad('b')
report.padBackOnSplash = screen() === 'modes'
pad('left')
pad('a')
wait(1500)
evaluate("dt.pad.press('back',{hold:200})")
wait(300)
report.hubPadBack = screen() === 'modes'
boot()
report.reversal = evaluate(
	`(async()=>{const sky=document.querySelector('.front-sky-next');const first=dt.game.front.crossfade(true);await new Promise(r=>setTimeout(r,350));const before=+getComputedStyle(sky).opacity;const second=dt.game.front.crossfade(false);const after=+getComputedStyle(sky).opacity;await Promise.all([first,second]);return {before,after,landed:+getComputedStyle(sky).opacity}})()`,
)
report.fadeMotion = evaluate(`(async()=>{
	const ridge=document.querySelectorAll('.front-backdrop svg')[2];
	const x=()=>new DOMMatrix(getComputedStyle(ridge).transform).m41;
	const before=x();const fade=dt.game.front.crossfade(true);
	window.dispatchEvent(new PointerEvent('pointermove',{clientX:innerWidth,clientY:innerHeight,bubbles:true}));
	await new Promise(r=>setTimeout(r,150));const during=x();
	await fade;await new Promise(requestAnimationFrame);const first=x();
	await new Promise(r=>setTimeout(r,2200));const settled=x();
	await dt.game.front.crossfade(false);
	return {before,during,first,settled};
})()`)
const ws = new WebSocket(browser('get', 'cdp-url'))
await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }))
let id = 0
const pending = new Map()
let traceEvents = []
let finishTrace = null
ws.addEventListener('message', ({ data }) => {
	const message = JSON.parse(data)
	if (message.method === 'Tracing.dataCollected') traceEvents.push(...message.params.value)
	if (message.method === 'Tracing.tracingComplete') finishTrace?.()
	if (!message.id) return
	const request = pending.get(message.id)
	pending.delete(message.id)
	if (message.error) request.reject(message.error)
	else request.resolve(message.result)
})
const send = (method, params = {}, sessionId) =>
	new Promise((resolve, reject) => {
		const next = ++id
		pending.set(next, { resolve, reject })
		ws.send(JSON.stringify({ id: next, method, params, sessionId }))
	})
async function traceStart() {
	traceEvents = []
	await send('Tracing.start', {
		categories:
			'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,cc',
		transferMode: 'ReportEvents',
	})
}
async function traceStop(file) {
	const complete = new Promise((resolve) => {
		finishTrace = resolve
	})
	await send('Tracing.end')
	await complete
	finishTrace = null
	writeFileSync(file, JSON.stringify({ traceEvents }))
}
const targets = await send('Target.getTargets')
const target = targets.targetInfos.find(
	(target) => target.type === 'page' && target.url.startsWith(base),
)
const { sessionId } = await send('Target.attachToTarget', {
	targetId: target.targetId,
	flatten: true,
})
await send(
	'Emulation.setDeviceMetricsOverride',
	{ width: 2560, height: 1440, deviceScaleFactor: 2, mobile: false },
	sessionId,
)
// Warm the promoted planes with the same excursion, then let them fully settle.
const sweep = `(async()=>{const start=performance.now();await new Promise(resolve=>{function move(now){const t=Math.min(1,(now-start)/3000);window.dispatchEvent(new PointerEvent('pointermove',{clientX:innerWidth*(.5+.48*Math.sin(t*Math.PI*4)),clientY:innerHeight*(.5+.45*Math.cos(t*Math.PI*4)),bubbles:true}));if(t<1)requestAnimationFrame(move);else resolve()}requestAnimationFrame(move)});await new Promise(r=>setTimeout(r,2200));return true})()`
evaluate(sweep)
await traceStart()
evaluate(sweep)
await traceStop(`${dir}/pointer-sweep-dpr2.json`)
report.pointer = evaluate(
	'({viewport:[innerWidth,innerHeight,devicePixelRatio],draw:dt.game.renderer.info.render.calls,animations:document.getAnimations().length})',
)
await traceStart()
wait(10000)
await traceStop(`${dir}/idle.json`)
report.idleDraw = evaluate('dt.game.renderer.info.render.calls')
for (const file of ['pointer-sweep-dpr2.json', 'idle.json']) {
	const events = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8')).traceEvents
	report[file] = Object.fromEntries(
		['Layout', 'Paint', 'RasterTask', 'UpdateLayoutTree'].map((name) => [
			name,
			events.filter((event) => event.name === name && event.ph === 'X').length,
		]),
	)
}
await send('Emulation.clearDeviceMetricsOverride', {}, sessionId)
ws.close()
writeFileSync(`${dir}/results.json`, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
if (
	![
		'splash',
		'keyboard',
		'keyboardBack',
		'mouse',
		'mouseBack',
		'dodgeball',
		'hubKeyboardBack',
		'hubMouseBack',
		'pad',
		'padBack',
		'padBackOnSplash',
		'hubPadBack',
	].every((key) => report[key]) ||
	report.contrast.some((state) => state.ratio < 4.5) ||
	report.screens.some(
		(screen) =>
			Math.abs(screen.circle - 1) > 0.00001 || screen.prompts !== 2 || screen.back !== 'B',
	) ||
	Math.abs(report.reversal.before - report.reversal.after) > 0.02 ||
	report.reversal.landed !== 0 ||
	report.fadeMotion.during !== report.fadeMotion.before ||
	report.fadeMotion.first === report.fadeMotion.settled ||
	report.idleDraw !== 0 ||
	report.pointer.draw !== 0 ||
	report['idle.json'].Layout ||
	report['idle.json'].Paint ||
	report['pointer-sweep-dpr2.json'].Paint ||
	report['pointer-sweep-dpr2.json'].RasterTask
)
	process.exitCode = 1
