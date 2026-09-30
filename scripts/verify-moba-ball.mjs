// Real app frames only: the scripted hero contests mid, carries and scores. No injected damage.
// node scripts/verify-moba-ball.mjs <dev/preview URL> <artifact directory> [width]
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
const widthOnly = Number(process.argv[4] ?? 0)
if (![0, 390, 1440, 2560].includes(widthOnly)) throw new Error('Unsupported proof width')
const report =
	widthOnly && existsSync(`${dir}/report.json`)
		? JSON.parse(readFileSync(`${dir}/report.json`, 'utf8'))
		: {}
const probeRadius = () =>
	evaluate(
		'probe.moba.sim.ball.state.shot?.radius ?? probe.moba.ballView.root.children[3].children[0].geometry.parameters.radius',
	)
for (const [width, height] of [
	[390, 844],
	[1440, 900],
	[2560, 1080],
].filter(([width]) => !widthOnly || width === widthOnly)) {
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
				`(()=>{for(let i=0;i<600;i++){if(${condition})return {done:true};if(probe.moba.sim.ball.state?.state==='carried')probe.moba.focus(probe.moba.sim.ball.state.pos);const state=probe.moba.fastForward({ticks:${batch}});if(state.winner||state.tick*probe.moba.proof.step>probe.moba.proof.siegeLimit)return {done:!!(${condition}),failed:true}}return {done:false}})()`,
			)
			if (result.done) return
			if (result.failed) throw new Error(`Real-play condition never reached: ${condition}`)
		}
	}
	function focus(point) {
		evaluate(
			`(()=>{for(let i=0;i<${Math.round(1 / config.step)};i++){probe.moba.focus(${point});probe.moba.fastForward({ticks:1})}return true})()`,
		)
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
	const carry = evaluate(
		`(()=>{const r=probe.moba.ballView.root;return {shadow:r.children[4].visible,flat:r.children[4].material.uniforms.uFlat.value,cream:r.children[3].children[0].material.uniforms.uStyleId.value,ring:r.children[3].children.at(-1).material.uniforms.uStyleId.value,height:r.children[3].position.y,hud:document.querySelector('.moba-score').textContent,banner:document.querySelector('.moba-banner').textContent}})()`,
	)
	if (
		carry.shadow ||
		carry.flat !== 1 ||
		carry.cream === carry.ring ||
		!carry.hud.includes('Ball pops in') ||
		!carry.banner.includes('Enemy has')
	)
		throw new Error('Carry identity, shadow or live clock is unreadable')
	browser('screenshot', `${dir}/carry-${width}.png`)
	until('probe.moba.sim.heroes.some(h=>h.ballThrow)', 1)
	advance(6)
	const windup = evaluate('probe.moba.snapshot()')
	if (!windup.heroes.some((h) => h.ballThrow)) throw new Error('Windup capture missed the tell')
	const strip = evaluate('probe.moba.ballView.root.children[5].scale.y')
	if (Math.abs(strip - 2 * probeRadius()) > 0.001)
		throw new Error('Throw strip does not cover Ball collision width')
	// The camera follows the forthcoming hit without staging a shot.
	evaluate('probe.moba.focus(probe.moba.snapshot().ball.pos);true')
	browser('screenshot', `${dir}/windup-${width}.png`)
	until('probe.moba.snapshot().ball?.state==="flying"', 1)
	const release = evaluate(
		'({x:probe.moba.ballView.root.children[3].position.x,y:probe.moba.ballView.root.children[3].position.y,source:probe.moba.snapshot().ball.releasePos})',
	)
	if (Math.abs(release.y - carry.height) > 0.001 || Math.abs(release.x - release.source.x) > 0.001)
		throw new Error('Ball jumps on release')
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
		carry,
		strip,
		release,
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
