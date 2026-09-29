// Real scripted-vs-idle play through app frames; capture one second after genuine kills.
// node scripts/verify-moba-full-lane.mjs <preview URL> <artifact directory>
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://127.0.0.1:4187'
const dir = resolve(process.argv[3] ?? `${process.env.BB_THREAD_STORAGE}/full-lane-real`)
mkdirSync(dir, { recursive: true })
const browser = (...args) =>
	execFileSync('agent-browser', ['--session', 'lane-real-proof', ...args], {
		encoding: 'utf8',
	}).trim()
const evaluate = (source) => JSON.parse(browser('eval', source))
function key(code, type = 'keydown') {
	return evaluate(
		`window.dispatchEvent(new KeyboardEvent('${type}',{code:'${code}',bubbles:true,cancelable:true}));true`,
	)
}
let config
function advanceTo(target) {
	let state
	do {
		state = evaluate(`probe.moba.fastForward({ticks:probe.moba.proof.batch,target:'${target}'})`)
		if (state.tick * config.step >= config.siegeLimit)
			throw new Error(`No real kill of ${target} before ten minutes`)
	} while (!state.dead)
	return state.tick
}
const report = {}
for (const [width, height] of [
	[390, 844],
	[1440, 900],
	[2560, 1080],
]) {
	browser('set', 'viewport', String(width), String(height))
	browser('open', `${base}/?mode=moba`)
	browser('wait', '.front-practice')
	browser('click', '.front-practice')
	browser('click', '.front-lock')
	browser('wait', '.moba-hud')
	key('Backquote')
	evaluate('window.probe=window.game;true')
	key('Backquote')
	config = evaluate('probe.moba.proof')
	evaluate('probe.pause(true);true') // Hold automatic stepping without a pause overlay.
	advanceTo('tower-A')
	evaluate(
		"probe.moba.focus({x:probe.moba.sim.lane.structures.find(s=>s.id==='fort-A').body.position.x,z:0});probe.moba.fastForward({ticks:Math.round(probe.moba.proof.afterKill/probe.moba.proof.step)});true",
	)
	browser('screenshot', `${dir}/structures-${width}.png`)
	const fortTick = advanceTo('fort-A')
	evaluate(
		"probe.moba.focus({x:probe.moba.sim.lane.structures.find(s=>s.id==='fort-A').body.position.x,z:0});probe.moba.fastForward({ticks:Math.round(probe.moba.proof.afterKill/probe.moba.proof.step)});true",
	)
	const fort = evaluate(
		"({dead:probe.moba.sim.lane.structures.find(s=>s.id==='fort-A').dead,visualDetached:probe.moba.sim.lane.structures.find(s=>s.id==='fort-A').body.visual.parent===null,tick:probe.moba.sim.tick,banner:document.querySelector('.moba-banner').textContent})",
	)
	if (!fort.dead || !fort.visualDetached || fort.tick - fortTick < 60)
		throw new Error('Fort proof is not a settled real death')
	browser('screenshot', `${dir}/fort-fallen-${width}.png`)
	const winTick = advanceTo('core-A')
	evaluate(
		"probe.moba.focus({x:probe.moba.sim.lane.structures.find(s=>s.id==='core-A').body.position.x,z:0});probe.moba.fastForward({ticks:Math.round(probe.moba.proof.afterKill/probe.moba.proof.step)});true",
	)
	const win = evaluate(
		"({winner:probe.moba.sim.lane.match.winner,tick:probe.moba.sim.tick,banner:document.querySelector('.moba-banner').textContent,fov:probe.camera.fov,ghosts:probe.moba.sim.lane.structures.filter(s=>s.dead).some(s=>s.body.visual.parent!==null)})",
	)
	if (win.winner !== 'B' || win.ghosts || win.fov < 20 || win.fov > 70 || win.tick !== winTick)
		throw new Error('Invalid real-play win')
	browser('screenshot', `${dir}/win-${width}.png`)
	report[width] = {
		fortKillSeconds: fortTick / 60,
		winSeconds: winTick / 60,
		secondsOfPresentationAfterKill: 1,
		fort,
		win,
		errors: browser('errors'),
	}
	key('KeyR')
	browser('wait', '--fn', '!probe.moba.sim.lane.match.winner')
	report[width].restart = evaluate('probe.moba.sim.lane.structures.every(s=>!s.dead)')
	writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 2))
}
writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
browser('close')
