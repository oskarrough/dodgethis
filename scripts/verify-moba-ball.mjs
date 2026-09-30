// Real app frames only: the scripted hero contests mid, carries and scores. No injected damage.
// node scripts/verify-moba-ball.mjs <dev/preview URL> <artifact directory>
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://127.0.0.1:5199'
const dir = resolve(process.argv[3] ?? `${process.env.BB_THREAD_STORAGE}/ball-real`)
mkdirSync(dir, { recursive: true })
const browser = (...args) =>
	execFileSync('agent-browser', ['--session', 'ball-proof', ...args], { encoding: 'utf8' }).trim()
const evaluate = (source) => JSON.parse(browser('eval', source))
const key = (code) =>
	evaluate(
		`window.dispatchEvent(new KeyboardEvent('keydown',{code:'${code}',bubbles:true,cancelable:true}));window.dispatchEvent(new KeyboardEvent('keyup',{code:'${code}',bubbles:true,cancelable:true}));true`,
	)
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
	evaluate('probe.pause(true);true')
	const config = evaluate('probe.moba.proof')
	const advance = (ticks) => evaluate(`probe.moba.fastForward({ticks:${ticks}})`)
	function until(condition, batch = 12) {
		while (true) {
			const result = evaluate(
				`(()=>{for(let i=0;i<600;i++){if(${condition})return {done:true};const state=probe.moba.fastForward({ticks:${batch}});if(state.winner||state.tick*probe.moba.proof.step>probe.moba.proof.siegeLimit)return {done:!!(${condition}),failed:true}}return {done:false}})()`,
			)
			if (result.done) return
			if (result.failed) throw new Error(`Real-play condition never reached: ${condition}`)
		}
	}
	function focus(point) {
		evaluate(`probe.moba.focus(${point});true`)
		advance(Math.round(1 / config.step))
	}
	until('probe.moba.sim.tick*probe.moba.proof.step>=165', 600)
	focus('{x:0,z:0}')
	if (evaluate('probe.moba.snapshot().ball.state') !== 'warning')
		throw new Error('Warning proof is not a warning')
	browser('screenshot', `${dir}/warning-${width}.png`)
	until('probe.moba.snapshot().ball?.state==="carried"')
	focus('probe.moba.snapshot().ball.pos')
	if (evaluate('probe.moba.snapshot().ball.state') !== 'carried')
		throw new Error('Carry proof is not carried')
	browser('screenshot', `${dir}/carry-${width}.png`)
	until('probe.moba.sim.heroes.some(h=>h.ballThrow)', 1)
	const windup = evaluate('probe.moba.snapshot()')
	// The camera follows the forthcoming hit without staging a shot.
	evaluate('probe.moba.focus(probe.moba.snapshot().ball.pos);true')
	browser('screenshot', `${dir}/windup-${width}.png`)
	until('probe.moba.snapshot().ball?.state==="flying"', 1)
	advance(6)
	if (evaluate('probe.moba.snapshot().ball?.state') !== 'flying')
		throw new Error('Flight proof is not flying')
	browser('screenshot', `${dir}/flight-${width}.png`)
	until('probe.moba.ballFacts.some(f=>f.type==="ballHit"&&f.kind==="structure")', 1)
	const hit = evaluate('probe.moba.ballFacts.find(f=>f.type==="ballHit"&&f.kind==="structure")')
	evaluate(`probe.moba.focus(${JSON.stringify(hit.point)});true`)
	advance(12)
	const impact = evaluate(
		`({ball:probe.moba.snapshot().ball,structure:probe.moba.snapshot().structures.find(s=>s.id==='${hit.target}'),tick:probe.moba.sim.tick})`,
	)
	if (
		impact.ball !== null ||
		!impact.structure.vulnerable ||
		impact.structure.silentUntil <= impact.tick
	)
		throw new Error('Not a real vulnerable-structure Ball hit')
	browser('screenshot', `${dir}/confetti-${width}.png`)
	until('!!probe.moba.sim.lane.match.winner', 600)
	const winner = evaluate('probe.moba.sim.lane.match.winner')
	if (winner !== 'B') throw new Error('Scripted hero did not finish its siege')
	const errors = browser('errors')
	if (errors) throw new Error(errors)
	report[width] = {
		windupTick: windup.t,
		hit,
		impact,
		winner,
		winSeconds: evaluate('probe.moba.sim.tick') * config.step,
		errors,
	}
	writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 2))
}
console.log(JSON.stringify(report, null, 2))
browser('close')
