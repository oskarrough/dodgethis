// Frozen production build: node scripts/verify-moba-playability.mjs <URL> <shots directory>
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const base = process.argv[2] ?? 'http://127.0.0.1:4802'
const dir = resolve(process.argv[3] ?? '/tmp/playability-shots')
mkdirSync(dir, { recursive: true })
const session = `playability-proof-${process.pid}`
const browser = (...args) =>
	execFileSync('agent-browser', ['--session', session, ...args], {
		encoding: 'utf8',
	}).trim()
const evaluate = (source) => JSON.parse(browser('eval', source))
const key = (code, type = null) =>
	evaluate(
		`(()=>{for(const type of ${JSON.stringify(type ? [type] : ['keydown', 'keyup'])})window.dispatchEvent(new KeyboardEvent(type,{code:'${code}',bubbles:true,cancelable:true}));return true})()`,
	)
function assert(source, label) {
	if (!evaluate(source)) throw new Error(label)
}
function clickButton(label) {
	evaluate(
		`(()=>{const b=[...document.querySelectorAll('.overlay button')].find(b=>b.querySelector('.label').textContent.startsWith('${label}'));if(!b)throw Error('Missing ${label}');b.click();return true})()`,
	)
}
function probe() {
	key('Backquote')
	evaluate('window.probe=window.game;true')
	key('Backquote')
}
function waitForMatch() {
	evaluate(
		'(async()=>{for(let i=0;i<600&&document.querySelector(".moba-front");i++)await new Promise(r=>setTimeout(r,100));return true})()',
	)
}
function play() {
	browser('click', '.front-lock')
	waitForMatch()
	assert('!!probe.moba && !document.querySelector(".moba-front")', 'Loading did not finish')
}
function pad(button) {
	evaluate(
		`(async()=>{const frame=()=>new Promise(requestAnimationFrame);await frame();await frame();mockPad.buttons[${button}].pressed=true;await frame();await frame();mockPad.buttons[${button}].pressed=false;await frame();await frame();return true})()`,
	)
}
const report = { layouts: [] }
for (const [width, height] of [
	[390, 844],
	[1280, 577],
	[1440, 900],
	[2560, 1080],
]) {
	browser('set', 'viewport', String(width), String(height))
	browser('open', `${base}/?mode=moba`)
	browser('wait', '.front-practice')
	probe()
	browser('click', '.front-practice')
	assert('probe.front.preview.phase==="idle"', 'Hero idle is not idle')
	assert(
		`(()=>{const r=s=>document.querySelector(s).getBoundingClientRect();const ready=r('.front-ready'),footer=r('.moba-front footer');return ready.bottom<footer.top&&ready.right<=innerWidth&&ready.top>=0})()`,
		'Hero ready/footer overlap',
	)
	browser('screenshot', `${dir}/hero-${width}.png`)
	browser('click', '.front-numbers')
	assert(
		'document.querySelector(".front-numbers").getAttribute("aria-expanded")==="true"',
		'Numbers closed',
	)
	browser('screenshot', `${dir}/numbers-${width}.png`)
	browser('click', '.front-numbers')
	play()
	key('Escape')
	assert(
		'!document.querySelector(".overlay").hidden&&document.querySelector(".overlay h1").textContent==="PAUSED"',
		'Pause card missing',
	)
	const paused = evaluate(
		'window.pausedSnapshot=JSON.stringify(probe.moba.snapshot());probe.moba.snapshot()',
	)
	browser('wait', '300')
	assert('JSON.stringify(probe.moba.snapshot())===pausedSnapshot', 'Pause changes simulation')
	browser('screenshot', `${dir}/pause-${width}.png`)
	clickButton('Resume')
	// Move by a real right-click on visible ground, then pan away and release.
	evaluate(
		`(()=>{const canvas=document.querySelector('canvas.app');const x=innerWidth*0.63,y=innerHeight*0.6;canvas.dispatchEvent(new PointerEvent('pointermove',{clientX:x,clientY:y,bubbles:true}));canvas.dispatchEvent(new PointerEvent('pointerdown',{button:2,clientX:x,clientY:y,bubbles:true}));window.dispatchEvent(new PointerEvent('pointerup',{button:2,clientX:x,clientY:y,bubbles:true}));return true})()`,
	)
	browser('wait', '250')
	key('ArrowRight', 'keydown')
	browser('wait', '1500')
	key('ArrowRight', 'keyup')
	assert(
		'!!document.querySelector("[data-marker=You]:not([hidden])")',
		'Panned-away hero marker missing',
	)
	browser('screenshot', `${dir}/hero-marker-${width}.png`)
	key('Space')
	key('Escape')
	clickButton('Hero select')
	assert('probe.front.screen==="hero"&&!probe.moba', 'Hero exit leaked match')
	key('Escape')
	key('Escape')
	assert('!document.querySelector(".splash").hidden', 'Back did not reach hub')
	report.layouts.push({ width, height, pausedTick: paused.t })
}
browser('set', 'viewport', '1440', '900')
browser('screenshot', `${dir}/hub.png`)
browser('click', '.hub-mode-entry')
assert('probe.front.screen==="modes"', 'Hub mouse entry failed')
key('Escape')
key('Digit4')
assert('probe.front.screen==="modes"', 'Hub keyboard portal failed')
key('Enter')
assert('probe.front.screen==="hero"', 'Keyboard hero select failed')
for (let i = 0; i < 6; i++) key('Tab')
key('Enter')
waitForMatch()
assert('!!probe.moba&&!document.querySelector(".moba-front")', 'Keyboard lock failed')
key('Escape')
key('ArrowRight')
key('ArrowRight')
key('ArrowRight')
key('Enter')
assert('probe.front.screen==="modes"', 'Keyboard pause Modes failed')
// Physical hub portal, entered by real movement.
key('Escape')
key('KeyW', 'keydown')
evaluate(
	'(async()=>{for(let i=0;i<200&&!document.querySelector(".moba-front");i++)await new Promise(r=>setTimeout(r,100));return true})()',
)
key('KeyW', 'keyup')
assert('probe.front.screen==="modes"', 'Physical hub portal failed')
// Pad-only select, lock, pause, resume and leave.
evaluate(
	'window.mockPad={connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false}))};Object.defineProperty(navigator,"getGamepads",{value:()=>[mockPad],configurable:true});true',
)
pad(0)
assert('probe.front.screen==="hero"', 'Pad hero select failed')
for (let i = 0; i < 6; i++) pad(13)
pad(0)
waitForMatch()
assert('!!probe.moba&&!document.querySelector(".moba-front")', 'Pad lock failed')
pad(9)
assert('!document.querySelector(".overlay").hidden', 'Pad pause failed')
pad(1)
assert('document.querySelector(".overlay").hidden', 'Pad B resume failed')
pad(9)
pad(13)
pad(13)
pad(13)
pad(0)
assert('probe.front.screen==="modes"', 'Pad Modes failed')
report.inputs = ['mouse', 'keyboard', 'pad', 'physical hub portal']
// Genuine seeded play: no injected shots or HP, same camera and fixed-tick loop.
browser('open', `${base}/?mode=moba&debug&bots-only`)
browser('wait', '.front-practice')
evaluate('window.probe=window.game;true')
key('Backquote')
browser('click', '.front-practice')
play()
evaluate('probe.pause(true);true')
for (let i = 0; i < 70 && !evaluate('probe.moba.sim.lane.match.winner'); i++) {
	evaluate('probe.moba.fastForward({ticks:900});true')
	if (i === 12) {
		assert('probe.moba.sim.ball.state&&probe.moba.sim.ball.state.state!=="warning"', 'No live Ball')
		evaluate('probe.moba.focus({x:-36,z:0});probe.moba.fastForward({ticks:1});true')
		assert(
			'!!document.querySelector("[data-marker=Ball]:not([hidden])") || [...document.querySelectorAll("[data-marker=You]:not([hidden])")].some(e=>e.textContent.includes("Ball"))',
			'Off-screen live Ball marker missing',
		)
		browser('screenshot', `${dir}/ball-marker.png`)
	}
}
assert(
	'!!probe.moba.sim.lane.match.winner&&!document.querySelector(".overlay").hidden',
	'Real match did not end',
)
const result = evaluate(
	'({winner:probe.moba.sim.lane.match.winner,tick:probe.moba.sim.tick,title:document.querySelector(".overlay h1").textContent,localTeam:probe.moba.sim.heroes.find(h=>h.id==="local").team})',
)
assert(
	`document.querySelector(".overlay h1").textContent==="${result.winner === result.localTeam ? 'VICTORY' : 'DEFEAT'}"`,
	'Result not relative',
)
evaluate('window.endedSnapshot=JSON.stringify(probe.moba.snapshot());true')
evaluate('probe.moba.fastForward({ticks:120});true')
assert('JSON.stringify(probe.moba.snapshot())===endedSnapshot', 'Ended world moves')
browser('screenshot', `${dir}/result.png`)
clickButton('Again')
assert(
	'probe.moba.sim.tick===0&&probe.moba.sim.shots.length===0&&probe.moba.sim.lane.match.winner===null',
	'Again not clean',
)
key('Escape')
clickButton('Modes')
report.result = result
writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
const errors = JSON.parse(browser('errors', '--json')).data.errors
if (errors.length) throw new Error(JSON.stringify(errors))
browser('close')
