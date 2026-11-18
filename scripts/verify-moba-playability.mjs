// Production browser proof: bun run verify:browser <URL> <shots directory>
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

if (process.argv.includes('--help')) {
	console.log(
		'bun run verify:browser <preview URL> <shots directory>\nWalks the MOBA lobby into a match, then checks layouts, movement, pause/resume/leave, Dodgeball entry and a seeded bot result/again. Saves screenshots and stage timings. Requires agent-browser.',
	)
	process.exit(0)
}
const base = process.argv[2] ?? 'http://127.0.0.1:4802'
const directory = resolve(process.argv[3] ?? '/tmp/playability-shots')
mkdirSync(directory, { recursive: true })
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
			local: () => (dt.game.moba?.sim ?? dt.game.portalParty.sim).heroes.find(hero=>hero.id==='local'),
			// Steer the left stick toward (x, z) each frame until done(); the lobby walks, it has no menus.
			async walk(x, z, done) {
				const end=performance.now()+10000;
				while (!done()) {
					const at=proof.local().body.position;
					if (performance.now()>end) { await dt.pad.stick(0,0); throw Error('Walk stalled at '+at.x.toFixed(1)+','+at.z.toFixed(1)); }
					const dx=x-at.x,dz=z-at.z,length=Math.hypot(dx,dz)||1;
					await dt.pad.stick(dx/length,dz/length);
				}
				await dt.pad.stick(0,0);
			},
			picked: () => document.querySelector('[data-picked=true]')?.textContent.toLowerCase(),
			button(label) {
				const button=[...document.querySelectorAll('.overlay button')].find((candidate)=>candidate.querySelector('.label').textContent.startsWith(label));
				if (!button) throw Error('Missing '+label);
				button.click();
			}
		};
		proof.assert(!!window.dt,'Missing proof API');
		return true;
	`)
}
function shot(name) {
	// Keep hover out of evidence; the caller has already asserted the claimed screen.
	browser('mouse', 'move', '0', '0')
	browser('screenshot', `${directory}/${name}.png`)
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
			proof.assert(proof.local().heroId==='ibis'&&proof.picked()==='normal','Lobby did not start on Ibis and Normal');
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
				const rect=selector=>document.querySelector(selector).getBoundingClientRect();
				const back=rect('.back-button');
				const strips=[...document.querySelectorAll('.lobby-hero-strip')].map(strip=>strip.getBoundingClientRect());
				proof.assert(strips.length===2&&strips.every(strip=>strip.left>=0&&strip.top>=0&&strip.bottom<=innerHeight&&strip.right<=innerWidth)&&back.top>=0&&back.left>=0,'Lobby controls left the frame');
				return true;
			`)
			shot(`lobby-${width}`)
			report.layouts.push({ width, height })
		}
		browser('set', 'viewport', '1440', '900')
		// A player picks a hero on their own seat card, a difficulty by standing on its stone, and goes by walking into the tear.
		// Its stone and tear positions come from tune.lobby.gallery and tune.lobby.portal (src/modes/moba/front/lobby-tune.js).
		browser('click', '.lobby-hero-strip[data-team=A] .portal-seat:first-child button')
		browser('click', '.portal-picker [data-hero=kappa]')
		evaluate(`
			await proof.frame(); await proof.frame();
			proof.assert(proof.local().heroId==='kappa','Seat card did not pick Kappa');
			await proof.walk(3.2,5.2,()=>proof.picked()==='hard');
			return true;
		`)
	})
	timed('Real loading journey', () => {
		evaluate(`
			await proof.walk(0,-6.3,()=>dt.game.portalParty.readySeats.seatOf('local').full);
			return true;
		`)
		browser('wait', '--timeout', '30000', '--fn', 'dt.screen()==="match"')
		evaluate(`
			proof.assert(!document.querySelector('.moba-front'),'Loading did not finish');
			proof.assert(document.querySelector('.splash').hidden,'Dodgeball splash leaked into MOBA');
			proof.assert(document.querySelector('.overlay').hidden,'Walking in paused the match');
			proof.assert(proof.local().heroId==='kappa','Match lost the chosen hero');
			proof.assert(dt.game.moba.setup.difficulty==='hard','Match lost the chosen difficulty');
			proof.assert(dt.game.moba.sim.heroes.length===6,'Lobby seats did not fill both teams');
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
			await dt.key('Escape'); proof.assert(dt.screen()==='paused'&&!!document.querySelector('.overlay[data-theme=moba-pause]'),'Keyboard pause failed');
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
			proof.button('Leave'); await proof.frame();
			proof.assert(dt.screen()==='splash','Leave did not go home');
			return true;
		`)
		browser('click', '.front-tile[data-mode=moba]')
		browser('wait', '.front-lobby')
		evaluate(`
			proof.assert(dt.screen()==='lobby'&&proof.local().heroId==='kappa'&&proof.picked()==='hard','Lobby lost the picks');
			await dt.key('Escape'); proof.assert(dt.screen()==='splash','Esc did not return to splash');
			return true;
		`)
	})
	timed('Dodgeball portal', () => {
		// The splash lays its cards back down after the lobby; click once the tile is on top.
		browser(
			'wait',
			'--timeout',
			'5000',
			'--fn',
			`(()=>{const tile=document.querySelector('.front-bonus[data-mode=dodgeball]'),box=tile?.getBoundingClientRect();return !!box&&tile.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2))})()`,
		)
		browser('click', '.front-bonus[data-mode=dodgeball]')
		browser('wait', '.splash:not([hidden])')
		evaluate(`
			proof.assert(dt.game.phase==='lobby'&&!dt.game.moba,'Dodgeball tile did not open its lobby');
			await dt.key('KeyW',{until:()=>dt.game.phase==='playing'});
			proof.assert(!dt.game.moba&&dt.game.phase==='playing','Dodgeball portal entered the wrong mode');
			return true;
		`)
		errors()
	})
	timed('Seeded bot match and result', () => {
		browser('open', `${base}/?mode=moba&play&debug&bots-only&bots=normal&seed=2`)
		browser('wait', '.moba-hud')
		helpers()
		report.match = evaluate(`
			proof.assert(dt.screen()==='match'&&!document.querySelector('.moba-front'),'Direct play did not enter match');
			proof.assert(dt.game.moba.setup.seed===2&&dt.game.moba.proof.botsOnly,'Completion proof is not seeded bots-only');
			proof.assert(dt.game.moba.sim.heroes.length===6,'Completion roster is not six heroes');
			dt.game.pause(true);
			return {seed:dt.game.moba.setup.seed,difficulty:dt.game.moba.setup.difficulty,players:'six bots; accelerated app frames',roster:dt.game.moba.sim.heroes.map(hero=>({id:hero.id,hero:hero.heroId,team:hero.team}))};
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
			await dt.key('Escape'); proof.button('Leave'); await proof.frame();
			proof.assert(dt.screen()==='splash','Final Leave exit failed'); return true;
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
	writeFileSync(`${directory}/report.json`, JSON.stringify(report, null, 2))
	console.log(
		`Browser proof ${report.passed ? 'passed' : 'failed'}: ${report.seconds}s, ${report.commands} commands`,
	)
}
