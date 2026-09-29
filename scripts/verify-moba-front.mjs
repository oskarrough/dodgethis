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
const key = (code, shiftKey = false) =>
	evaluate(
		`window.dispatchEvent(new KeyboardEvent('keydown',{code:${JSON.stringify(code)},shiftKey:${shiftKey},bubbles:true,cancelable:true}));true`,
	)
function boot() {
	browser('open', new URL('/?mode=moba', base).href)
	browser('wait', '.moba-front')
	key('Backquote')
	evaluate('window.probe=window.game;true')
	key('Backquote')
}
function installPad() {
	evaluate(
		`window.mockPad={connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false}))};Object.defineProperty(navigator,'getGamepads',{value:()=>[mockPad],configurable:true});true`,
	)
	wait(100)
}
function pad(button) {
	evaluate(`mockPad.buttons[${button}].pressed=true`)
	wait(100)
	evaluate(`mockPad.buttons[${button}].pressed=false`)
	wait(100)
}
const report = {}
boot()
key('Tab')
key('Tab', true)
key('Enter')
wait(200)
report.keyboard = evaluate('!!probe.moba && !document.querySelector(".moba-front")')
boot()
key('Escape')
wait(100)
report.keyboardBack = evaluate('!!document.querySelector(".splash:not([hidden])")')
boot()
browser('click', '.front-practice')
wait(200)
report.mouse = evaluate('!!probe.moba && !document.querySelector(".moba-front")')
boot()
browser('click', '.front-back')
wait(100)
report.mouseBack = evaluate('!!document.querySelector(".splash:not([hidden])")')
boot()
installPad()
pad(13)
pad(12)
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
			`({size:[innerWidth,innerHeight],circle:(()=>{const m=document.querySelector('.front-backdrop circle').getScreenCTM();return m.a/m.d})(),prompts:document.querySelectorAll('.front-prompts span').length})`,
		),
	)
	browser('screenshot', `${dir}/front-${width}x${height}.png`)
}
evaluate('mockPad.buttons[0].pressed=true')
wait(300)
report.pad = evaluate('!!probe.moba && !document.querySelector(".moba-front")')
report.heldConfirmConsumed = evaluate(
	'!probe.moba.sim.heroes[0].attack && !probe.moba.sim.heroes[0].cast',
)
boot()
installPad()
pad(1)
report.padBack = evaluate('!!document.querySelector(".splash:not([hidden])")')
boot()
report.reversal = evaluate(
	`(async()=>{const sky=document.querySelector('.front-sky-next');const first=probe.front.crossfade(true);await new Promise(r=>setTimeout(r,350));const before=+getComputedStyle(sky).opacity;const second=probe.front.crossfade(false);const after=+getComputedStyle(sky).opacity;await Promise.all([first,second]);return {before,after,landed:+getComputedStyle(sky).opacity}})()`,
)
report.fadeMotion = evaluate(`(async()=>{
	const ridge=document.querySelectorAll('.front-backdrop svg')[2];
	const x=()=>new DOMMatrix(getComputedStyle(ridge).transform).m41;
	const before=x();const fade=probe.front.crossfade(true);
	window.dispatchEvent(new PointerEvent('pointermove',{clientX:innerWidth,clientY:innerHeight,bubbles:true}));
	await new Promise(r=>setTimeout(r,150));const during=x();
	await fade;await new Promise(requestAnimationFrame);const first=x();
	await new Promise(r=>setTimeout(r,2200));const settled=x();
	await probe.front.crossfade(false);
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
	'({viewport:[innerWidth,innerHeight,devicePixelRatio],draw:probe.renderer.info.render.calls,animations:document.getAnimations().length})',
)
await traceStart()
wait(10000)
await traceStop(`${dir}/idle.json`)
report.idleDraw = evaluate('probe.renderer.info.render.calls')
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
		'keyboard',
		'keyboardBack',
		'mouse',
		'mouseBack',
		'pad',
		'padBack',
		'heldConfirmConsumed',
	].every((key) => report[key]) ||
	report.screens.some((screen) => Math.abs(screen.circle - 1) > 0.00001 || screen.prompts !== 3) ||
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
