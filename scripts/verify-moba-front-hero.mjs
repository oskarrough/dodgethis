// Production preview: node scripts/verify-moba-front-hero.mjs <URL> <artifact directory>
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const base = process.argv[2] ?? 'http://127.0.0.1:4173'
const dir = resolve(process.argv[3] ?? `${process.env.BB_THREAD_STORAGE}/front-hero`)
mkdirSync(dir, { recursive: true })
const browser = (...args) =>
	execFileSync('agent-browser', ['--session', 'hero-proof', ...args], { encoding: 'utf8' }).trim()
const evaluate = (script) => JSON.parse(browser('eval', script))
const wait = (ms) => browser('wait', String(ms))
const key = (code, shiftKey = false) =>
	evaluate(
		`window.dispatchEvent(new KeyboardEvent('keydown',{code:${JSON.stringify(code)},shiftKey:${shiftKey},bubbles:true,cancelable:true}));true`,
	)
function boot(debug = false) {
	browser('open', `${base}/?mode=moba${debug ? '&debug' : ''}`)
	browser('wait', '.moba-front')
	if (!debug) key('Backquote')
	evaluate('window.probe=window.game;true')
	key('Backquote')
}
function padInstall() {
	evaluate(
		`window.mockPad={connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false}))};Object.defineProperty(navigator,'getGamepads',{value:()=>[mockPad],configurable:true});true`,
	)
	wait(100)
}
function pad(button) {
	evaluate(`mockPad.buttons[${button}].pressed=true`)
	wait(80)
	evaluate(`mockPad.buttons[${button}].pressed=false`)
	wait(80)
}
const report = {}
boot()
key('Enter')
report.keyboardHero = evaluate('probe.front.screen === "hero"')
key('Tab')
key('Enter')
report.keyboardPreview = evaluate(
	'!!document.querySelector(".front-slot[data-slot=Q].selected") && !probe.moba',
)
for (let i = 0; i < 5; i++) key('Tab')
key('Enter')
wait(200)
report.keyboardLock = evaluate('!!probe.moba && !document.querySelector(".moba-front")')
boot()
key('Enter')
key('Escape')
report.keyboardBackOne = evaluate(
	'probe.front.screen === "modes" && !!document.querySelector(".front-practice:not([hidden])")',
)
key('Escape')
report.keyboardHub = evaluate('!!document.querySelector(".splash:not([hidden])")')
boot()
browser('click', '.front-practice')
browser('click', '.front-slot[data-slot=E]')
report.mousePreview = evaluate(
	'!!document.querySelector(".front-slot[data-slot=E].selected") && !probe.moba',
)
browser('click', '.front-lock')
wait(200)
report.mouseLock = evaluate('!!probe.moba')
boot()
browser('click', '.front-practice')
browser('click', '.front-back')
report.mouseBackOne = evaluate('probe.front.screen === "modes"')
browser('click', '.front-back')
report.mouseHub = evaluate('!!document.querySelector(".splash:not([hidden])")')
boot()
padInstall()
pad(0)
report.padHero = evaluate('probe.front.screen === "hero"')
pad(13)
pad(0)
report.padPreview = evaluate(
	'!!document.querySelector(".front-slot[data-slot=Q].selected") && !probe.moba',
)
for (let i = 0; i < 5; i++) pad(13)
evaluate('mockPad.buttons[0].pressed=true')
wait(300)
report.padLock = evaluate('!!probe.moba')
report.heldConfirmConsumed = evaluate(
	'!probe.moba.sim.heroes[0].attack && !probe.moba.sim.heroes[0].cast',
)
boot()
padInstall()
pad(0)
evaluate('mockPad.buttons[1].pressed=true')
wait(400)
report.padBackOne = evaluate('probe.front.screen === "modes"')
evaluate('mockPad.buttons[1].pressed=false')
wait(100)
pad(1)
report.padHub = evaluate('!!document.querySelector(".splash:not([hidden])")')

report.screens = []
for (const [width, height] of [
	[390, 844],
	[1440, 900],
	[2560, 1080],
]) {
	browser('set', 'viewport', String(width), String(height))
	boot()
	key('Enter')
	wait(2200)
	browser('screenshot', `${dir}/hero-${width}-default.png`)
	key('Tab')
	browser('screenshot', `${dir}/hero-${width}-q.png`)
	for (let i = 0; i < 4; i++) key('Tab')
	key('Enter')
	browser('screenshot', `${dir}/hero-${width}-numbers.png`)
	report.screens.push(
		evaluate(
			`({width:innerWidth,buttons:document.querySelectorAll('.front-hero button').length,valuesVisible:!document.querySelector('.front-values').hidden,canvas:[getComputedStyle(document.querySelector('canvas')).width,getComputedStyle(document.querySelector('canvas')).height],valuesOverflow:document.querySelector('.front-values').scrollHeight-document.querySelector('.front-values').clientHeight})`,
		),
	)
	boot(true)
	key('Enter')
	// Drive the actual lil-gui controller, not just the backing object.
	evaluate(
		`(()=>{const labels=[...document.querySelectorAll('.lil-gui .lil-controller')];const controller=labels.find(el=>el.querySelector('.lil-name')?.textContent==='damage' && el.closest('.lil-gui')?.querySelector('.lil-title')?.textContent==='loose');const input=controller.querySelector('input[type=text]');input.value='230';input.dispatchEvent(new Event('input',{bubbles:true}));return true})()`,
	)
	wait(100)
	report[`edit${width}`] = evaluate(
		'probe.tune.kit.loose.damage===230 && document.querySelectorAll(".front-description")[1].textContent.includes("230")',
	)
	for (let i = 0; i < 5; i++) key('Tab')
	key('Enter')
	browser('screenshot', `${dir}/hero-${width}-debug-edit.png`)
	evaluate(`document.querySelector('.moba-front').style.filter='grayscale(1)';true`)
	browser('screenshot', `${dir}/hero-${width}-grayscale.png`)
}

boot()
key('Enter')
const ws = new WebSocket(browser('get', 'cdp-url'))
await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }))
let id = 0
const pending = new Map()
let events = []
let complete
ws.addEventListener('message', ({ data }) => {
	const m = JSON.parse(data)
	if (m.method === 'Tracing.dataCollected') events.push(...m.params.value)
	if (m.method === 'Tracing.tracingComplete') complete?.()
	if (!m.id) return
	const request = pending.get(m.id)
	pending.delete(m.id)
	if (m.error) request.reject(m.error)
	else request.resolve(m.result)
})
const send = (method, params = {}, sessionId) =>
	new Promise((resolve, reject) => {
		const next = ++id
		pending.set(next, { resolve, reject })
		ws.send(JSON.stringify({ id: next, method, params, sessionId }))
	})
const { targetInfos } = await send('Target.getTargets')
const target = targetInfos.find((target) => target.type === 'page' && target.url.startsWith(base))
const { sessionId } = await send('Target.attachToTarget', {
	targetId: target.targetId,
	flatten: true,
})
await send(
	'Emulation.setDeviceMetricsOverride',
	{ width: 2560, height: 1080, deviceScaleFactor: 2, mobile: false },
	sessionId,
)
wait(500)
key('Tab')
key('Enter')
wait(2200)
await send('Tracing.start', {
	categories:
		'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,cc',
	transferMode: 'ReportEvents',
})
report.trace = evaluate(`(async()=>{
	const start=performance.now();let next=0;
	await new Promise(resolve=>{function frame(now){const t=(now-start)/1000;
		window.dispatchEvent(new PointerEvent('pointermove',{clientX:innerWidth*(.5+.48*Math.sin(t*4)),clientY:innerHeight*(.5+.4*Math.cos(t*4)),bubbles:true}));
		if(t>=next){const slot=['Q','W','E','R'][Math.floor(next/.6)%4];const button=document.querySelector('[data-slot='+slot+']');button.dispatchEvent(new PointerEvent('pointerenter'));button.click();next+=.6}
		if(t<6)requestAnimationFrame(frame);else resolve()
	}requestAnimationFrame(frame)});
	return {viewport:[innerWidth,innerHeight,devicePixelRatio],draw:probe.renderer.info.render.calls,animations:document.getAnimations().length};
})()`)
const finished = new Promise((resolve) => {
	complete = resolve
})
await send('Tracing.end')
await finished
writeFileSync(`${dir}/skill-preview-dpr2.json`, JSON.stringify({ traceEvents: events }))
report.trace.events = Object.fromEntries(
	['Layout', 'Paint', 'RasterTask', 'UpdateLayoutTree'].map((name) => [
		name,
		events.filter((event) => event.name === name && event.ph === 'X').length,
	]),
)
await send('Emulation.clearDeviceMetricsOverride', {}, sessionId)
ws.close()
writeFileSync(`${dir}/results.json`, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
if (Object.values(report).some((value) => value === false)) process.exitCode = 1
