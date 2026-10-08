import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { appendFileSync } from 'node:fs'
import { sessionCommand, sessionDirectory, sessionTransport } from './play-session.js'
import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { STEP } from '../src/core/app.js'
import { tune as coreTune } from '../src/core/tune.js'
import { tune } from '../src/plugins/moba/tune.js'
import { buildColliders } from '../src/plugins/moba/obstacles.js'
import {
	agentRoster,
	agentAction,
	observation,
	createAgentDecisions,
} from '../src/plugins/moba/agents.js'
import { createAgentMatch } from '../src/plugins/moba/agent-match.js'

export const HELP = `bun run play:headless [start --session s] --seed N --seat A1 [--seat B2 ...]
bun run play:headless act --session s '{"action":"wait","seconds":30}'
bun run play:headless stop --session s; start prints the first observation and daemon pid.
Without start: read through "act <seat>", reply with ONE JSON line.
Unassigned seats are bots. --idle B1 (repeatable) makes seats idle.
--bots easy|normal|hard; --max-seconds N; --replay public/replays/name.json
Decisions every ${tune.agents.decision}s; wait keeps orders, coalesces events until its deadline.
Only own death, new aimed enemy tell, Ball spawn or one hit >${tune.agents.interruptDamage * 100}% max HP interrupts wait.
Coordinates x,y are metres (y is ground z); map ±${tune.map.halfX}, ±${tune.map.halfZ}.
Bearings are from live self to stale unit, measured from +x: 0=+x, 90=+y degrees.
Self is live; world lags ${tune.bots.normal.reaction}s. stale is position age, not inactivity.
Heal ${tune.base.heal * 100}% max HP/s at x<=-${tune.base.x} (A) or x>=${tune.base.x} (B), any y.
No fog: all heroes/structures; minions within ${tune.agents.nearby}m; omitted rows counted.
{"action":"move","x":0,"y":0}          move only, even onto an enemy
{"action":"attack-move","x":0,"y":0}   move, engage enemies in basic range, resume
{"action":"attack","target":"tower-B"} chase/basic a perceived enemy id
{"action":"cast","slot":"Q","target":"B2"} aim at perceived unit (or use x,y; no live tracking)
Q Loose: ${tune.loose.damage} dmg, ${tune.loose.range}m, ${tune.loose.castPoint}s tell, ${tune.loose.cooldown}s CD; W Vault: ${tune.vault.range}m, ${tune.vault.time}s dash, ${tune.vault.cooldown}s CD.
E Rain: ${tune.rain.damage} dmg, ${tune.rain.range}m, ${tune.rain.radius}m radius, ${tune.rain.delay}s delay, ${tune.rain.cooldown}s CD, ${tune.rain.slow * 100}% slow/${tune.rain.duration}s.
{"action":"stop"}                       stop order and basic/throw windup
{"action":"pickup"}                     approach loose Ball; stand still to channel
{"action":"throw","x":18,"y":0}        throw carried Ball (${tune.ball.range}m)
{"action":"wait","seconds":30}          one tick–${tune.agents.maxWait}s; re-wait keeps interrupted window
Denied/blocked events include verb and reason; cooldown uses the human input buffer.
Inputs append to replay.inputs.jsonl; decisions to replay.actions.jsonl, immediately.
EOF, SIGINT and SIGTERM save a partial replay; every match saves one. Browser:
?mode=moba&replay=/replays/name.json (serve the file under public/).
`

export async function play(argv = process.argv.slice(2)) {
	const command = ['start', 'act', 'stop', 'serve'].includes(argv[0]) ? argv.shift() : null
	const { values, positionals } = parseArgs({
		args: argv,
		allowPositionals: true,
		options: {
			help: { type: 'boolean' },
			session: { type: 'string' },
			seed: { type: 'string', default: String(tune.bots.seed) },
			seat: { type: 'string', multiple: true },
			idle: { type: 'string', multiple: true },
			bots: { type: 'string', default: 'normal' },
			replay: { type: 'string' },
			'max-seconds': { type: 'string', default: String(tune.agents.maxSeconds) },
		},
	})
	if (values.help) {
		process.stdout.write(HELP)
		return
	}
	if (command && command !== 'serve') {
		if (command === 'act' && positionals.length !== 1) throw new Error('act needs one JSON action')
		process.stdout.write(await sessionCommand(command, argv, values, positionals[0]))
		return
	}
	if (positionals.length) throw new Error('Unexpected positional argument')
	const seed = Number(values.seed),
		seconds = Number(values['max-seconds'])
	if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff)
		throw new Error('seed must be uint32')
	if (!Number.isFinite(seconds) || seconds < STEP) throw new Error('max-seconds must be positive')
	const seats = values.seat ?? ['A1']
	const roster = agentRoster({ seats, idle: values.idle ?? [], difficulty: values.bots })
	const filename = values.replay ?? `public/replays/agent-${seed}-${Date.now()}.json`
	await mkdir(dirname(filename), { recursive: true })
	await Promise.all(
		['.inputs.jsonl', '.actions.jsonl'].map((suffix) => writeFile(filename + suffix, '')),
	)
	await RAPIER.init({})
	const world = new RAPIER.World({ x: 0, y: coreTune.physics.gravity, z: 0 })
	world.timestep = STEP
	const unbuild = buildColliders(world, RAPIER)
	const match = createAgentMatch({
		scene: new THREE.Scene(),
		world,
		RAPIER,
		roster,
		seed,
		onInputs: (record) => appendFileSync(filename + '.inputs.jsonl', JSON.stringify(record) + '\n'),
	})
	const decisions = createAgentDecisions(
		roster.filter((s) => s.controller === 'agent').map((s) => s.id),
	)
	const transport =
		command === 'serve' ? await sessionTransport(sessionDirectory(values.session)) : null
	const lines = transport ? null : createInterface({ input: process.stdin, crlfDelay: Infinity })
	const iterator = transport ?? lines[Symbol.asyncIterator]()
	const output = (text) => (transport ? transport.output(text) : process.stdout.write(text))
	const interrupt = () => {
		reason = 'interrupt'
		if (transport) transport.interrupt()
		else lines.close()
	}
	let reason = 'limit'
	process.once('SIGINT', interrupt)
	process.once('SIGTERM', interrupt)
	try {
		matchLoop: while (!match.sim.lane.match.winner && match.sim.tick < Math.ceil(seconds / STEP)) {
			const perceived = match.perception.read()
			const actions = []
			for (const { id, reasons } of decisions.due(match.sim, perceived, match.facts)) {
				output(observation(match.sim, id, perceived, reasons) + `\nact ${id}\n`)
				while (true) {
					const line = await iterator.next()
					if (line.done) {
						if (reason !== 'interrupt') reason = 'eof'
						break matchLoop
					}
					try {
						const action = agentAction(match.sim, id, perceived, JSON.parse(line.value))
						appendFileSync(
							filename + '.actions.jsonl',
							JSON.stringify({
								tick: match.sim.tick,
								id,
								input: JSON.parse(line.value),
								frame: action.frame,
							}) + '\n',
						)
						actions.push([id, action.frame])
						decisions.acted(id, match.sim.tick, action.ticks, action.waiting)
						break
					} catch (error) {
						output(`error ${id} ${error.message}\nact ${id}\n`)
					}
				}
			}
			match.step(actions)
		}
		if (match.sim.lane.match.winner) reason = 'matchOver'
	} finally {
		process.removeListener('SIGINT', interrupt)
		process.removeListener('SIGTERM', interrupt)
		lines?.close()
		const replay = match.finish(reason)
		await writeFile(filename, JSON.stringify(replay) + '\n')
		const result = `result ${reason} t=${match.sim.tick * STEP}s winner=${replay.result.winner ?? 'none'} replay=${filename}\n`
		if (transport) await transport.close(result)
		else output(result)
		match.dispose()
		unbuild()
		world.free()
	}
}

if (import.meta.main)
	play().catch((error) => {
		console.error(error.message)
		process.exitCode = 1
	})
