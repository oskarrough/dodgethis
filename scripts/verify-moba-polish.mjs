// Frozen-build proof: node scripts/verify-moba-polish.mjs <URL> <artifact directory>
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://127.0.0.1:4868'
const dir = resolve(process.argv[3] ?? '/tmp/moba-polish-proof')
mkdirSync(dir, { recursive: true })
const session = `moba-polish-${process.pid}`
const browser = (...args) =>
	execFileSync('agent-browser', ['--session', session, ...args], { encoding: 'utf8' }).trim()
const evaluate = (source) => JSON.parse(browser('eval', source))
const assert = (source, message) => {
	if (!evaluate(source)) throw new Error(message)
}
const key = (code, types = ['keydown', 'keyup']) =>
	evaluate(
		`(()=>{for(const type of ${JSON.stringify(types)})window.dispatchEvent(new KeyboardEvent(type,{code:'${code}',bubbles:true,cancelable:true}));return true})()`,
	)
const hero = "g.moba.sim.heroes.find(h=>h.id==='local')"
const report = {
	method:
		'Frozen production build. Each play flow starts at fresh /. Human seat receives projected RMB orders and synthetic stop/pan keys. Ordinary app-loop fast-forward; no injected damage, teleports or bots-only control. Try Mode roster edits use its visible controls.',
	frames: [],
}
function start(width, height, difficulty = 'normal') {
	browser('set', 'viewport', String(width), String(height))
	browser('open', `${base}/`)
	browser('wait', '.front-modes [data-mode="moba"]')
	assert('location.search===""', 'Fresh / acquired default params')
	browser('click', '.front-modes [data-mode="moba"]')
	assert('location.search==="?mode=moba"', 'Unpicked difficulty or hero entered the URL')
	browser('click', `.front-difficulty [data-difficulty="${difficulty}"]`)
	assert(
		`new URLSearchParams(location.search).get('bots')==='${difficulty}'&&!new URLSearchParams(location.search).has('hero')`,
		'Difficulty selection wrote an unpicked hero',
	)
	browser('click', '.front-lock')
	browser(
		'wait',
		'--fn',
		'!!document.querySelector(".moba-onboarding")&&!document.querySelector(".moba-front")',
	)
	key('Backquote')
	browser('wait', '--fn', '!!window.game?.moba')
	evaluate('window.g=game;g.moba.controls.paused=true;true')
	assert(
		"new URLSearchParams(location.search).get('hero')==='fletcher'",
		'Lock did not write the picked hero',
	)
}
function mouseOrder(dx, z = -3) {
	return evaluate(`(()=>{
		const h=${hero},p=h.body.position.clone();let distance=${dx};
		for(let i=0;i<8;i++){p.copy(h.body.position);p.x+=distance;p.z=${z};p.y=0;p.project(g.camera);if(Math.abs(p.x)<0.7&&Math.abs(p.y)<0.7)break;distance/=2;}
		if(Math.abs(p.x)>=1||Math.abs(p.y)>=1)throw new Error('Order is outside the real camera');
		const at={clientX:(p.x+1)*innerWidth/2,clientY:(1-p.y)*innerHeight/2,button:2,bubbles:true};
		window.dispatchEvent(new PointerEvent('pointermove',{...at,pointerType:'mouse'}));
		document.querySelector('.app').dispatchEvent(new MouseEvent('mousedown',at));
		window.dispatchEvent(new MouseEvent('mouseup',at));
		g.moba.fastForward({ticks:1});
		window.dispatchEvent(new PointerEvent('pointermove',{clientX:innerWidth/2,clientY:innerHeight/2,pointerType:'mouse',bubbles:true}));
		g.moba.fastForward({ticks:179});return {x:h.body.position.x,z:h.body.position.z,dead:h.dead};
	})()`)
}
function shot(name) {
	// A suspended pointer cannot leave an edge pan for the next frame.
	evaluate('g.moba.controls.paused=true;true')
	browser('mouse', 'move', '1', '1')
	key('Backquote')
	assert('!document.querySelector(".moba-front")', 'Screenshot caught loading')
	browser('screenshot', `${dir}/${name}.png`)
	key('Backquote')
}
function waitForDeath() {
	key('KeyS')
	for (let i = 0; i < 120; i++) {
		if (evaluate(`${hero}.dead`)) {
			evaluate('g.moba.controls.paused=true;true')
			assert('!document.querySelector(".moba-death").hidden', 'Death card missing')
			assert(
				'!document.querySelector(".moba-death").innerText.includes("Unknown")',
				'Unnamed source in death card',
			)
			return evaluate('document.querySelector(".moba-death").innerText')
		}
		evaluate('g.moba.fastForward({ticks:120});true')
	}
	throw new Error('Human did not die through real combat')
}
function folderAction(folder, action) {
	evaluate(
		`(()=>{const root=[...document.querySelectorAll('.lil-title')].find(e=>e.textContent==='${folder}').parentElement;const button=[...root.querySelectorAll('.lil-function button')].find(e=>e.textContent==='${action}');button.click();return true})()`,
	)
}
try {
	for (const [width, height] of [
		[390, 844],
		[1440, 900],
		[2560, 1080],
	]) {
		start(width, height)
		assert(
			`(()=>{const h=${hero},p=h.body.mesh.position.clone().project(g.camera);return Math.abs(p.x)<0.05&&Math.abs(p.y)<0.2&&g.camera.fov>35})()`,
			'Opening is zoomed or not framed on the local hero',
		)
		report.frames.push(
			evaluate(
				`({width:innerWidth,height:innerHeight,fov:g.camera.fov,tick:g.moba.sim.tick,hero:${hero}.body.position,camera:g.camera.position})`,
			),
		)
		shot(`opening-${width}`)
		evaluate('g.moba.controls.paused=false;true')
		const moved = mouseOrder(8)
		assert(
			`Math.abs(g.camera.position.x-${hero}.body.mesh.position.x)<0.05&&g.camera.fov>35`,
			'Hero drifted before a manual pan',
		)
		if (moved.x < -47)
			throw new Error(`Human mouse order did not move: ${JSON.stringify({ width, moved })}`)
		evaluate(
			`(()=>{window.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowRight',bubbles:true,cancelable:true}));g.moba.fastForward({ticks:6});window.dispatchEvent(new KeyboardEvent('keyup',{code:'ArrowRight',bubbles:true,cancelable:true}));return true})()`,
		)
		assert(`g.camera.position.x>${hero}.body.mesh.position.x+1`, 'Manual pan did not detach')
		const panned = evaluate('g.camera.position.x')
		mouseOrder(5)
		assert(
			`Math.abs(g.camera.position.x-(${panned}))<0.05`,
			'Detached camera resumed follow on its own',
		)
		const centered = evaluate(
			`(()=>{document.body.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',bubbles:true,cancelable:true}));g.moba.fastForward({ticks:1});const error=Math.abs(g.camera.position.x-${hero}.body.mesh.position.x);document.body.dispatchEvent(new KeyboardEvent('keyup',{code:'Space',bubbles:true,cancelable:true}));return {error,camera:g.camera.position.x,hero:${hero}.body.mesh.position.x,paused:g.moba.controls.paused}})()`,
		)
		if (centered.error >= 0.05)
			throw new Error(`Space did not recenter: ${JSON.stringify(centered)}`)
		report.frames.at(-1).humanOrder = moved
		report.frames.at(-1).panAndRecenter = true
		for (const codes of [
			['ArrowLeft', 'ArrowUp'],
			['ArrowRight', 'ArrowDown'],
		]) {
			const bounded = evaluate(
				`(()=>{const codes=${JSON.stringify(codes)};for(const code of codes)document.body.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true,cancelable:true}));g.moba.fastForward({ticks:360});for(const code of codes)document.body.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true,cancelable:true}));const at=g.camera.position.clone(),dir=at.clone();g.camera.getWorldDirection(dir);at.addScaledVector(dir,-at.y/dir.y);const floor=g.scene.getObjectByName('moba-map').children[0].geometry.parameters;return Math.abs(at.x)<=floor.width/2&&Math.abs(at.z)<=floor.depth/2})()`,
			)
			if (!bounded) throw new Error('Manual camera pan escaped the map')
		}
		report.frames.at(-1).mapClamps = true
		if (browser('errors')) throw new Error(browser('errors'))
	}
	// Ordinary practice bots, without modifying the roster or combat stats.
	start(1440, 900)
	evaluate('g.moba.controls.paused=false;true')
	for (let i = 0; i < 6; i++) mouseOrder(8)
	report.practiceDeath = waitForDeath()
	if (!report.practiceDeath.startsWith('Killed by Fletcher bot'))
		throw new Error('Practice proof did not capture a real bot kill')
	shot('practice-bot-death')

	// A spawned enemy bot in Try Mode, still dealing ordinary kit damage.
	start(1440, 900)
	folderAction('Allied heroes', 'clear heroes')
	folderAction('Enemy heroes', 'clear heroes')
	browser('find', 'role', 'checkbox', 'click', '--name', 'minion waves', '--exact')
	evaluate('g.moba.controls.paused=false;true')
	for (let i = 0; i < 6; i++) mouseOrder(8)
	key('KeyS')
	evaluate(
		`(()=>{const root=[...document.querySelectorAll('.lil-title')].find(e=>e.textContent==='Enemy heroes').parentElement;const select=root.querySelector('select');select.value='Mitts';select.dispatchEvent(new Event('change',{bubbles:true}));root.querySelector('input[type=checkbox]').click();return true})()`,
	)
	folderAction('Enemy heroes', 'spawn hero')
	assert(
		'g.moba.sim.heroes.some(h=>h.id.startsWith("try-")&&h.heroId==="mitts")',
		'Try Mode did not spawn Mitts',
	)
	report.tryDeath = waitForDeath()
	if (!report.tryDeath.startsWith('Killed by Mitts bot'))
		throw new Error('Try proof did not capture the spawned bot kill')
	shot('try-bot-death')
	report.errors = browser('errors')
	if (report.errors) throw new Error(report.errors)

	// A provided selection remains provided, including through Back.
	browser('open', `${base}/?hero=mitts&bots=hard`)
	browser('wait', '.front-modes [data-mode="moba"]')
	assert(
		'new URLSearchParams(location.search).get("hero")==="mitts"&&new URLSearchParams(location.search).get("bots")==="hard"',
		'Incoming selections were lost',
	)
	browser('click', '.front-modes [data-mode="moba"]')
	browser('click', '.front-return')
	assert(
		'new URLSearchParams(location.search).get("hero")==="mitts"&&new URLSearchParams(location.search).get("bots")==="hard"',
		'Back lost incoming selections',
	)
	report.incomingLink = true
	writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 2))
	console.log(JSON.stringify(report, null, 2))
} finally {
	browser('close')
}
