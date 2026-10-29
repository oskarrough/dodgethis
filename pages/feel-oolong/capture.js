// The workshop runner with one staged enemy attack during Stagger. No fabricated damage or statuses.
// Run: XDG_RUNTIME_DIR=/tmp bun pages/feel-oolong/capture.js
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
const root = resolve(import.meta.dir, '../..')
const scratch = mkdtempSync('/tmp/oolong-cast-')
const hook = `
(() => {
 const sim = dt.game.moba.sim;
 const step = __cast.step.bind(__cast);
 const samples = [];
 let attacked = false;
 __cast.step = (ticks, options = {}) => {
  let result;
  for (let i = 0; i < ticks; i++) {
   const hero = sim.find('local');
   const foe = sim.find(__cast.ids.foe);
   if (hero.stance?.ability === 'stagger' && !attacked) {
    sim.setTraining({godMode: false});
    foe.order = {kind: 'attack', target: hero.id, goal: null, path: null};
    attacked = true;
   }
   const bank = hero.statuses.find(s => s.key === 'stagger.bank');
   if (bank?.amount > 0) { foe.order = null; foe.attack = null; }
   result = step(1, {...options, fresh: options.fresh && i === 0});
   if (attacked) samples.push({tick: sim.tick, stance: !!hero.stance, channel: !!hero.channel,
    bank: hero.statuses.find(s => s.key === 'stagger.bank')?.amount ?? 0,
    shield: hero.statuses.find(s => s.key === 'swig.shield')?.amount ?? 0, hp: hero.hp});
   if (result.settled) break;
  }
  return {ran: ticks, settled: result?.settled ?? false};
 };
 window.__oolongSamples = samples;
})();
`
let runner = readFileSync(join(root, 'scripts/cast.js'), 'utf8')
runner = runner.replace("from './capture.js'", `from '${root}/scripts/capture.js'`)
runner = runner.replace("const root = join(import.meta.dir, '..')", `const root = '${root}'`)
runner = runner.replace(
	"join(import.meta.dir, 'cast-page.js')",
	`join(root, 'scripts/cast-page.js')`,
)
runner = runner.replace(
	'for (const step of steps) {',
	`evaluate(${JSON.stringify(hook)});\n for (const step of steps) {`,
)
runner = runner.replace(
	'problems = errors()',
	`writeFileSync(join(out, 'status-samples.json'), JSON.stringify(call('window.__oolongSamples'), null, '\\t') + '\\n');\n problems = errors()`,
)
const path = join(scratch, 'cast.js')
writeFileSync(path, runner)
try {
	const result = Bun.spawnSync(
		[
			process.execPath,
			path,
			'oolong',
			'--clip',
			'--steps',
			Bun.argv[2] ?? 'basic,slot1,slot1:miss,slot1:ally,slot2:gap=5:tail=0.2,slot3:gap=5:tail=4.2',
			'--out',
			resolve(Bun.argv[3] ?? join(root, 'pages/feel-oolong/after')),
			'--budget',
			'900',
		],
		{ stdio: ['inherit', 'inherit', 'inherit'] },
	)
	process.exitCode = result.exitCode
} finally {
	rmSync(scratch, { recursive: true, force: true })
}
