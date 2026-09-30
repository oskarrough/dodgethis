// node scripts/verify-moba-front-loading.mjs <URL> <artifact directory>
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const base = process.argv[2] ?? 'http://127.0.0.1:4178'
const dir = resolve(process.argv[3] ?? `${process.env.BB_THREAD_STORAGE}/loading`)
mkdirSync(dir, { recursive: true })
const browser = (...args) =>
	execFileSync(
		'agent-browser',
		['--session', process.env.FRONT_BROWSER_SESSION ?? 'loading-proof', ...args],
		{
			encoding: 'utf8',
		},
	).trim()
const evaluate = (script) => {
	if (!script.startsWith('(async') && !script.startsWith('probe.loading.captureAt('))
		return JSON.parse(browser('eval', script))
	// Poll long render waits instead of holding one CDP request past the CLI timeout on software GPUs.
	browser(
		'eval',
		`(()=>{window.proofResult={done:false};Promise.resolve(${script}).then(value=>window.proofResult={done:true,value},error=>window.proofResult={done:true,error:String(error)});return true})()`,
	)
	const deadline = Date.now() + 120000
	while (Date.now() < deadline) {
		const result = JSON.parse(browser('eval', 'window.proofResult'))
		if (result.done) {
			if (result.error) throw new Error(result.error)
			return result.value
		}
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100)
	}
	throw new Error('Render wait exceeded two minutes')
}
const wait = (ms) => browser('wait', String(ms))
const key = (code, repeat = false) =>
	evaluate(
		`window.dispatchEvent(new KeyboardEvent('keydown',{code:${JSON.stringify(code)},repeat:${repeat},bubbles:true,cancelable:true}));true`,
	)
const assert = (value, message) => {
	if (!value) throw new Error(message)
}
let boots = 0
let currentUrl = ''
const boot = () => {
	currentUrl = `${base}/?mode=moba&debug&proof=${process.pid}-${++boots}`
	browser('open', currentUrl)
	browser('wait', '.moba-front')
	evaluate('window.probe=game;true')
	key('Backquote')
}
const report = { screens: [], handoff: [] }
boot()
const baseline = evaluate(
	'({bodies:probe.world.bodies.len(),colliders:probe.world.colliders.len()})',
)
key('Enter')
evaluate('probe.front.waitForBuild(3);true')
for (let i = 0; i < 6; i++) key('Tab')
report.earlySkip = evaluate(`(()=>{
	const key=(code,repeat=false)=>window.dispatchEvent(new KeyboardEvent('keydown',{code,repeat,bubbles:true,cancelable:true}));
	key('Enter');key('Enter');key('Enter',true);
	const state=probe.loading.state;
	const valid=state.skipped && !state.ready && state.tick===0 && state.phase==='hold';
	key('Escape');return valid;
})()`)
assert(report.earlySkip, 'Skip bypassed readiness or simulation freeze')
report.cancel = evaluate(
	`probe.front.screen==="hero" && !probe.moba && !probe.loading && probe.world.bodies.len()===${baseline.bodies} && probe.world.colliders.len()===${baseline.colliders}`,
)
assert(report.cancel, 'Cancel failed to dispose real map bodies')
wait(3200)
report.lateBuild = evaluate('probe.front.screen==="hero" && !probe.moba')
key('Escape')
report.backOne = evaluate('probe.front.screen==="modes"')
key('Escape')
report.hub = evaluate('!!document.querySelector(".splash:not([hidden])")')
boot()
key('Enter')
for (let i = 0; i < 6; i++) key('Tab')
key('Enter')
key('Enter', true)
evaluate('(async()=>{while(probe.loading)await new Promise(requestAnimationFrame);return true})()')
report.keyboard = evaluate(
	'!!probe.moba && !probe.loading && !probe.moba.sim.heroes[0].attack && !probe.moba.sim.heroes[0].cast',
)
assert(report.keyboard, 'Keyboard flow failed')
boot()
browser('click', '.front-practice')
report.keyup = evaluate(`(async()=>{
	window.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowLeft',bubbles:true,cancelable:true}));
	document.querySelector('.front-lock').click();
	let released=false;
	window.addEventListener('keyup',e=>{if(e.code==='ArrowLeft' && !e.defaultPrevented)released=true},{once:true});
	await probe.loading.captureAt(.5);
	window.dispatchEvent(new KeyboardEvent('keyup',{code:'ArrowLeft',bubbles:true,cancelable:true}));
	probe.loading.resume();while(probe.loading)await new Promise(requestAnimationFrame);
	const x=probe.moba.snapshot().heroes[0].pos.x;
	await new Promise(requestAnimationFrame);
	return released && Math.abs(probe.moba.snapshot().heroes[0].pos.x-x)<.001;
})()`)
assert(report.keyup, 'Loading swallowed a release or resumed movement')
boot()
browser('click', '.front-practice')
report.slowReadyDwell = evaluate(`(async()=>{
	probe.front.waitForBuild(3);document.querySelector('.front-lock').click();
	const state=await probe.loading.captureAt(0);
	const valid=state.elapsed>=probe.tune.front.loading.hold && state.dwell>=probe.tune.front.loading.dwell && state.ready;
	window.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',bubbles:true,cancelable:true}));return valid;
})()`)
assert(report.slowReadyDwell, 'A slow build consumed the establishing dwell')
boot()
evaluate(
	`window.mockPad={connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false}))};Object.defineProperty(navigator,'getGamepads',{value:()=>[mockPad],configurable:true});true`,
)
const pad = (index) => {
	evaluate(`mockPad.buttons[${index}].pressed=true`)
	wait(80)
	evaluate(`mockPad.buttons[${index}].pressed=false`)
	wait(80)
}
pad(0)
for (let i = 0; i < 6; i++) pad(13)
evaluate('mockPad.buttons[0].pressed=true')
evaluate(
	'(async()=>{while(probe.loading)await new Promise(requestAnimationFrame);await new Promise(r=>setTimeout(r,150));return true})()',
)
report.heldPad = evaluate(
	'!!probe.moba && !probe.loading && !probe.moba.sim.heroes[0].attack && !probe.moba.sim.heroes[0].cast && probe.moba.sim.tick>0',
)
assert(report.heldPad, 'Held pad confirm leaked')
boot()
evaluate(
	`window.mockPad={connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false}))};Object.defineProperty(navigator,'getGamepads',{value:()=>[mockPad],configurable:true});true`,
)
pad(0)
evaluate('probe.front.waitForBuild(3);true')
for (let i = 0; i < 6; i++) pad(13)
pad(0)
evaluate('mockPad.buttons[1].pressed=true')
wait(500)
report.padCancel = evaluate('probe.front.screen==="hero" && !probe.moba')
assert(report.padCancel, 'Pad B crossed two screens')
evaluate('mockPad.buttons[1].pressed=false')
wait(100)
pad(1)
report.padBack = evaluate('probe.front.screen==="modes"')
boot()
browser('click', '.front-practice')
evaluate('probe.front.waitForBuild(3);true')
browser('click', '.front-lock')
browser('click', '.front-skip')
wait(300)
report.mouseSkip = evaluate('probe.loading.state.skipped && probe.loading.state.tick===0')
browser('click', '.front-back')
report.mouseCancel = evaluate('probe.front.screen==="hero" && !probe.moba')
assert(report.mouseCancel, 'Mouse cancel failed')
browser('click', '.front-back')
browser('click', '.front-back')
report.mouseHub = evaluate('!!document.querySelector(".splash:not([hidden])")')
for (const [width, height] of [
	[390, 844],
	[1440, 900],
	[2560, 1080],
]) {
	browser('set', 'viewport', String(width), String(height))
	boot()
	browser('click', '.front-practice')
	const layout = evaluate(
		`(()=>{const n=document.querySelector('.front-numbers').getBoundingClientRect(), s=document.querySelector('.front-seats').getBoundingClientRect();return {width:innerWidth,numbersBottom:n.bottom,seatsTop:s.top,clear:n.bottom<s.top}})()`,
	)
	assert(layout.clear, `Seats overlap Numbers at ${width}`)
	browser('screenshot', `${dir}/hero-${width}-seats.png`)
	const zero = evaluate(
		`(async()=>{document.querySelector('.front-lock').click();return await probe.loading.captureAt(0)})()`,
	)
	assert(zero.phase === 'descent' && zero.progress === 0, '0% is not descent start')
	for (const progress of [0, 0.5, 1]) {
		if (progress) {
			const state = evaluate(`probe.loading.captureAt(${progress})`)
			assert(
				Math.abs(state.progress - progress) < 1e-8,
				`Wrong capture ${progress}: ${JSON.stringify(state)}`,
			)
		}
		const before = evaluate('probe.loading.state')
		assert(before.tick === 0 && before.progress === progress, 'Screenshot is not frozen')
		const presentation = evaluate(
			`({opacity:getComputedStyle(document.querySelector('.front-loading-ui')).opacity,skipDisabled:document.querySelector('.front-skip').disabled,rasterPixels:document.querySelector('.front-descent-raster').naturalWidth,dpr:devicePixelRatio})`,
		)
		assert(presentation.skipDisabled, 'Skip stayed live after hold')
		assert(presentation.rasterPixels === Math.ceil(width * presentation.dpr), 'Raster ignored DPR')
		if (progress >= 0.5) assert(Number(presentation.opacity) === 0, 'UI lingered over the lane')
		browser('screenshot', `${dir}/descent-${width}-${progress * 100}.png`)
		const after = evaluate('probe.loading.state')
		assert(after.tick === 0 && after.progress === progress, 'Screenshot drifted')
		report.screens.push({ width, height, progress, before, after, layout, presentation })
	}
	const handoff = evaluate(`(async()=>{
		const eye=probe.camera.position.clone(), rotation=probe.camera.quaternion.clone();
		window.dispatchEvent(new PointerEvent('pointermove',{clientX:innerWidth*.82,clientY:innerHeight*.3,bubbles:true}));
		probe.loading.resume();while(probe.loading)await new Promise(requestAnimationFrame);
		await new Promise(requestAnimationFrame);
		return {distance:eye.distanceTo(probe.camera.position),rotation:rotation.angleTo(probe.camera.quaternion)};
	})()`)
	assert(
		handoff.distance < 0.01 && handoff.rotation < 0.001,
		'Real follow camera snapped on handoff',
	)
	report.handoff.push({ width, ...handoff })
	wait(200)
	assert(
		evaluate(
			'!!probe.moba && !probe.loading && probe.moba.sim.tick>0 && document.querySelector("canvas").isConnected',
		),
		'Landing failed',
	)
}

boot()
browser('click', '.front-practice')
evaluate(
	'(async()=>{document.querySelector(".front-lock").click();return await probe.loading.captureAt(.5)})()',
)
key('Escape')
report.midDescentCancel = evaluate(
	'probe.front.screen==="hero" && !probe.moba && !probe.loading && !document.querySelector(".front-descent-raster")',
)
assert(report.midDescentCancel, 'Mid-descent cancellation failed')
browser('click', '.front-back')
report.reversal = evaluate('probe.front.screen==="modes"')
boot()
browser('click', '.front-practice')
const ws = new WebSocket(browser('get', 'cdp-url'))
await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }))
let id = 0,
	complete
const pending = new Map(),
	events = []
ws.addEventListener('message', ({ data }) => {
	const m = JSON.parse(data)
	if (m.method === 'Tracing.dataCollected') events.push(...m.params.value)
	if (m.method === 'Tracing.tracingComplete') complete?.()
	if (m.id) {
		const r = pending.get(m.id)
		pending.delete(m.id)
		if (m.error) r.reject(m.error)
		else r.resolve(m.result)
	}
})
const send = (method, params = {}, sessionId) =>
	new Promise((resolve, reject) => {
		const next = ++id
		pending.set(next, { resolve, reject })
		ws.send(JSON.stringify({ id: next, method, params, sessionId }))
	})
const { targetInfos } = await send('Target.getTargets')
const target = targetInfos.find((t) => t.type === 'page' && t.url === currentUrl)
const { sessionId } = await send('Target.attachToTarget', {
	targetId: target.targetId,
	flatten: true,
})
await send(
	'Emulation.setDeviceMetricsOverride',
	{ width: 2560, height: 1440, deviceScaleFactor: 2, mobile: false },
	sessionId,
)
wait(500)
await send('Tracing.start', {
	categories:
		'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,cc',
	transferMode: 'ReportEvents',
})
const traceEvaluation = await send(
	'Runtime.evaluate',
	{
		awaitPromise: true,
		returnByValue: true,
		expression: `(async()=>{
	document.querySelector('.front-lock').click();
	const samples=[];const start=performance.now();let phase='';
	await new Promise(resolve=>{function frame(now){const t=(now-start)/1000;
		window.dispatchEvent(new PointerEvent('pointermove',{clientX:innerWidth*(.5+.48*Math.sin(t*8)),clientY:innerHeight*(.5+.4*Math.cos(t*8)),bubbles:true}));
		if(probe.loading && probe.loading.state.phase!==phase){phase=probe.loading.state.phase;console.timeStamp('loading-'+phase)}
		if(probe.loading)samples.push({...probe.loading.state,at:t,animations:document.getAnimations().length,raster:document.querySelector('.front-descent-raster')?.getBoundingClientRect().width,rasterPixels:document.querySelector('.front-descent-raster')?.naturalWidth,svgVisible:[...document.querySelectorAll('.front-backdrop > svg')].filter(el=>!el.hidden).length});
		if(t<3.5 || ((probe.loading || !probe.moba.sim.tick) && t<60))requestAnimationFrame(frame);else resolve();
	}requestAnimationFrame(frame)});
	return {viewport:[innerWidth,innerHeight,devicePixelRatio],rendererDpr:probe.renderer.getPixelRatio(),samples,landed:!probe.loading && probe.moba.sim.tick>0};
})()`,
	},
	sessionId,
)
if (traceEvaluation.exceptionDetails)
	throw new Error(JSON.stringify(traceEvaluation.exceptionDetails))
report.trace = traceEvaluation.result.value
const done = new Promise((resolve) => (complete = resolve))
await send('Tracing.end')
await done
writeFileSync(`${dir}/descent-dpr2.json`, JSON.stringify({ traceEvents: events }))
report.trace.events = Object.fromEntries(
	['Layout', 'Paint', 'RasterTask', 'UpdateLayoutTree'].map((name) => [
		name,
		events.filter((e) => e.name === name && e.ph === 'X').length,
	]),
)
await send('Emulation.clearDeviceMetricsOverride', {}, sessionId)
ws.close()
const descentMark = events.find(
	(event) => event.name === 'TimeStamp' && event.args?.data?.message === 'loading-descent',
)
report.trace.descentEvents = Object.fromEntries(
	['Layout', 'Paint', 'RasterTask', 'UpdateLayoutTree'].map((name) => [
		name,
		events.filter((event) => event.name === name && event.ph === 'X' && event.ts >= descentMark.ts)
			.length,
	]),
)
assert(
	report.trace.samples
		.filter((sample) => sample.phase === 'descent')
		.every(
			(sample) =>
				sample.svgVisible === 0 && sample.raster <= 2560 * 1.1 && sample.rasterPixels === 5120,
		),
	'Descent scaled live SVG or exceeded raster budget',
)
assert(report.trace.landed, 'Trace did not land')
assert(
	report.trace.samples.every((s) => s.tick === 0),
	'Sim advanced during trace descent',
)
writeFileSync(`${dir}/results.json`, JSON.stringify(report, null, 2) + '\n')
console.log(
	JSON.stringify(
		{ ...report, trace: { ...report.trace, samples: report.trace.samples.length } },
		null,
		2,
	),
)
assert(
	Object.values(report).every((v) => v !== false),
	'Interaction assertion failed',
)
