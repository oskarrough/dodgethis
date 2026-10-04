import RAPIER from '@dimforge/rapier3d-compat'
import { createJuice } from '../../core/juice.js'
import { tune as coreTune } from '../../core/tune.js'
import { buildMap } from './map.js'
import { createAgentMatch, readReplay, replayHash } from './agent-match.js'
import { createView } from './view.js'
import { createSkillsView } from './skills-view.js'
import { createBallView } from './ball-view.js'
import { createFollow } from './follow.js'
import { createHud } from './hud.js'
import { createSounds } from './sounds.js'
import { createFeedback } from './feedback.js'
import { tune } from './tune.js'
import './replay.css'

export async function loadReplay(file) {
	const url = new URL(file, location.href)
	if (url.origin !== location.origin) throw new Error('Replay must be served from this site')
	const response = await fetch(url)
	if (!response.ok) throw new Error(`Replay load failed: ${response.status}`)
	const replay = readReplay(await response.json())
	// Use the same WASM artifact as the CLI; native and compat builds can drift.
	await RAPIER.init({})
	return replay
}

// A separate mode: no human device, bot brain, or live menu can alter the tape.
export function mobaReplay(app) {
	app.modes.define('moba-replay', {
		scheme: 'pointClick',
		start(run, { options }) {
			const replay = readReplay(options.replay)
			const { scene } = app
			const world = new RAPIER.World({ x: 0, y: coreTune.physics.gravity, z: 0 })
			world.timestep = app.clock.step
			app.setPalette({})
			app.overlay.hide()
			document.body.classList.add('moba-replay')
			const unbuild = buildMap(scene, world, RAPIER)
			const view = createView(scene, run.smooth)
			const skillsView = createSkillsView(scene)
			const ballView = createBallView(scene)
			const hud = createHud()
			const juice = createJuice(scene)
			const sfx = createSounds(app.audio)
			const follow = createFollow()
			const match = createAgentMatch({
				scene,
				world,
				RAPIER,
				roster: replay.roster,
				seed: replay.seed,
				smooth: run.smooth,
				present: run.present,
				replay,
			})
			const { sim } = match
			const local = replay.roster.find((s) => s.controller === 'agent')?.id ?? 'A1'
			const hero = sim.heroes.find((h) => h.id === local)
			const feedback = createFeedback({
				juice,
				sfx,
				camera: app.camera,
				input: app.input,
				view,
				skillsView,
				hud,
				sim,
				local,
			})
			let paused = false,
				complete = false
			const ended = () => sim.tick >= replay.result.ticks || !!sim.lane.match.winner
			const frozen = () => paused || ended()
			const restart = () => app.modes.start('moba-replay', { options: { replay } })
			const resume = () => {
				paused = false
				app.overlay.hide()
			}
			function toggle() {
				if (ended()) return
				if (paused) return resume()
				paused = true
				app.overlay.show({
					title: 'REPLAY PAUSED',
					subtitle: 'Esc / menu · resume',
					actions: [
						{ label: 'Resume', onSelect: resume },
						{ label: 'Again', onSelect: restart },
						{ label: 'Modes', onSelect: () => app.modes.start('moba-front') },
					],
				})
			}
			run.clock.pause(frozen)
			run.intents.suspend(() => true)
			run.on('menu', toggle)
			window.addEventListener(
				'keydown',
				(event) => {
					if (!event.defaultPrevented && !event.repeat && event.code === 'Escape') toggle()
				},
				{ signal: run.signal },
			)
			run.system('input', () => {
				const menuInput = app.input.consumeMenuInput()
				if (app.overlay.visible) app.overlay.handleGamepad(menuInput)
			})
			run.on('present', feedback.present)
			run.on('present', ballView.present)
			run.system('simulate', () => match.step())
			run.camera.frame((dt) =>
				follow.frame(dt, hero.body.mesh.position, null, {
					aspect: app.camera.view.aspect,
					cameraFov: app.camera.view.fov,
				}),
			)
			const locate = (id) => sim.find(id)?.body.mesh.position ?? null
			run.system('present', ({ gameDt, dt, alpha }) => {
				const blend = frozen() ? 0 : alpha,
					elapsed = frozen() ? 0 : gameDt
				for (const h of sim.heroes)
					if (!h.dead) {
						h.body.animate(elapsed, h.cast || h.attack || h.ballThrow ? 1 : 0)
						h.body.poseAbility?.(h.cast, blend)
					}
				const p = hero.body.mesh.position
				const gone = view.update(elapsed, {
					live: new Set(sim.shots.map((s) => s.id)),
					hero: p,
					aim: null,
					held: false,
					hovered: null,
					locate,
					units: [...sim.heroes, ...sim.lane.minions, ...sim.lane.structures],
					obstacles: sim.obstacles,
				})
				skillsView.update(elapsed, {
					hero: p,
					aim: null,
					held: {},
					unit: hero,
					casters: sim.heroes,
					zones: sim.zones,
					obstacles: sim.obstacles,
					alpha: blend,
				})
				ballView.update(sim, blend, local, null, app.camera.view)
				sim.laneView.update(sim.lane, sim.heroes, blend, locate, elapsed, hero.team)
				feedback.fizzle(gone)
				juice.update(elapsed)
				app.audio.setAudioListener(p)
				hud.update(dt, {
					hero,
					sim,
					step: app.clock.step,
					cooldowns: hero.cd.slice(0, 3).map((cd) => Math.max(0, cd - blend) * app.clock.step),
					totals: [tune.loose.cooldown, tune.vault.cooldown, tune.rain.cooldown],
					elapsed: sim.tick * app.clock.step,
					teams: sim.lane.teams,
					carryingBall: sim.ball.carrying(hero),
					ballPop:
						sim.ball.state && sim.ball.state.state !== 'warning'
							? Math.max(0, sim.ball.state.popAt - sim.tick - blend) * app.clock.step
							: null,
					nextBall: (sim.ball.nextBall - sim.tick - blend) * app.clock.step,
					nextWave: (sim.lane.nextWave - sim.tick - blend) * app.clock.step,
					localTeam: hero.team,
					device: app.input.activeDevice(),
					hp: hero.hp,
					maxHp: hero.maxHp,
					respawn: hero.dead
						? Math.max(0, hero.respawnTick - sim.tick - blend) * app.clock.step
						: null,
				})
				for (let left = frozen() ? 0 : dt; left > 0;) {
					const step = Math.min(left, tune.follow.maxStep)
					app.camera.update(step)
					left -= step
				}
				if (!complete && ended()) {
					complete = true
					const verified =
						sim.tick === replay.result.ticks && replayHash(sim.snapshot()) === replay.result.hash
					app.overlay.show({
						title: verified ? 'REPLAY COMPLETE' : 'REPLAY DIVERGED',
						subtitle: verified
							? replay.result.winner
								? replay.result.winner === hero.team
									? 'Victory · enemy core destroyed'
									: 'Defeat · your core fell'
								: `Partial match · ${replay.result.reason}`
							: 'This build does not reproduce the recording',
						actions: [
							{ label: 'Again', onSelect: restart },
							{ label: 'Modes', onSelect: () => app.modes.start('moba-front') },
						],
					})
				}
			})
			app.clock.reset()
			run.debug.expose({
				mobaReplay: {
					mode: 'moba-replay',
					sim,
					snapshot: sim.snapshot,
					replay,
					fastForward(ticks) {
						if (!Number.isInteger(ticks) || ticks < 0 || ticks > tune.proof.batch)
							throw new Error('Invalid proof ticks')
						for (let i = 0; i < ticks && !frozen(); i++) app.frame(app.clock.step)
						return sim.tick
					},
					verified: () =>
						sim.tick === replay.result.ticks && replayHash(sim.snapshot()) === replay.result.hash,
				},
			})
			run.signal.addEventListener(
				'abort',
				() => {
					app.overlay.hide()
					document.body.classList.remove('moba-replay')
					match.dispose()
					view.dispose()
					skillsView.dispose()
					ballView.dispose()
					hud.dispose()
					juice.dispose()
					unbuild()
					world.free()
				},
				{ once: true },
			)
			return { epoch: 1, snapshot: sim.snapshot, apply: () => false, validFact: () => false }
		},
	})
}
