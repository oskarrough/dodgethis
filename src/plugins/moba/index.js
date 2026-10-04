import { createJuice } from '../../core/juice.js'
import { createShadows } from '../../core/shadows.js'
import { tune as coreTune } from '../../core/tune.js'
import { tune } from './tune.js'
import { buildMap, FLOOR } from './map.js'
import { castAbility } from './ability.js'
import { createSim } from './sim.js'
import { practiceRoster } from './bots.js'
import { createFollow, stepCamera } from './follow.js'
import { createCameraControls } from './camera-controls.js'
import { createCursor } from './cursor.js'
import { createView } from './view.js'
import { createSkillsView } from './skills-view.js'
import { createHud, matchFrame } from './hud.js'
import { createPips } from './pips.js'
import { createSounds } from './sounds.js'
import { createBallView } from './ball-view.js'
import { createFeedback } from './feedback.js'
import { createMatchMenu } from './menu.js'
import { parseMatchSetup } from './setup.js'
import { createMatchDebug } from './debug.js'
import { addSliders, sliderSections } from './sliders.js'

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
				const blend = frozen ? 0 : alpha
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
					if (!h.dead) h.body.poseAbility?.(h.cast, blend)
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
					blend,
					local,
					frame.aim,
					app.camera.view,
					sim.tick + (sim.lane.match.winner ? menu.endingTime() / app.clock.step : blend),
				)
				sim.laneView.update(sim.lane, sim.heroes, blend, locate, step, hero.team)
				const lineAbility = hero.cast
					? castAbility(hero)
					: Object.entries(hero.definition.abilities).find(
							([slot, ability]) => frame.held[slot] && ability?.held === 'line',
						)?.[1]
				const gone = view.update(step, {
					localTeam: hero.team,
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
					alpha: blend,
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
					...matchFrame(sim, hero, blend, app.clock.step),
					aim: frame.aim,
					camera: app.camera.view,
					pad: input.pad(),
					device: input.activeDevice(),
				})
				stepCamera(app.camera, presentationFrozen ? 0 : dt)
				pips.update(app.camera.view, [...sim.heroes, ...sim.dummies], hero.team, {
					hero,
					ball: sim.ball.carrying(hero) ? null : ballView.markerPosition,
					carrying: sim.ball.carrying(hero),
				})
			})

			run.on('blur', () => app.intents.cancel(local))

			addSliders(run.debug, sliderSections(tune, setup), app.clock.step)
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
