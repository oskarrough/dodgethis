// Real seeded 3v3 play, fixed-tick bot intents, the game's camera, no state staging.
// node scripts/verify-moba-bots.mjs <vite URL> <artifact directory>
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://127.0.0.1:5199'
const dir = resolve(process.argv[3] ?? `${process.env.BB_THREAD_STORAGE}/moba-bots`)
mkdirSync(dir, { recursive: true })
const browser = (...args) =>
	execFileSync('agent-browser', ['--session', 'moba-bots-proof', ...args], {
		encoding: 'utf8',
	}).trim()
const evaluate = (source) => JSON.parse(browser('eval', source))
const key = (code) =>
	evaluate(
		`window.dispatchEvent(new KeyboardEvent('keydown',{code:'${code}',bubbles:true,cancelable:true}));window.dispatchEvent(new KeyboardEvent('keyup',{code:'${code}',bubbles:true,cancelable:true}));true`,
	)
const report = []
let captureTick = null
const focus = `(()=>{const ps=probe.moba.sim.heroes.map(h=>h.body.position);probe.moba.focus({x:(Math.min(...ps.map(p=>p.x))+Math.max(...ps.map(p=>p.x)))/2,z:(Math.min(...ps.map(p=>p.z))+Math.max(...ps.map(p=>p.z)))/2});true})()`
const fight = `(()=>{const s=probe.moba.sim;return s.heroes.length===6 && s.heroes.every(h=>!h.dead&&Math.abs(h.body.position.x)<9&&Math.abs(h.body.position.z)<9) && s.heroes.filter(h=>{const p=h.body.mesh.position.clone().project(probe.camera);return Math.abs(p.x)<0.85&&Math.abs(p.y)<0.6}).length===6 && s.heroes.filter(h=>h.attack&&s.heroes.some(e=>e.team!==h.team&&e.id===h.attack.target)).length>=2 && s.heroes.some(h=>h.cast)})()`
for (const [width, height] of [
	[390, 844],
	[1440, 900],
	[2560, 1080],
]) {
	browser('set', 'viewport', String(width), String(height))
	browser('open', `${base}/?mode=moba&debug&bots-only`)
	browser('wait', '.front-practice')
	browser('click', '.front-practice')
	browser('click', '.front-lock')
	browser('wait', '.moba-hud')
	evaluate('window.probe=window.game;probe.pause(true);true')
	key('Backquote')
	if (!evaluate('probe.moba.proof.botsOnly&&probe.moba.sim.bots.brains.length===6'))
		throw new Error('Not six real hero bots')
	evaluate('probe.moba.focus({x:0,z:0});probe.moba.fastForward({ticks:60});true')
	if (captureTick !== null) {
		while (evaluate('probe.moba.sim.tick') < captureTick)
			evaluate(
				`(()=>{for(let i=0;i<900&&probe.moba.sim.tick<${captureTick};i++){${focus};probe.moba.fastForward({ticks:1})}return true})()`,
			)
	}
	while (captureTick === null && !evaluate(fight)) {
		const result = evaluate(
			`(()=>{for(let i=0;i<900;i++){if(${fight})return {done:true};${focus};probe.moba.fastForward({ticks:1});if(probe.moba.sim.tick>36000)return {failed:true}}return {done:false}})()`,
		)
		if (result.failed) throw new Error('No genuine six-hero mid teamfight within ten minutes')
	}
	const state = evaluate('probe.moba.snapshot()')
	captureTick ??= state.t
	const camera = evaluate(
		'({position:probe.camera.position.toArray(),fov:probe.camera.fov,aspect:probe.camera.aspect})',
	)
	if (!evaluate(fight)) throw new Error('Teamfight ended before capture')
	browser('screenshot', `${dir}/teamfight-${width}.png`)
	const errors = browser('errors')
	if (errors) throw new Error(errors)
	report.push({
		width,
		height,
		tick: state.t,
		heroes: state.heroes.map((h) => ({
			id: h.id,
			team: h.team,
			pos: h.pos,
			hp: h.hp,
			attack: h.attack,
			cast: h.cast,
		})),
		camera,
		file: `teamfight-${width}.png`,
	})
	writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 2))
}
console.log(JSON.stringify(report, null, 2))
browser('close')
