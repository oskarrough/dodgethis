// Production proof: node scripts/verify-moba-debug.mjs <URL> <artifact directory>
// Screenshot starts at / and enters through selection; direct links are checked separately.
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const base = process.argv[2] ?? 'http://127.0.0.1:4851'
const dir = resolve(process.argv[3] ?? '/tmp/moba-debug-proof')
mkdirSync(dir, { recursive: true })
const session = `moba-debug-proof-${process.pid}`
const browser = (...args) =>
	execFileSync('agent-browser', ['--session', session, ...args], { encoding: 'utf8' }).trim()
const evaluate = (source) => JSON.parse(browser('eval', source))
const assert = (source, message) => {
	if (!evaluate(source)) throw new Error(message)
}
const key = (code) =>
	evaluate(
		`(()=>{for(const type of ['keydown','keyup'])window.dispatchEvent(new KeyboardEvent(type,{code:'${code}',bubbles:true,cancelable:true}));return true})()`,
	)
const button = (name) => browser('find', 'role', 'button', 'click', '--name', name, '--exact')
const checkbox = () =>
	browser('find', 'role', 'checkbox', 'click', '--name', 'pause / resume', '--exact')
const report = {
	method:
		'Fresh / → MOBA tile → Easy → lock → loading → mouse order; ordinary app-loop fast-forward, local human seat, no injected damage.',
}
try {
	browser('set', 'viewport', '1440', '900')
	browser('open', `${base}/?mode=moba&play&map=lane&bots=hard&hero=fletcher&seed=27&debug`)
	browser('wait', '--fn', '!!window.game?.moba')
	assert(
		'!document.querySelector(".moba-front") && game.moba.setup.seed===27 && game.moba.setup.difficulty==="hard" && game.moba.sim.tick>0',
		'Direct link did not start its setup',
	)
	report.directSetup = evaluate('game.moba.setup')
	browser('open', `${base}/?mode=moba&play&map=bad&bots=bad&hero=bad&seed=-1&debug`)
	browser('wait', '--fn', '!!window.game?.moba')
	assert(
		'game.moba.setup.map==="lane" && game.moba.setup.heroId==="fletcher" && game.moba.setup.difficulty==="easy" && game.moba.setup.seed===2',
		'Bad-value fallback failed',
	)
	assert('!document.querySelector(".moba-front")', 'Fallback did not start a match')
	report.fallbackWarnings = browser('console')
	for (const param of ['map', 'bots', 'hero', 'seed'])
		if (!report.fallbackWarnings.includes(`invalid ${param}=`))
			throw new Error(`Missing ${param} warning`)
	// Proof screenshot must enter the same way a player does, not through the tested link.
	browser('open', `${base}/`)
	browser('wait', '.front-modes [data-mode="moba"]')
	browser('click', '.front-modes [data-mode="moba"]')
	browser('wait', '.front-difficulty [data-difficulty="easy"]')
	browser('click', '.front-difficulty [data-difficulty="easy"]')
	browser('click', '.front-lock')
	browser(
		'wait',
		'--fn',
		'!document.querySelector(".moba-front") && (!document.querySelector(".splash") || document.querySelector(".splash").hidden)',
	)
	key('Backquote')
	browser('wait', '--fn', '!!window.game?.moba')
	// A real mouse order points at a projected patch of lane, not at a synthetic sim coordinate.
	report.humanStart = evaluate(`(()=>{
		const hero=game.moba.sim.heroes.find(h=>h.id==='local');
		const p=hero.body.position.clone();p.x+=10;p.y=0;p.project(game.camera);
		const at={clientX:(p.x+1)*innerWidth/2,clientY:(1-p.y)*innerHeight/2,button:2,bubbles:true};
		const canvas=document.querySelector('.app');
		window.dispatchEvent(new PointerEvent('pointermove',at));
		canvas.dispatchEvent(new MouseEvent('mousedown',at));
		return {x:hero.body.position.x,z:hero.body.position.z};
	})()`)
	evaluate('game.moba.fastForward({ticks:180});true')
	evaluate('window.dispatchEvent(new MouseEvent("mouseup",{button:2,bubbles:true}));true')
	assert(
		`(()=>{const h=game.moba.sim.heroes.find(h=>h.id==='local');return h.body.position.x>${report.humanStart.x}+1})()`,
		'Human mouse order did not move the local hero',
	)
	// Let actual waves and bot orders develop; this is not a bots-only proof.
	evaluate('game.moba.fastForward({ticks:1000});true')
	assert(
		'game.moba.sim.tick>900 && game.moba.sim.lane.minions.length>=12 && !game.moba.sim.lane.match.winner',
		'Not a live mid-match with both waves',
	)
	checkbox()
	evaluate('window.debugBefore=game.moba.snapshot();true')
	evaluate('(async()=>{await new Promise(r=>setTimeout(r,300));return true})()')
	assert(
		'JSON.stringify(debugBefore)===JSON.stringify(game.moba.snapshot())',
		'Pause changed simulation state',
	)
	button('step one tick')
	assert(
		'game.moba.sim.tick===debugBefore.t+1 && game.moba.controls.paused',
		'Step did not advance exactly once',
	)
	button('copy link')
	browser('wait', '--fn', 'game.moba.controls.linkStatus!==""')
	assert('game.moba.controls.linkStatus==="Copied"', 'Clipboard did not report success')
	// Assert the actual panel is open and inside the 1440-wide frame.
	assert(
		'(()=>{const el=[...document.querySelectorAll(".lil-gui")].find(el=>el.querySelector(".lil-title")?.textContent==="match controls");const r=el.getBoundingClientRect();return !el.classList.contains("lil-closed") && r.right<=1440 && r.top>=0 && r.bottom<=900})()',
		'Debug controls are closed or outside the frame',
	)
	report.midMatch = evaluate(
		'({tick:game.moba.sim.tick,paused:game.moba.controls.paused,setup:game.moba.setup,minions:game.moba.sim.lane.minions.length})',
	)
	browser('screenshot', `${dir}/debug-1440.png`)
	// Trace live speed changes and resume through the UI.
	for (const speed of [4, 0.25, 1]) {
		browser('find', 'role', 'textbox', 'fill', '--name', 'speed ×', '--exact', String(speed))
		browser('press', 'Tab')
		assert(`game.moba.controls.speed===${speed}`, 'Speed edit did not apply live')
	}
	checkbox()
	assert('!game.moba.controls.paused', 'Resume failed')
	browser('wait', '--fn', `game.moba.sim.tick>${report.midMatch.tick}`)
	report.errors = browser('errors')
	if (report.errors) throw new Error(report.errors)
	writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 2))
	console.log(JSON.stringify(report, null, 2))
} finally {
	browser('close')
}
