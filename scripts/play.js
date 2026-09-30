import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
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

export const HELP = `bun scripts/play.js --seed N --seat A1 [--seat B2 ...]
Turn-based 3v3: read through "act <seat>", reply with ONE JSON line.
Unassigned seats are bots. --idle B1 (repeatable) makes seats idle.
--bots easy|normal|hard; --max-seconds N; --replay public/replays/name.json
Decisions every ${tune.agents.decision}s, earlier on damage, ready, death, respawn, denial, block or Ball spawn.
Waits are interrupted by those events. Time never advances while reading.
Coordinates x,y are metres (y is ground z); map ±${tune.map.halfX}, ±${tune.map.halfZ}.
Bearing: 0=+x, 90=+y degrees. Self is live; world lags ${tune.bots.normal.reaction}s.
No fog: all heroes and structures; minions within ${tune.agents.nearby}m. Omitted rows are counted.
{"action":"move","x":0,"y":0}          click; persists to arrival (may attack)
{"action":"attack","target":"tower-B"} chase/basic a perceived enemy id
{"action":"cast","slot":"Q","x":8,"y":0} Q Loose (${tune.loose.range}m), W Vault (${tune.vault.range}m), E Rain (${tune.rain.range}m)
{"action":"stop"}                       stop order and basic/throw windup
{"action":"pickup"}                     approach loose Ball; stand still to channel
{"action":"throw","x":18,"y":0}        throw carried Ball (${tune.ball.range}m)
{"action":"wait","seconds":1}           keep existing order; one tick–${tune.agents.maxWait}s
Cooldown-illegal casts use the human input buffer/denial, not a cheat.
EOF/Ctrl-C saves a partial replay; every match saves one. Browser:
?mode=moba&replay=/replays/name.json (serve the file under public/).
`

export async function play(argv = process.argv.slice(2)) {
	const { values } = parseArgs({
		args: argv,
		options: {
			help: { type: 'boolean' },
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
	const seed = Number(values.seed),
		seconds = Number(values['max-seconds'])
	if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff)
		throw new Error('seed must be uint32')
	if (!Number.isFinite(seconds) || seconds < STEP) throw new Error('max-seconds must be positive')
	const seats = values.seat ?? ['A1']
	const roster = agentRoster({ seats, idle: values.idle ?? [], difficulty: values.bots })
	const filename = values.replay ?? `public/replays/agent-${seed}-${Date.now()}.json`
	await mkdir(dirname(filename), { recursive: true })
	await RAPIER.init({})
	const world = new RAPIER.World({ x: 0, y: coreTune.physics.gravity, z: 0 })
	world.timestep = STEP
	const unbuild = buildColliders(world, RAPIER)
	const match = createAgentMatch({ scene: new THREE.Scene(), world, RAPIER, roster, seed })
	const decisions = createAgentDecisions(
		roster.filter((s) => s.controller === 'agent').map((s) => s.id),
	)
	const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
	const iterator = lines[Symbol.asyncIterator]()
	const interrupt = () => {
		reason = 'interrupt'
		lines.close()
	}
	let reason = 'limit'
	process.once('SIGINT', interrupt)
	try {
		matchLoop: while (!match.sim.lane.match.winner && match.sim.tick < Math.ceil(seconds / STEP)) {
			const perceived = match.perception.read()
			const actions = []
			for (const { id, reasons } of decisions.due(match.sim, perceived, match.facts)) {
				process.stdout.write(observation(match.sim, id, perceived, reasons) + `\nact ${id}\n`)
				while (true) {
					const line = await iterator.next()
					if (line.done) {
						if (reason !== 'interrupt') reason = 'eof'
						break matchLoop
					}
					try {
						const action = agentAction(match.sim, id, perceived, JSON.parse(line.value))
						actions.push([id, action.frame])
						decisions.acted(id, match.sim.tick, action.ticks)
						break
					} catch (error) {
						process.stdout.write(`error ${id} ${error.message}\nact ${id}\n`)
					}
				}
			}
			match.step(actions)
		}
		if (match.sim.lane.match.winner) reason = 'matchOver'
	} finally {
		process.removeListener('SIGINT', interrupt)
		lines.close()
		const replay = match.finish(reason)
		await writeFile(filename, JSON.stringify(replay) + '\n')
		process.stdout.write(
			`result ${reason} t=${match.sim.tick * STEP}s winner=${replay.result.winner ?? 'none'} replay=${filename}\n`,
		)
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
