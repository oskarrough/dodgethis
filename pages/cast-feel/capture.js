// One staged 4v4: a real-input Undine beside seven ordinary bots, at the match camera.
// bun pages/cast-feel/capture.js; serialized by the same lock as shot and cast.
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import {
	bootMatch,
	browserSession,
	devServer,
	holdCaptureLock,
	run,
} from '../../scripts/capture.js'
holdCaptureLock()
const out = import.meta.dir
const frames = join(out, 'frames')
mkdirSync(frames, { recursive: true })
const session = browserSession('whole-cast-fight')
const { browser, evaluate } = session
const call = (code) => evaluate(code)
let count = 0
const started = Date.now()
try {
	bootMatch(
		session,
		`${devServer()}?mode=moba&play&map=overthrow&hero=undine&seed=2&fog=0&light=morning`,
		{ width: 1280, height: 720 },
	)
	evaluate(readFileSync(resolve(out, '../../scripts/cast-page.js'), 'utf8'))
	call(`__cast.setup()`)
	const roster = call(`(() => {
  const s=dt.game.moba.sim, me=s.find(s.training.local);
  s.clearHeroes('A',me.id); s.clearHeroes('B');
  const seats=[['undine','A',-9,1],['ibis','A',-11,-2],['mandador','A',-12,1],['salvia','A',-12,4],['lasso','B',-5,1],['oolong','B',-6,-2],['carambola','B',-3,-1],['kappa','B',-4,4]];
  const roster=seats.map(([heroId,team,x,z],i)=>{
   const h=i?s.spawnHero({heroId,team,bot:true,difficulty:'hard'},me.id):me;
   h.body.place(x,me.body.position.y,z);h.body.face({x:team==='A'?1:-1,z:0});
   h.cd.fill(0);h.hp=h.maxHp;h.order=null;h.attack=null;
   return {id:h.id,heroId,team};
  });
  __cast.ids={foe:roster[4].id,friend:roster[1].id};
  dt.game.moba.focus({x:-7,z:1});
  s.setTraining({waves:false,botsEnabled:true,godMode:false,noCooldowns:false});
  window.__fight={roster, samples:[], facts:[], seen:null};
  return roster;
 })()`)
	const save = () => {
		const data = call('__cast.takeFrames()')
		for (const frame of data)
			writeFileSync(
				join(frames, `${String(++count).padStart(5, '0')}.jpg`),
				Buffer.from(frame, 'base64'),
			)
	}
	function step(n) {
		call(`(() => {
   const s=dt.game.moba.sim;
   for(let i=0;i<${n};i++) {
    __cast.step(1,{every:2});
    const all=dt.game.moba.facts;
    __fight.facts.push(...all.slice(__fight.seen?all.lastIndexOf(__fight.seen)+1:0));
    __fight.seen=all.at(-1);
    if(s.tick%12===0) __fight.samples.push({tick:s.tick,alive:s.heroes.filter(h=>!h.dead).length,zones:s.zones.length,summons:s.summons.length,fields:s.groundFields.length,shots:s.shots.length});
   }
   return true;
  })()`)
		save()
	}
	function key(code, at) {
		const pixel = call(`__cast.screen(${at.x},${at.z})`)
		browser('mouse', 'move', String(pixel.x), String(pixel.y))
		call(`__cast.key('${code}',true)`)
		step(8)
		call(`__cast.key('${code}',false)`)
		step(4)
	}
	step(12)
	key('KeyQ', { x: -5, z: 1 })
	for (let i = 0; i < 3; i++) step(12)
	key('KeyW', { x: -7, z: 0 })
	for (let i = 0; i < 24; i++) step(12)
	const evidence = call(`({roster:__fight.roster,samples:__fight.samples,facts:__fight.facts})`)
	const local = roster[0].id
	const casts = evidence.facts.filter((f) => f.type === 'cast')
	if (
		!['balloon', 'sprinkler'].every((id) => casts.some((f) => f.hero === local && f.ability === id))
	)
		throw Error('Crowded proof missed a local cast')
	const actorCount = new Set(casts.map((f) => f.hero)).size
	if (actorCount < 4) throw Error('Crowded proof had fewer than four casting heroes')
	const errors = session.errors()
	if (errors && !/no (page )?errors/i.test(errors)) throw Error(errors)
	writeFileSync(
		join(out, 'fight.json'),
		JSON.stringify(
			{
				method:
					'Staged 4v4, real pointer and Q/W key events for Undine; seven hard bots use ordinary AI. No injected damage. No HUD. Fixed 1/60 s ticks, two ticks per video frame; not hardware FPS or input latency.',
				seconds: count / 30,
				wallSeconds: (Date.now() - started) / 1000,
				actorCount,
				...evidence,
			},
			null,
			'\t',
		) + '\n',
	)
	run('ffmpeg', [
		'-y',
		'-loglevel',
		'error',
		'-framerate',
		'30',
		'-i',
		join(frames, '%05d.jpg'),
		'-vf',
		'scale=960:540',
		'-c:v',
		'libvpx-vp9',
		'-threads',
		'2',
		'-crf',
		'36',
		'-b:v',
		'0',
		join(out, 'fight.webm'),
	])
	// One sheet from this capture: the same two instants in colour and grayscale.
	run('ffmpeg', [
		'-y',
		'-loglevel',
		'error',
		'-i',
		join(out, 'fight.webm'),
		'-vf',
		"select='eq(n,24)+eq(n,52)',scale=800:450,tile=1x2",
		'-frames:v',
		'1',
		join(out, 'fight.webp'),
	])
	run('magick', [join(out, 'fight.webp'), '-colorspace', 'Gray', join(out, 'fight-gray.webp')])
	console.log(
		JSON.stringify({
			seconds: count / 30,
			actorCount,
			casts: [...new Set(casts.map((f) => f.ability ?? 'basic'))],
			proof: join(out, 'fight.webm'),
		}),
	)
	rmSync(frames, { recursive: true, force: true })
} finally {
	session.close()
}
