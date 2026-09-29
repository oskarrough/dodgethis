// Staged siege proof using the production damage pipeline, not a hand-painted win.
// node scripts/verify-moba-full-lane.mjs <preview URL> <artifact directory>
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://127.0.0.1:4187'
const dir = resolve(process.argv[3] ?? `${process.env.BB_THREAD_STORAGE}/full-lane`)
mkdirSync(dir, { recursive: true })
const browser = (...args) =>
	execFileSync('agent-browser', ['--session', 'lane-slice3-proof', ...args], {
		encoding: 'utf8',
	}).trim()
const evaluate = (source) => JSON.parse(browser('eval', source))
function key(code, type = 'keydown') {
	return evaluate(
		`window.dispatchEvent(new KeyboardEvent('${type}',{code:'${code}',bubbles:true,cancelable:true}));true`,
	)
}
function boot(width, height) {
	browser('set', 'viewport', String(width), String(height))
	browser('open', `${base}/?mode=moba`)
	browser('wait', '.front-practice')
	browser('click', '.front-practice')
	browser('click', '.front-lock')
	browser('wait', '.moba-hud')
	key('Backquote')
	evaluate('window.probe=window.game; window.sim=probe.moba.sim; true')
	key('Backquote')
	evaluate(
		`window.strike=(kind)=>{const u=sim.lane.structures.find(s=>s.team==='B'&&s.kind===kind);sim.shots.push({id:900000+sim.tick,owner:sim.heroes[0].id,team:'A',slot:'primary',target:u.id,x:u.body.position.x,z:u.body.position.z,dx:1,dz:0,speed:24,radius:0.12,range:200,travelled:0,passed:[],damage:u.hp});sim.step();return u.dead};sim.heroes[0].body.place(25,1.05,4);true`,
	)
	browser('wait', '400')
}
const report = {}
for (const [width, height] of [
	[390, 844],
	[1440, 900],
	[2560, 1080],
]) {
	boot(width, height)
	if (!evaluate("strike('tower')")) throw new Error('Tower survived the fixture')
	browser('wait', '150')
	report[width] = {
		fortUnlocked: evaluate("sim.lane.vulnerable(sim.lane.structures.find(s=>s.id==='fort-B'))"),
	}
	// Sweep the pointer and reverse a pan before the siege, not just an idle pose.
	browser('mouse', 'move', '100', '200')
	browser('mouse', 'move', String(width - 100), '300')
	key('ArrowRight')
	browser('wait', '150')
	key('ArrowRight', 'keyup')
	key('ArrowLeft')
	browser('wait', '150')
	key('ArrowLeft', 'keyup')
	key('Space')
	browser('wait', '100')
	key('Space', 'keyup')
	if (!evaluate("strike('fort')")) throw new Error('Fort survived the fixture')
	browser('wait', '150')
	browser('screenshot', `${dir}/fort-falling-${width}.png`)
	evaluate('sim.heroes[0].body.place(35,1.05,4);true')
	key('Space')
	browser('wait', '200')
	key('Space', 'keyup')
	if (!evaluate("strike('core')")) throw new Error('Core survived the fixture')
	browser('wait', '--fn', 'document.querySelector(".moba-banner").textContent.includes("wins")')
	browser('screenshot', `${dir}/win-${width}.png`)
	report[width].cameraFov = evaluate('probe.camera.fov')
	if (!(report[width].cameraFov >= 20 && report[width].cameraFov <= 70))
		throw new Error('Unstable FOV spring')
	report[width].winner = evaluate('sim.lane.match.winner')
	report[width].banner = evaluate('document.querySelector(".moba-banner").textContent')
	key('KeyR')
	browser('wait', '--fn', '!probe.moba.sim.lane.match.winner')
	report[width].keyboardRestart = evaluate(
		'probe.moba.sim.tick < 120 && probe.moba.sim.lane.structures.every(s=>!s.dead)',
	)
	if (width === 2560) {
		evaluate("window.sim=probe.moba.sim;strike('tower');strike('fort');strike('core');true")
		browser('wait', '--fn', '!!probe.moba.sim.lane.match.winner')
		evaluate(
			"window.mockPad={connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false}))};Object.defineProperty(navigator,'getGamepads',{value:()=>[mockPad],configurable:true});true",
		)
		browser('wait', '200')
		evaluate('mockPad.buttons[9].pressed=true;true')
		browser('wait', '--fn', '!probe.moba.sim.lane.match.winner')
		evaluate('mockPad.buttons[9].pressed=false;true')
		report[width].padRestart = evaluate('probe.moba.sim.lane.structures.every(s=>!s.dead)')
	}
	report[width].errors = browser('errors')
}
writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
browser('close')
