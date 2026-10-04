import { createJuice } from '../../core/juice.js'
import { createShadows } from '../../core/shadows.js'
import { tune as coreTune } from '../../core/tune.js'
import { tune } from './tune.js'
import { buildMap, FLOOR } from './map.js'
import { castAbility } from './ability.js'
import { createSim } from './sim.js'
import { practiceRoster } from './bots.js'
import { createFollow } from './follow.js'
import { createCameraControls } from './camera-controls.js'
import { createCursor } from './cursor.js'
import { createView } from './view.js'
import { createSkillsView } from './skills-view.js'
import { createHud } from './hud.js'
import { createPips } from './pips.js'
import { createSounds } from './sounds.js'
import { createBallView } from './ball-view.js'
import { createFeedback } from './feedback.js'
import { createMatchMenu } from './menu.js'
import { parseMatchSetup } from './setup.js'
import { createMatchDebug } from './debug.js'

const FACTS = [
	'boardExpired',
	'caught',
	'catchExpired',
	'channelCancelled',
	'channelEnd',
	'ballContested',
	'ballWarn',
	'ballSpawn',
	'ballChannel',
	'ballInterrupted',
	'ballPickup',
	'ballWindup',
	'ballThrow',
	'ballHit',
	'ballBounce',
	'ballDrop',
	'ballPop',
	'ballDenied',
	'order',
	'cast',
	'projectile',
	'blocked',
	'hit',
	'nearMiss',
	'death',
	'spawn',
	'denied',
	'impact',
	'aggro',
	'expired',
	'xp',
	'structureDown',
	'shielded',
	'levelUp',
	'globe',
	'matchOver',
]

// Practice: a player plus two allies against three intent-driven hero bots.
// Boots with ?mode=moba. Everything lives as long as a run of the mode.
export default function moba(app) {
	const { scene, world, RAPIER, input, audio } = app
	const sfx = createSounds(audio)
	let runs = 0

	app.modes.define('moba', {
		scheme: 'pointClick',
		start(run, { options = {} } = {}) {
			const local = app.session.local[0]
			app.setPalette({})
			document.documentElement.style.removeProperty('--page-bg')
			audio.setMusicScene('play')
			const unbuild = buildMap(scene, world, RAPIER)
			const juice = createJuice(scene)
			const shadows = createShadows(scene, {
				onGround: (x, z) => Math.abs(x) <= FLOOR.halfX && Math.abs(z) <= FLOOR.halfZ,
			})
			const view = createView(scene, run.smooth)
			const skillsView = createSkillsView(scene)
			const hud = createHud()
			const pips = createPips()
			const follow = createFollow()
			const cameraControls = createCameraControls(
				window,
				run.signal,
				follow,
				() => !app.clock.paused,
			)
			const cursor = createCursor(app.renderer.domElement)
			const query = new URLSearchParams(window.location.search)
			const setup = parseMatchSetup(query, options.setup ?? options)
			const difficulty = setup.difficulty
			const seats = practiceRoster(local, difficulty)
			seats.find((seat) => seat.id === local).heroId = setup.heroId
			const botsOnly = query.has('debug') && query.has('bots-only')
			const sim = createSim({
				scene,
				world,
				RAPIER,
				intents: run.intents,
				heroes: seats,
				bots: app.session.authoritative
					? seats.filter((seat) => botsOnly || seat.id !== local)
					: [],
				smooth: run.smooth,
				present: run.present,
				lane: true,
				seed: setup.seed,
			})
			const ballView = createBallView(scene)
			const hero = sim.heroes.find((h) => h.id === local)
			const feedback = createFeedback({
				juice,
				sfx,
				camera: {
					...app.camera,
					kick(amount) {
						follow.reserveKick(amount * coreTune.camera.fovKick)
						app.camera.kick(amount)
					},
				},
				input,
				view,
				skillsView,
				hud,
				sim,
				local,
			})
			app.clock.reset()

			const menu = createMatchMenu({
				app,
				run,
				sim,
				hero,
				clearCamera: cameraControls.clear,
				focusCore: follow.focus,
				ready: options.ready,
				difficulty,
				setup,
			})
			const controls = createMatchDebug({
				app,
				run,
				sim,
				local,
				menu,
				setup,
				botsOnly,
				ready: options.ready,
				clearCamera: cameraControls.clear,
			})
			run.clock.scale(feedback.beat)
			run.intents.suspend(() => coreTune.physics.paused)
			run.input.stickAim((dir, magnitude, slot) => sim.stickAim(local, dir, magnitude, slot))

			const onPad = () => input.activeDevice() === 'gamepad'
			run.camera.frame((dt) => {
				const frame = app.intents.get(local)
				const pad = onPad() && !sim.lane.match.winner
				const aim = pad && Object.keys(frame.held).length ? frame.aim : null
				return follow.frame(dt, hero.body.mesh.position, aim, {
					...cameraControls.read(),
					pad,
					aspect: app.camera.view.aspect,
					cameraFov: app.camera.view.fov,
				})
			})

			run.system('simulate', (dt) => sim.step(dt))
			run.on('present', feedback.present)
			run.on('present', ballView.present)
			const ballFacts = []
			run.on('present', (fact) => {
				if (!fact.type.startsWith('ball')) return
				ballFacts.push(fact)
				if (ballFacts.length > tune.proof.trace) ballFacts.shift()
			})

			const locate = (id) => {
				const unit = sim.find(id)
				return unit?.body.mesh.position ?? null
			}
			run.system('present', ({ dt, gameDt, alpha }) => {
				menu.result(controls.paused ? 0 : dt)
				const frozen = menu.frozen() || controls.paused
				const presentationFrozen = menu.presentationFrozen() || controls.paused
				const step = presentationFrozen ? 0 : sim.lane.match.winner ? dt : gameDt
				const frame = app.intents.get(local)
				const p = hero.body.mesh.position
				audio.setAudioListener(p)
				if (
					!hero.dead &&
					sim.tick >= hero.freezeUntil &&
					hero.body.animate(step, hero.cast || hero.attack || hero.ballThrow ? 1 : 0)
				)
					sfx.step(p)
				for (const d of [...sim.heroes.filter((h) => h.id !== local), ...sim.dummies])
					if (!d.dead && sim.tick >= (d.freezeUntil ?? 0))
						d.body.animate(step, d.cast || d.attack || d.ballThrow ? 1 : 0)
				for (const h of [...sim.heroes, ...sim.dummies])
					if (!h.dead) h.body.poseAbility?.(h.cast, frozen ? 0 : alpha)
				const target =
					!sim.ball.carrying(hero) && !onPad() && frame.aim ? sim.pick(hero.team, frame.aim) : null
				const hovered = target && locate(target.id)
				cursor.update({
					enemy: !!target,
					aiming: ['slot1', 'slot2', 'slot3', 'slot4'].some((s) => frame.held[s]),
					pad: onPad(),
					paused: frozen,
				})
				ballView.update(
					sim,
					frozen ? 0 : alpha,
					local,
					frame.aim,
					app.camera.view,
					sim.tick +
						(sim.lane.match.winner ? menu.endingTime() / app.clock.step : frozen ? 0 : alpha),
				)
				sim.laneView.update(sim.lane, sim.heroes, frozen ? 0 : alpha, locate, step, hero.team)
				const lineAbility = hero.cast
					? castAbility(hero)
					: Object.entries(hero.definition.abilities).find(
							([slot, ability]) => frame.held[slot] && ability?.held === 'line',
						)?.[1]
				const gone = view.update(step, {
					live: new Set(sim.shots.map((s) => s.id)),
					hero: p,
					aim: hero.cast && lineAbility?.tell === 'line' ? hero.cast.target : frame.aim,
					lineStats: lineAbility?.stats,
					obstacles: sim.obstacles,
					held:
						!hero.dead &&
						!sim.ball.carrying(hero) &&
						!!lineAbility &&
						(lineAbility.held === 'line' || lineAbility.tell === 'line'),
					units: [...sim.heroes, ...sim.lane.minions, ...sim.lane.structures],
					hovered,
					locate,
				})
				skillsView.update(step, {
					hero: p,
					aim: frame.aim,
					held: hero.dead || sim.ball.carrying(hero) ? {} : frame.held,
					unit: hero,
					obstacles: sim.obstacles,
					boards: sim.boards,
					zones: sim.zones,
					casters: [...sim.heroes, ...sim.dummies].filter((unit) => unit.team !== hero.team),
					alpha: frozen ? 0 : alpha,
				})
				feedback.fizzle(gone)
				juice.update(step)
				shadows.update((cast) => {
					for (const d of [...sim.heroes, ...sim.dummies]) {
						if (d.dead) continue
						const q = d.body.mesh.position
						cast(q.x, q.y - d.body.radius - d.body.halfHeight, q.z, 0.5)
					}
				})
				hud.update(dt, {
					hero,
					sim,
					aim: frame.aim,
					camera: app.camera.view,
					pad: input.pad(),
					step: app.clock.step,
					cooldowns: hero.cd
						.slice(0, 3)
						.map((cd) => Math.max(0, cd - (frozen ? 0 : alpha)) * app.clock.step),
					totals: [tune.loose.cooldown, tune.vault.cooldown, tune.rain.cooldown],
					elapsed: sim.tick * app.clock.step,
					teams: sim.lane.teams,
					carryingBall: sim.ball.carrying(hero),
					ballPop:
						sim.ball.state && sim.ball.state.state !== 'warning'
							? Math.max(
									0,
									Math.min(sim.ball.state.popAt, sim.ball.nextBall) -
										sim.tick -
										(frozen ? 0 : alpha),
								) * app.clock.step
							: null,
					nextBall: (sim.ball.nextBall - sim.tick - (frozen ? 0 : alpha)) * app.clock.step,
					nextWave: (sim.lane.nextWave - sim.tick - (frozen ? 0 : alpha)) * app.clock.step,
					localTeam: hero.team,
					device: input.activeDevice(),
					hp: hero.hp,
					maxHp: hero.maxHp,
					respawn: hero.dead
						? Math.max(0, hero.respawnTick - sim.tick - (frozen ? 0 : alpha)) * app.clock.step
						: null,
				})
				// The camera's explicit FOV spring needs bounded integration steps on slow renderers.
				let cameraLeft = presentationFrozen ? 0 : dt
				while (cameraLeft > 0) {
					const cameraStep = Math.min(cameraLeft, tune.follow.maxStep)
					app.camera.update(cameraStep)
					cameraLeft -= cameraStep
				}
				pips.update(app.camera.view, [...sim.heroes, ...sim.dummies], hero.team, {
					hero,
					ball: sim.ball.carrying(hero) ? null : ballView.markerPosition,
					carrying: sim.ball.carrying(hero),
				})
			})

			run.on('blur', () => app.intents.cancel(local))

			run.debug.tune('tower', tune.tower, (f, t) => {
				f.add(t, 'hp', 100, 6000, 100).name('HP (applies on restart)')
				f.add(t, 'x', 10, 25, 1).name('position (applies on restart)')
				f.add(t, 'radius', 0.5, 2, 0.1).name('radius (applies on restart)')
				f.add(t, 'damage', 1, 300, 1)
				f.add(t, 'rate', 0.25, 3, 0.05)
				f.add(t, 'range', 1, 12, 0.25)
				f.add(t, 'speed', 1, 40, 1)
				f.add(t, 'tell', 0.3, 1, app.clock.step)
			})
			for (const kind of ['fort', 'core'])
				run.debug.tune(kind, tune[kind], (f, t) => {
					f.add(t, 'hp', 100, 10000, 100).name('HP (applies on restart)')
					f.add(t, 'x', 26, 43, 1).name('position (applies on restart)')
					f.add(t, 'radius', 0.5, 3, 0.1).name('radius (applies on restart)')
					f.add(t, 'damage', 1, 400, 1)
					f.add(t, 'rate', 0.25, 3, 0.05)
					f.add(t, 'range', 1, 12, 0.25)
					f.add(t, 'speed', 1, 40, 1)
					f.add(t, 'tell', 0.3, 1, app.clock.step)
				})
			run.debug.tune('levels', tune.levels, (f, t) => {
				for (const key of ['cap', 'first', 'increment'])
					f.add(t, key, 1, key === 'cap' ? 10 : 2000, 1).name(`${key} (applies on restart)`)
				f.add(t, 'growth', 0, 1, 0.01).name('growth (on next level)')
				f.add(t, 'passive', 0, 100, 1)
				f.add(t, 'passiveStart', app.clock.step, 120, app.clock.step)
				f.add(t, 'takedown', 0, 1000, 1)
				f.add(t, 'victimLevel', 0, 100, 1)
			})
			run.debug.tune('Ball', tune.ball, (f, t) => {
				for (const key of ['carrySpeed', 'structureDamage']) f.add(t, key, 0, 1, 0.01)
				f.add(t, 'first', 30, 600, app.clock.step).name('first (applies on restart)')
				for (const key of ['interval', 'lateInterval'])
					f.add(t, key, 30, 600, app.clock.step).name(`${key} (next scheduling)`)
				f.add(t, 'warning', app.clock.step, 30, app.clock.step).name('warning (next warning)')
				f.add(t, 'life', app.clock.step, 45, app.clock.step).name('life (next spawn)')
				for (const key of ['channel', 'stun', 'silence', 'lock'])
					f.add(t, key, app.clock.step, 30, app.clock.step).name(`${key} (next action)`)
				f.add(t, 'tell', 0.3, 1, app.clock.step).name('tell (next throw)')
				f.add(t, 'speed', 1, 40, 0.1).name('speed (next throw)')
				f.add(t, 'range', 1, 12, 0.1).name('range (next throw)')
				f.add(t, 'radius', 0.1, 1, 0.05).name('radius (next throw)')
				f.add(t, 'pickup', 0.1, 2, 0.1)
				f.add(t, 'damage', 0, 1000, 10)
			})
			run.debug.tune('globes', tune.globes, (f, t) => {
				f.add(t, 'heal', 0, 1, 0.01)
				f.add(t, 'life', app.clock.step, 60, app.clock.step).name('life (next drop)')
				f.add(t, 'pickup', 0.1, 3, 0.1)
			})
			run.debug.tune('base', tune.base, (f, t) => {
				f.add(t, 'x', 43, 48, 1)
				f.add(t, 'heal', 0, 1, 0.01)
			})
			for (const preset of ['easy', 'normal', 'hard'])
				run.debug.tune(`bots ${preset}`, tune.bots[preset], (f, t) => {
					for (const key of ['reaction', 'dodgeReaction'])
						f.add(t, key, app.clock.step, 1, app.clock.step)
					for (const key of ['jitter', 'leadError', 'dodge', 'aggression', 'catchRate'])
						f.add(t, key, 0, 1, 0.01)
					if (preset === 'easy') {
						f.add(t, 'focusUntil', app.clock.step, 600, app.clock.step).name('early duel rule (s)')
						f.add(t, 'humanAttackers', 1, 3, 1).name('early human duelists')
					}
				})
			run.debug.tune('bots', tune.bots, (f, t) => {
				f.add(setup, 'seed', 0, tune.testing.seedMax, 1).name('seed (applies on restart)')
				f.add(t, 'thinkTicks', 1, 60, 1)
				f.add(t, 'rainHeroes', 1, 3, 1)
				f.add(t, 'bruteEscort', 1, 3, 1)
				f.add(t, 'siegeFile', -4, 4, 1)
				for (const key of ['retreatHp', 'recoverHp', 'ballHp', 'chaseHp']) f.add(t, key, 0, 1, 0.01)
				f.add(t, 'fileSpacing', 0, 4, 0.1).name('files (applies on restart)')
			})
			run.debug.tune('match', tune.match, (f, t) => {
				f.add(t, 'late', app.clock.step, 1200, app.clock.step)
				f.add(t, 'lateGunDamage', 0, 1, 0.01)
			})
			run.debug.tune('waves', tune.waves, (f, t) => {
				f.add(t, 'first', app.clock.step, 30, app.clock.step).name(
					'first wave (applies on restart)',
				)
				f.add(t, 'interval', app.clock.step, 60, app.clock.step).name('interval (next scheduling)')
				f.add(t, 'lateInterval', app.clock.step, 60, app.clock.step).name(
					'late interval (next scheduling)',
				)
				f.add(t, 'growth', 0, 1, 0.01).name('growth (next spawn)')
				f.add(t, 'aggro', 1, 10, 0.25)
				f.add(t, 'helpHold', app.clock.step, 5, app.clock.step)
				f.add(t, 'leash', 1, 12, 0.25)
				f.add(t, 'soak', 1, 20, 0.5)
			})
			for (const kind of ['melee', 'ranged', 'wizard', 'brute'])
				run.debug.tune(kind, tune.minions[kind], (f, t) => {
					f.add(t, 'hp', 1, 5000, 1).name('HP (next spawn)')
					f.add(t, 'damage', 1, 100, 1)
					f.add(t, 'rate', 0.1, 3, 0.05)
					f.add(t, 'range', 0.1, 8, 0.1)
					f.add(t, 'speed', 0, 8, 0.1)
					f.add(t, 'tell', 0.3, 1, app.clock.step)
					f.add(t, 'xp', 0, 200, 1)
				})
			// --- Tune GUI: moba's sections come and go with the run; the values live in tune.js and survive restarts. ---
			run.debug.tune('hero', tune.hero, (f, t) => {
				f.add(t, 'hp', 200, 3000, 100).name('HP (applies on restart)')
				f.add(t, 'speed', 1, 12, 0.1)
				f.add(t, 'accel', 1, 80, 1)
				f.add(t, 'friction', 0, 40, 0.5)
				f.add(t, 'stopFriction', 0, 60, 0.5).name('stop friction')
				f.add(t, 'stopSpeed', 0, 6, 0.1).name('stop speed')
				f.add(t, 'turnRate', 90, 3600, 30).name('turn rate (°/s)')
			})
			run.debug.tune('attack', tune.attack, (f, t) => {
				f.add(t, 'damage', 10, 300, 5)
				f.add(t, 'rate', 0.25, 3, 0.05)
				f.add(t, 'windup', app.clock.step, 0.5, app.clock.step)
				f.add(t, 'backswing', app.clock.step, 0.5, app.clock.step)
				f.add(t, 'speed', 8, 60, 1)
				f.add(t, 'radius', 0.05, 0.5, 0.01)
				f.add(t, 'visualScale', 0.1, 1, 0.05)
			})
			run.debug.tune('respawn', tune.respawn, (f, t) => {
				f.add(t, 'base', app.clock.step, 20, app.clock.step)
				f.add(t, 'perLevel', app.clock.step, 5, app.clock.step)
			})
			run.debug.tune('momentum', tune.momentum, (f, t) => {
				f.add(t, 'reduction', 0, 4, 0.25).name('Vault recharge (s)')
			})
			run.debug.tune('orders', tune.orders, (f, t) => {
				f.add(t, 'pick', 0, 2, 0.05).name('attack pick (m)')
				f.add(t, 'carrot', 0.1, 3, 0.05).name('carrot (m)')
				f.add(t, 'arrival', 0.01, 0.5, 0.01).name('arrival (m)')
				f.add(t, 'rejoinDistance', 0.05, 1, 0.05).name('rejoin after displacement (m)')
				f.add(t, 'stallProgress', 0, 1, 0.05).name('repath below ×')
				f.add(t, 'stallTime', 0.05, 1, 0.05).name('repath after (s)')
				f.add(t, 'clearance', 0, 0.5, 0.01).name('obstacle clearance')
				f.add(t, 'attackRange', 1, 10, 0.25).name('attack range')
			})
			run.debug.tune('loose', tune.loose, (f, t) => {
				f.add(t, 'damage', 10, 500, 10)
				f.add(t, 'speed', 6, 60, 0.5).name('speed (m/s)')
				f.add(t, 'range', 3, 30, 0.5)
				f.add(t, 'radius', 0.05, 1.5, 0.05)
				f.add(t, 'castPoint', app.clock.step, 0.5, app.clock.step).name('cast point (s)')
				f.add(t, 'cooldown', 0.2, 10, 0.1).name('cooldown (s)')
				f.add(t, 'nearMiss', 0, 2, 0.05).name('near miss (m)')
			})
			run.debug.tune('rain', tune.rain, (f, t) => {
				f.add(t, 'damage', 10, 500, 10)
				f.add(t, 'castPoint', app.clock.step, 1, app.clock.step)
				f.add(t, 'range', 1, 20, 0.25)
				f.add(t, 'radius', 0.1, 6, 0.1)
				f.add(t, 'delay', app.clock.step, 3, app.clock.step)
				f.add(t, 'slow', 0, 1, 0.01)
				f.add(t, 'duration', 0.1, 5, 0.1)
				f.add(t, 'cooldown', 0.2, 15, 0.1)
			})
			run.debug.tune('vault', tune.vault, (f, t) => {
				f.add(t, 'castPoint', app.clock.step, 1, app.clock.step)
				f.add(t, 'range', 0.5, 10, 0.25)
				f.add(t, 'time', app.clock.step, 1, app.clock.step)
				f.add(t, 'cooldown', 0.2, 10, 0.1)
			})
			run.debug.tune('stickAim', tune.stickAim, (f, t) => {
				f.add(t, 'inMin', 0, 1, 0.01).name('stick from')
				f.add(t, 'inMax', 0, 1, 0.01).name('stick to')
				f.add(t, 'outMin', 0, 1, 0.01).name('reach from ×')
				f.add(t, 'assistAngle', 0, 30, 0.5).name('assist (°)')
				f.add(t, 'assistBend', 0, 1, 0.05).name('assist bend')
			})
			run.debug.tune('follow', tune.follow, (f, t) => {
				f.add(t, 'pan', 5, 40, 0.5).name('pan (m/s)')
				f.add(t, 'height', 5, 40, 0.5)
				f.add(t, 'back', 0, 30, 0.5)
				f.add(t, 'fov', 20, 70, 1)
				f.add(t, 'response', 0.02, 0.6, 0.01).name('pad response (s)')
				f.add(t, 'edgeInset', 0.5, 0.95, 0.01).name('base framing ×')
				f.add(t, 'lookAhead', 0, 0.6, 0.01).name('pad look ahead ×')
				f.add(t, 'lookCap', 0, 8, 0.25).name('pad look cap (m)')
			})
			run.debug.tune('dummies', tune.dummies, (f, t) => {
				f.add(t, 'speed', 0, 8, 0.25)
				f.add(t, 'flipMin', 0.1, 3, 0.05).name('flip min (s)')
				f.add(t, 'flipMax', 0.1, 4, 0.05).name('flip max (s)')
				f.add(t, 'span', 0.5, 10, 0.5).name('span (m)')
				f.add(t, 'hp', 200, 3000, 100).name('HP on respawn')
				f.add(t, 'tell', 0.3, 1, app.clock.step).name('Q warning (s)')
				f.add(t, 'castEvery', 1, 10, 0.25).name('cast interval')
				f.add(t, 'respawn', 0.2, 10, 0.1).name('respawn (s)')
			})
			for (const [name, sound] of Object.entries(tune.sounds)) {
				run.debug.tune(`sound ${name}`, sound, (f, t) => {
					f.add(t, 'freq', 20, 2400, 10)
					f.add(t, 'slideTo', 20, 2400, 10)
					f.add(t, 'dur', app.clock.step, 0.6, app.clock.step)
					f.add(t, 'gain', 0, 1, 0.01)
				})
			}
			run.debug.tune('juice', tune.juice, (f, t) => {
				f.add(t, 'attackSquash', -0.3, 0.3, 0.01)
				f.add(t, 'castSquash', -0.3, 0.3, 0.01)
				f.add(t, 'vaultSquash', -0.3, 0.3, 0.01)
				f.add(t, 'rainSquash', -0.3, 0.3, 0.01)
				f.add(t, 'flash', 0, 0.3, 0.01).name('hit flash (s)')
				f.add(t, 'hitstop', 0, 0.3, 0.005).name('hitstop (s)')
				f.add(t, 'shakeTaken', 0, 1, 0.05).name('shake on you')
				f.add(t, 'shakeTakedown', 0, 1, 0.05).name('shake takedown')
			})
			run.debug.expose({
				moba: {
					sim,
					setup,
					controls,
					proof: { ...tune.proof, step: app.clock.step, botsOnly },
					ballFacts,
					ballView,
					snapshot: () => sim.snapshot(),
					focus: (point) => follow.focus(point),
					// Proof uses the real app loop: intents, fixed simulation, smoothing and feedback.
					fastForward({ ticks, target = null }) {
						if (!Number.isInteger(ticks) || ticks < 0 || ticks > tune.proof.batch)
							throw new Error('Invalid proof step count')
						const wasPhysicsPaused = coreTune.physics.paused
						coreTune.physics.paused = false
						try {
							for (let i = 0; i < ticks; i++) {
								if (target && sim.lane.structures.find((s) => s.id === target)?.dead) break
								app.frame(app.clock.step)
							}
						} finally {
							coreTune.physics.paused = wasPhysicsPaused
						}
						return {
							tick: sim.tick,
							winner: sim.lane.match.winner,
							dead: target ? !!sim.lane.structures.find((s) => s.id === target)?.dead : false,
						}
					},
				},
			})

			run.signal.addEventListener('abort', () => {
				cursor.dispose()
				feedback.reset()
				ballView.dispose()
				view.dispose()
				skillsView.dispose()
				hud.dispose()
				pips.dispose()
				juice.dispose()
				shadows.dispose()
				sim.dispose()
				unbuild()
			})

			return {
				epoch: ++runs,
				snapshot: sim.snapshot,
				apply: () => false, // no replica until M6
				validFact,
			}
		},
	})
}

// A fact is a known type carrying plain data: finite numbers, strings, booleans and nulls, shallowly nested.
export function validFact(fact) {
	if (!fact || typeof fact !== 'object' || !FACTS.includes(fact.type)) return false
	const plain = (v, depth) => {
		if (v === null || typeof v === 'string' || typeof v === 'boolean') return true
		if (typeof v === 'number') return Number.isFinite(v)
		if (depth > 2 || typeof v !== 'object' || Array.isArray(v)) return false
		return Object.values(v).every((x) => plain(x, depth + 1))
	}
	return plain(fact, 0)
}
