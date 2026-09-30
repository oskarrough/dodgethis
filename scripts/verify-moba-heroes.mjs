// Dev server proof: node scripts/verify-moba-heroes.mjs <URL> <artifact directory>
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { tune } from '../src/plugins/moba/tune.js'
const base = process.argv[2] ?? 'http://127.0.0.1:5177'
const dir = resolve(process.argv[3] ?? `${process.env.BB_THREAD_STORAGE}/heroes`)
mkdirSync(dir, { recursive: true })
const browser = (...args) =>
	execFileSync('agent-browser', ['--session', 'hero-definitions-proof', ...args], {
		encoding: 'utf8',
	}).trim()
const evaluate = (script) => JSON.parse(browser('eval', script))
const key = (code) =>
	evaluate(
		`window.dispatchEvent(new KeyboardEvent('keydown',{code:${JSON.stringify(code)},bubbles:true}));true`,
	)
const report = { silhouettes: [], screens: [] }
try {
	browser('set', 'viewport', '1440', '1000')
	browser('open', `${base}/scripts/moba-hero-silhouettes.html`)
	browser('wait', '1500')
	report.silhouettes = evaluate('window.silhouetteProof')
	assert.equal(report.silhouettes.length, 8)
	for (const entry of report.silhouettes) {
		if (entry.id === 'fletcher')
			assert(Math.abs(entry.projectedPixels - tune.heroProof.pixels) < 1e-8)
		assert(entry.projectedPixels > 0)
		assert.equal(entry.fov, report.silhouettes[0].fov)
		assert.equal(entry.pitch, (Math.atan2(tune.follow.height, tune.follow.back) * 180) / Math.PI)
		assert.equal(entry.glError, 0)
	}
	browser('screenshot', `${dir}/silhouettes-20px-grayscale.png`)
	for (const [width, height] of [
		[390, 844],
		[1440, 900],
		[2560, 1080],
	]) {
		browser('set', 'viewport', String(width), String(height))
		browser('open', `${base}/?mode=moba`)
		browser('wait', '.front-practice')
		evaluate("document.querySelector('.front-practice').click();true")
		browser('wait', '[aria-label="Choose your hero"]')
		key('Backquote')
		evaluate('window.probe=window.game;true')
		key('Backquote')
		const portrait = evaluate(
			`(()=>{const b=probe.scene.getObjectByName('front-fletcher');return {screen:probe.front.screen,radius:b.children[0].geometry.parameters.radius,quiverArrows:b.children[0].children.filter(p=>p.type==='Group').length}})()`,
		)
		assert.equal(portrait.screen, 'hero')
		assert.equal(portrait.radius, tune.silhouettes.bodyRadius)
		assert.equal(portrait.quiverArrows, tune.silhouettes.arrowCount)
		browser('screenshot', `${dir}/select-${width}.png`)
		evaluate(
			"[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Lock in').click();true",
		)
		for (let i = 0; i < 30; i++) {
			if (
				evaluate(
					'!document.querySelector(".front-loading") && !!probe.moba && probe.moba.snapshot().t > 0',
				)
			)
				break
			browser('wait', '500')
		}
		assert(evaluate('!document.querySelector(".front-loading") && probe.moba.snapshot().t > 0'))
		const state = evaluate('probe.moba.snapshot()')
		assert.equal(state.heroes.length, 2) // Browser practice is local vs scripted; six seats are the headless proof.
		assert(state.heroes.every((h) => h.heroId === 'fletcher'))
		browser('screenshot', `${dir}/lane-${width}.png`)
		report.screens.push({ width, height, portrait, laneTick: state.t })
	}
	writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 2) + '\n')
	console.log(JSON.stringify(report))
} finally {
	browser('close')
}
