// Staged Carillon pull and kill through the real match loop; HP shortened for the comparison.
import { mkdirSync, readFileSync } from 'node:fs'
import { bootMatch, browserSession, devServer, holdCaptureLock } from '../../scripts/capture.js'
holdCaptureLock()
const out = process.argv[2] ?? '/tmp/warden-after'
mkdirSync(out, { recursive: true })
const session = browserSession('warden-arrival')
const { browser, evaluate } = session
const step = (ticks) =>
	evaluate(
		`(() => { for(let i=0;i<${ticks};i++) { dt.game.moba.fastForward({ticks:1}); dt.game.render() } })()`,
	)
try {
	bootMatch(session, `${devServer()}?mode=moba&map=altamesa&play&hero=ibis&seed=2&fog=0`)
	evaluate(readFileSync(new URL('../../scripts/cast-page.js', import.meta.url), 'utf8'))
	evaluate(`(() => {
  window.requestAnimationFrame = () => 0;
  const m=dt.game.moba,s=m.sim,h=s.heroes[0];
  s.setTraining({botsEnabled:false,godMode:true});
  s.clearHeroes('A',h.id);
  window.warden=s.dungeon.encounters.find(e=>e.id==='carillon');
  h.body.place(warden.unit.spawn.x-6,h.body.position.y,warden.unit.spawn.z+2);
  m.focus(warden.unit.spawn);
  return true;
 })()`)
	for (let i = 0; i < 4; i++) step(6)
	evaluate('dt.game.render()')
	browser('screenshot', `${out}/arrival.png`)
	evaluate('warden.unit.hp=1')
	const p = evaluate('__cast.screen(warden.unit.body.position.x,warden.unit.body.position.z)')
	browser('mouse', 'move', String(p.x), String(p.y))
	browser('mouse', 'down', 'right')
	for (let i = 0; i < 40; i++) {
		step(6)
		if (evaluate('warden.killed')) break
	}
	browser('mouse', 'up', 'right')
	if (!evaluate('warden.killed')) throw Error('Carillon did not fall to the player attack')
	step(32)
	evaluate('dt.game.render()')
	browser('screenshot', `${out}/fall.png`)
	for (let i = 0; i < 12; i++) step(12)
	evaluate('dt.game.render()')
	browser('screenshot', `${out}/after.png`)
	console.log(
		evaluate(
			'({phase:warden.state.phase,killed:warden.killed,facts:dt.game.moba.facts.filter(f=>f.type==="encounter")})',
		),
	)
	console.log(session.errors())
} finally {
	session.close()
}
