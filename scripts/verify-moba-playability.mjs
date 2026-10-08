// Production browser proof: bun run verify:browser <URL> <shots directory>
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

if (process.argv.includes('--help')) {
	console.log(
		'bun run verify:browser <preview URL> <shots directory>\nChecks a real MOBA entry, layouts, movement, pause/resume, Dodgeball entry and a seeded bot result/restart. Saves screenshots and stage timings. Requires agent-browser.',
	)
	process.exit(0)
}
const base = process.argv[2] ?? 'http://127.0.0.1:4802'
const dir = resolve(process.argv[3] ?? '/tmp/playability-shots')
mkdirSync(dir, { recursive: true })
const session = `playability-proof-${process.pid}`
// Keep the browser socket inside writable temporary storage, including agent sandboxes.
const runtime = mkdtempSync(join(tmpdir(), 'dodgethis-browser-'))
const browserEnv = { ...process.env, XDG_RUNTIME_DIR: runtime }
const started = performance.now()
const report = { passed: false, stages: [], layouts: [], commands: 0 }
let stage = 'Startup'
const browser = (...args) => {
	report.commands++
	const remaining = 90000 - (performance.now() - started)
	if (args[0] !== 'close' && remaining <= 0)
		throw new Error('Browser proof exceeded its 90-second budget')
	return execFileSync('agent-browser', ['--session', session, ...args], {
		encoding: 'utf8',
		env: browserEnv,
		timeout: args[0] === 'close' ? 5000 : Math.max(1, Math.floor(Math.min(45000, remaining))),
	}).trim()
}
const evaluate = (source) => JSON.parse(browser('eval', `(async()=>{${source}})()`))
function timed(name, run) {
	stage = name
	const start = performance.now()
	try {
		return run()
	} finally {
		const seconds = Number(((performance.now() - start) / 1000).toFixed(2))
		report.stages.push({ name, seconds })
		console.log(`${name}: ${seconds}s`)
	}
}
function errors() {
	const errors = JSON.parse(browser('errors', '--json')).data.errors
	if (errors.length) throw new Error(JSON.stringify(errors))
}
// Install assertions beside dt once per document; batched calls still await every input edge.
function helpers() {
	evaluate(`
		for (const type of ['keydown','keyup','keydown','keyup'])
			window.dispatchEvent(new KeyboardEvent(type,{code:'Backquote'}));
		window.proof = {
			assert(ok, message) { if (!ok) throw Error(message) },
			frame: () => new Promise(requestAnimationFrame),
			local: () => dt.game.moba.sim.heroes.find(h=>h.id==='local'),
			button(label) {
				const b=[...document.querySelectorAll('.overlay button')].find(b=>b.querySelector('.label').textContent.startsWith(label));
				if (!b) throw Error('Missing '+label);
				b.click();
			}
		};
		proof.assert(!!window.dt,'Missing proof API');
		return true;
	`)
}
function shot(name) {
	// Keep hover out of evidence; the caller has already asserted the claimed screen.
	browser('mouse', 'move', '0', '0')
	browser('screenshot', `${dir}/${name}.png`)
}

try {
	timed('Splash and lobby', () => {
		browser('set', 'viewport', '1440', '900')
		browser('open', base)
		browser('wait', '.front-tile')
		helpers()
		evaluate(`proof.assert(dt.screen()==='splash','Fresh / did not open the splash'); return true;`)
		shot('splash')
		browser('click', '.front-tile[data-mode=moba]')
		browser('wait', '.front-lobby')
		evaluate(`
			proof.assert(dt.screen()==='lobby','Mouse MOBA tile failed');
			proof.assert(dt.game.lobby.setup.difficulty==='easy','Practice did not default to easy');
			proof.assert(!document.querySelector('.front-ready,.front-hero-row,.front-practice'),'Removed lobby controls returned');
			return true;
		`)
	})
	timed('Lobby layouts', () => {
		for (const [width, height] of [
			[390, 844],
			[1280, 577],
			[1440, 900],
			[2560, 1080],
		]) {
			browser('set', 'viewport', String(width), String(height))
			evaluate(`
				await proof.frame(); await proof.frame();
				proof.assert(dt.screen()==='lobby','Resize left the lobby');
				const r=s=>document.querySelector(s).getBoundingClientRect();
				const strip=r('.lobby-hero-strip'),back=r('.back-button');
				proof.assert(strip.left>=0&&strip.bottom<=innerHeight&&strip.right<=innerWidth&&back.top>=0&&back.left>=0,'Lobby controls left the frame');
				return true;
			`)
			shot(`lobby-${width}`)
			report.layouts.push({ width, height })
		}
		browser('set', 'viewport', '1440', '900')
		evaluate(`
			await dt.key('KeyN'); proof.assert(dt.game.lobby.numbers.open,'Numbers did not open');
			await dt.key('KeyN'); proof.assert(!dt.game.lobby.numbers.open,'Numbers did not close');
			await dt.key('KeyH'); await dt.key('KeyG');
			proof.assert(dt.game.lobby.setup.heroId==='mitts','H did not pick Mitts');
			return true;
		`)
		browser('wait', '--timeout', '5000', '--fn', 'dt.game.lobby.setup.difficulty==="normal"')
	})
	timed('Real loading journey', () => {
		evaluate(`await dt.pad.press('start'); return true;`)
		browser('wait', '--timeout', '20000', '--fn', 'dt.screen()==="match"')
		evaluate(`
			proof.assert(!document.querySelector('.moba-front'),'Loading did not finish');
			proof.assert(document.querySelector('.splash').hidden,'Dodgeball splash leaked into MOBA');
			proof.assert(document.querySelector('.overlay').hidden,'Queued Start paused the match');
			proof.assert(proof.local().heroId==='mitts','Match lost the chosen hero');
			return true;
		`)
	})
	timed('Movement and pause controls', () => {
		evaluate(`
			window.movementOrigin={...proof.local().body.position};
			const canvas=document.querySelector('canvas.app'),x=innerWidth*.63,y=innerHeight*.6;
			canvas.dispatchEvent(new PointerEvent('pointermove',{clientX:x,clientY:y,bubbles:true}));
			canvas.dispatchEvent(new MouseEvent('mousedown',{button:2,clientX:x,clientY:y,bubbles:true}));
			window.dispatchEvent(new MouseEvent('mouseup',{button:2,clientX:x,clientY:y,bubbles:true}));
			return true;
		`)
		browser(
			'wait',
			'--timeout',
			'5000',
			'--fn',
			'Math.hypot(proof.local().body.position.x-movementOrigin.x,proof.local().body.position.z-movementOrigin.z)>.25',
		)
		evaluate(`
			await dt.key('Escape'); proof.assert(dt.screen()==='paused','Keyboard pause failed');
			proof.assert(document.querySelector('.overlay button.selected .label').textContent==='Resume','Pause selected a destructive action');
			document.querySelector('.overlay button:nth-child(3)').dispatchEvent(new PointerEvent('pointerenter'));
			await dt.key('Space');
			proof.assert(dt.screen()==='paused'&&document.querySelector('.overlay button.selected .label').textContent==='Resume','Space or passive hover changed pause selection');
			const snapshot=JSON.stringify(dt.game.moba.snapshot());
			await proof.frame(); await proof.frame();
			proof.assert(JSON.stringify(dt.game.moba.snapshot())===snapshot,'Paused world changes');
			proof.button('Resume'); await proof.frame();
			proof.assert(dt.screen()==='match','Mouse resume failed');
			window.resumedTick=dt.game.moba.sim.tick;
			return true;
		`)
		browser('wait', '--timeout', '5000', '--fn', 'dt.game.moba.sim.tick>resumedTick')
		evaluate(`
			await dt.pad.press('start'); proof.assert(dt.screen()==='paused','Pad pause failed');
			await dt.pad.press('b'); proof.assert(dt.screen()==='match','Pad B resume failed');
			await dt.key('Escape'); return true;
		`)
		shot('pause')
		evaluate(`
			proof.button('Restart'); await proof.frame();
			proof.assert(dt.screen()==='match'&&dt.game.moba.sim.tick<60,'Restart did not start a fresh match');
			await dt.key('Escape'); proof.button('Hero select'); return true;
		`)
		browser('wait', '.front-lobby')
		evaluate(`
			proof.assert(dt.screen()==='lobby'&&dt.game.lobby.setup.heroId==='mitts','Hero select lost the pick');
			await dt.key('Escape'); proof.assert(dt.screen()==='splash','Esc did not return to splash');
			return true;
		`)
	})
	timed('Dodgeball portal', () => {
		browser('click', '.front-tile[data-mode=dodgeball]')
		browser('wait', '.splash:not([hidden])')
		evaluate(`
			proof.assert(dt.game.phase==='menu'&&!dt.game.moba,'Dodgeball tile did not open its hub');
			await dt.key('KeyW',{until:()=>dt.game.phase==='playing'});
			proof.assert(!dt.game.moba&&dt.game.phase==='playing','Dodgeball portal entered the wrong mode');
			return true;
		`)
		errors()
	})
	timed('Seeded bot match and result', () => {
		browser('open', `${base}/?mode=moba&play&debug&bots-only&bots=normal&seed=2`)
		browser('wait', '.moba-forts')
		helpers()
		report.match = evaluate(`
			proof.assert(dt.screen()==='match'&&!document.querySelector('.moba-front'),'Direct play did not enter match');
			proof.assert(dt.game.moba.setup.seed===2&&dt.game.moba.proof.botsOnly,'Completion proof is not seeded bots-only');
			proof.assert(dt.game.moba.sim.heroes.length===6,'Completion roster is not six heroes');
			dt.game.pause(true);
			return {seed:dt.game.moba.setup.seed,difficulty:dt.game.moba.setup.difficulty,players:'six bots; accelerated app frames',roster:dt.game.moba.sim.heroes.map(h=>({id:h.id,hero:h.heroId,team:h.team}))};
		`)
		// A bounded integration proof through app.frame, including presentation; no injected HP.
		let result
		for (let i = 0; i < 25; i++) {
			result = evaluate(`return dt.game.moba.fastForward({ticks:3600});`)
			if (result.winner) break
		}
		report.result = evaluate(`
			proof.assert(!!dt.game.moba.sim.lane.match.winner,'Seeded six-bot match did not finish');
			dt.game.moba.fastForward({ticks:120});
			proof.assert(dt.screen()==='result','Result card did not appear');
			const winner=dt.game.moba.sim.lane.match.winner,localTeam=proof.local().team;
			const title=document.querySelector('.overlay h1').textContent;
			proof.assert(title===(winner===localTeam?'VICTORY':'DEFEAT'),'Result title is not relative');
			const snapshot=JSON.stringify(dt.game.moba.snapshot());
			dt.game.moba.fastForward({ticks:120});
			proof.assert(JSON.stringify(dt.game.moba.snapshot())===snapshot,'Ended world moves');
			return {winner,localTeam,title,tick:dt.game.moba.sim.tick};
		`)
		shot('result')
		evaluate(`
			proof.button('Again'); await proof.frame();
			proof.assert(dt.screen()==='match'&&dt.game.moba.sim.tick<60&&dt.game.moba.sim.shots.length===0&&!dt.game.moba.sim.lane.match.winner,'Again did not start clean');
			await dt.key('Escape'); proof.button('Modes'); await proof.frame();
			proof.assert(dt.screen()==='splash','Final Modes exit failed'); return true;
		`)
		errors()
	})
	report.passed = true
} catch (error) {
	report.error = { stage, message: error.message }
	console.error(`${stage}: ${error.message}`)
	process.exitCode = 1
} finally {
	timed('Cleanup', () => {
		try {
			browser('close')
			rmSync(runtime, { recursive: true, force: true })
		} catch (error) {
			report.passed = false
			report.cleanupError = error.message
			process.exitCode = 1
		}
	})
	report.seconds = Number(((performance.now() - started) / 1000).toFixed(2))
	writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 2))
	console.log(
		`Browser proof ${report.passed ? 'passed' : 'failed'}: ${report.seconds}s, ${report.commands} commands`,
	)
}
