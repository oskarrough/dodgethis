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
// A failed run must not leave its browser behind.
process.on('exit', () => {
	try {
		browser('close')
	} catch {}
})
const evaluate = (source) => JSON.parse(browser('eval', source))
// window.dt (src/core/proof.js) drives keys, the pad and screen names.
const key = (code) => evaluate(`dt.key('${code}')`)
const pad = (button) => evaluate(`dt.pad.press('${button}')`)
function assert(source, label) {
	if (!evaluate(source)) throw new Error(label)
}
function clickButton(label) {
	evaluate(
		`(()=>{const b=[...document.querySelectorAll('.overlay button')].find(b=>b.querySelector('.label').textContent.startsWith('${label}'));if(!b)throw Error('Missing ${label}');b.click();return true})()`,
	)
}
// A production build shows window.dt after one Backquote; it stays when the HUD hides again.
function reveal() {
	evaluate(
		"for(const type of ['keydown','keyup','keydown','keyup'])window.dispatchEvent(new KeyboardEvent(type,{code:'Backquote'}));true",
	)
}
const waitForMatch = () => browser('wait', '--timeout', '60000', '--fn', 'dt.screen()==="match"')
// The plaza flow: H swaps hero, G shoots the next difficulty, Enter walks to the box; the
// crane and descent take no input, so waiting is the only move left.
function play() {
	key('KeyH')
	key('KeyG')
	key('Enter')
	waitForMatch()
	assert('!document.querySelector(".moba-front")', 'Crane did not land in the match')
	assert('document.querySelector(".splash").hidden', 'Dodgeball splash leaked into the match')
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
	browser('wait', '.front-lobby')
	reveal()
	assert('dt.screen()==="plaza"', 'MOBA entry did not open the plaza')
	assert('dt.game.lobby.setup.difficulty==="easy"', 'Practice did not default to easy')
	assert(
		'!document.querySelector(".front-ready,.front-hero-row,.front-practice")',
		'Plaza kept a removed control',
	)
	assert(
		`(()=>{const r=s=>document.querySelector(s).getBoundingClientRect();const strip=r('.lobby-hero-strip'),back=r('.front-return');return strip.left>=0&&strip.bottom<=innerHeight&&strip.right<=innerWidth&&back.top>=0&&back.left>=0})()`,
		'Hero strip or back arrow left the frame',
	)
	browser('screenshot', `${dir}/plaza-${width}.png`)
	if (width === 1440) {
		key('KeyN')
		assert('dt.game.lobby.numbers.open', 'Numbers closed')
		browser('screenshot', `${dir}/numbers-${width}.png`)
		key('KeyN')
		assert('!dt.game.lobby.numbers.open', 'Numbers stayed open')
	}
	if (width !== 1440) {
		report.layouts.push({ width, height })
		continue
	}
	play()
	assert('dt.game.moba.sim.heroes.find(h=>h.id==="local").heroId==="mitts"', 'H did not pick Mitts')
	key('Escape')
	assert(
		'document.querySelector(".overlay button.selected .label").textContent==="Resume"',
		'Pause selected a destructive action under the cursor',
	)
	evaluate(
		'document.querySelector(".overlay button:nth-child(3)").dispatchEvent(new PointerEvent("pointerenter"));true',
	)
	key('Space')
	assert(
		'!document.querySelector(".overlay").hidden&&document.querySelector(".overlay button.selected .label").textContent==="Resume"',
		'Space or passive hover changed the pause selection',
	)
	assert(
		'!document.querySelector(".overlay").hidden&&document.querySelector(".overlay h1").textContent==="PAUSED"',
		'Pause card missing',
	)
	const paused = evaluate(
		'window.pausedSnapshot=JSON.stringify(dt.game.moba.snapshot());dt.game.moba.snapshot()',
	)
	browser('wait', '300')
	assert('JSON.stringify(dt.game.moba.snapshot())===pausedSnapshot', 'Pause changes simulation')
	browser('screenshot', `${dir}/pause-${width}.png`)
	clickButton('Resume')
	// Move by a real right-click on visible ground, then pan away and release.
	evaluate(
		`(()=>{const canvas=document.querySelector('canvas.app');const x=innerWidth*0.63,y=innerHeight*0.6;canvas.dispatchEvent(new PointerEvent('pointermove',{clientX:x,clientY:y,bubbles:true}));canvas.dispatchEvent(new PointerEvent('pointerdown',{button:2,clientX:x,clientY:y,bubbles:true}));window.dispatchEvent(new PointerEvent('pointerup',{button:2,clientX:x,clientY:y,bubbles:true}));return true})()`,
	)
	browser('wait', '250')
	evaluate("dt.key('ArrowRight',{hold:1500})")
	assert(
		'!!document.querySelector("[data-marker=You]:not([hidden])")',
		'Panned-away hero marker missing',
	)
	browser('screenshot', `${dir}/hero-marker-${width}.png`)
	key('Space')
	key('Escape')
	clickButton('Hero select')
	browser('wait', '.front-lobby')
	assert('dt.screen()==="plaza"', 'Hero select leaked the match')
	assert('dt.game.lobby.setup.heroId==="mitts"', 'Hero select lost the pick')
	// Esc hands the same backdrop back to the splash; Esc there only shakes the tiles.
	evaluate('window.plazaBackdrop=document.querySelector(".front-backdrop");true')
	key('Escape')
	browser('wait', '.front-tile')
	assert('dt.screen()==="splash"', 'Esc did not reach the splash')
	assert('document.querySelector(".front-backdrop")===plazaBackdrop', 'The backdrop was rebuilt')
	key('Escape')
	assert('!!document.querySelector(".front-tile")', 'Esc left the splash')
	report.layouts.push({ width, height, pausedTick: paused.t })
}
browser('set', 'viewport', '1440', '900')
browser('open', base)
browser('wait', '.front-tile')
reveal()
assert('dt.screen()==="splash"', 'Fresh load did not open the splash')
browser('screenshot', `${dir}/splash.png`)
// Mouse: the MOBA tile opens the plaza; Esc comes back; Enter on a tile opens it.
browser('click', '.front-tile[data-mode=moba]')
browser('wait', '.front-lobby')
assert('dt.screen()==="plaza"', 'Mouse MOBA tile failed')
key('Escape')
browser('wait', '.front-tile')
// Back from the plaza the MOBA tile is already in hand.
key('Escape')
key('Enter')
browser('wait', '.front-lobby')
assert('dt.screen()==="plaza"', 'Keyboard MOBA tile failed')
play()
key('Escape')
key('ArrowRight')
key('ArrowRight')
key('ArrowRight')
key('Enter')
assert('dt.screen()==="splash"', 'Keyboard pause Modes failed')
// The Dodgeball tile opens the Dodgeball hub, Esc there returns to the splash, and holding W
// walks into a Dodgeball portal, not the MOBA.
browser('click', '.front-tile[data-mode=dodgeball]')
browser('wait', '.splash:not([hidden])')
assert('dt.game.phase==="menu"&&!dt.game.moba', 'The Dodgeball tile did not open the hub')
key('Escape')
browser('wait', '.front-tile')
browser('click', '.front-tile[data-mode=dodgeball]')
browser('wait', '.splash:not([hidden])')
evaluate("dt.key('KeyW',{until:()=>dt.game.phase==='playing'})")
assert('!dt.game.moba', 'MOBA stole the Dodgeball portal')
browser('open', base)
browser('wait', '.front-tile')
reveal()
// Pad-only: right to the MOBA tile, A, then d-pad up/down and Start in the plaza.
pad('right')
pad('a')
browser('wait', '.front-lobby')
assert('dt.screen()==="plaza"', 'Pad MOBA tile failed')
// Up on the d-pad swaps hero, down shoots the next difficulty, Start fills the box.
pad('up')
pad('down')
pad('start')
waitForMatch()
assert('!document.querySelector(".moba-front")', 'Pad flow did not reach the match')
// The crane took no input, so the match starts unpaused.
assert('document.querySelector(".overlay").hidden', 'A queued Start paused the match')
pad('start')
assert('dt.screen()==="paused"', 'Pad pause failed')
pad('b')
assert('dt.screen()==="match"', 'Pad B resume failed')
pad('start')
pad('down')
pad('down')
pad('down')
pad('a')
assert('dt.screen()==="splash"', 'Pad Modes failed')
report.inputs = ['mouse', 'keyboard', 'pad']
// The shortcut cuts straight into the match: no splash, plaza or crane.
browser('open', `${base}/?mode=moba&play&hero=mitts&bots=hard`)
browser('wait', '.moba-forts')
reveal()
assert(
	'dt.screen()==="match"&&!document.querySelector(".moba-front")&&dt.game.moba.sim.heroes.find(h=>h.id==="local").heroId==="mitts"',
	'play did not cut into the match',
)
// Genuine seeded play: no injected shots or HP, same camera and fixed-tick loop.
browser('open', `${base}/?mode=moba&debug&bots-only&bots=normal`)
browser('wait', '.front-lobby')
key('Backquote')
key('Enter')
waitForMatch()
assert('!document.querySelector(".moba-front")', 'Crane did not land in the match')
evaluate('dt.game.pause(true);true')
let checkedBall = false
for (let i = 0; i < 100 && !evaluate('dt.game.moba.sim.lane.match.winner'); i++) {
	evaluate('dt.game.moba.fastForward({ticks:900});true')
	// The Ball's spawn time varies with how the match starts, so check the first live one.
	if (
		!checkedBall &&
		evaluate('!!dt.game.moba.sim.ball.state&&dt.game.moba.sim.ball.state.state!=="warning"')
	) {
		checkedBall = true
		evaluate('dt.game.moba.focus({x:-36,z:0});dt.game.moba.fastForward({ticks:1});true')
		assert(
			'!!document.querySelector(".moba-ball-pointer:not([hidden])")||[...document.querySelectorAll("[data-marker=You]:not([hidden])")].some(e=>e.textContent.includes("Ball"))',
			'Off-screen live Ball marker missing',
		)
		browser('screenshot', `${dir}/ball-marker.png`)
	}
}
assert(String(checkedBall), 'No live Ball')
// Advance only presentation after the winning tick, including slow software renderers.
assert('!!dt.game.moba.sim.lane.match.winner', 'Seeded six-bot match did not finish')
evaluate('dt.game.moba.fastForward({ticks:120});true')
assert(
	'!!dt.game.moba.sim.lane.match.winner&&!document.querySelector(".overlay").hidden',
	'Real match did not end',
)
const result = evaluate(
	'({winner:dt.game.moba.sim.lane.match.winner,tick:dt.game.moba.sim.tick,title:document.querySelector(".overlay h1").textContent,localTeam:dt.game.moba.sim.heroes.find(h=>h.id==="local").team})',
)
assert(
	`document.querySelector(".overlay h1").textContent==="${result.winner === result.localTeam ? 'VICTORY' : 'DEFEAT'}"`,
	'Result not relative',
)
evaluate('window.endedSnapshot=JSON.stringify(dt.game.moba.snapshot());true')
evaluate('dt.game.moba.fastForward({ticks:120});true')
assert('JSON.stringify(dt.game.moba.snapshot())===endedSnapshot', 'Ended world moves')
browser('screenshot', `${dir}/result.png`)
clickButton('Again')
assert(
	'dt.game.moba.sim.tick<60&&dt.game.moba.sim.shots.length===0&&dt.game.moba.sim.lane.match.winner===null',
	'Again not clean',
)
key('Escape')
clickButton('Modes')
report.result = { ...result, players: 'six bots, not a human win' }
writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
const errors = JSON.parse(browser('errors', '--json')).data.errors
if (errors.length) throw new Error(JSON.stringify(errors))
browser('close')
