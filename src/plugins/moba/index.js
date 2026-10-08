import { createJuice } from '../../core/juice.js'
import { createShadows } from '../../core/shadows.js'
import { tune as coreTune } from '../../core/tune.js'
import { tune } from './tune.js'
import { FLOOR } from './map.js'
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
import { createStamps } from './stamps.js'
import { createOnboarding } from './onboarding.js'
import { createMatchMenu } from './menu.js'
import { parseMatchSetup } from './setup.js'
import { createMatchDebug } from './debug.js'
import { addSliders, sliderSections } from './sliders.js'
import { createLobby } from './lobby.js'
import { createDifficultyGallery } from './lobby-props.js'

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
	'swap',
	'pick',
	'seatClaim',
	'seatDenied',
	'seatEnter',
	'seatEmpty',
	'seatReady',
	'readyWalk',
	'readyCancel',
	'globe',
	'matchOver',
]

// Practice: a player plus two allies against three intent-driven hero bots.
// Boots with ?mode=moba. The map scope outlives individual gameplay runs.
export default function moba(app, map) {
	const { scene, RAPIER, input, audio } = app
	const sfx = createSounds(audio)
	let runs = 0

	const definition = {
		scheme: 'pointClick',
		start(run, { options = {} } = {}) {
			const isLobby = !!options.lobby
			if (isLobby && app.session.shared) {
				// Mode start must finish before its replacement can abort it. No map/sim is built.
				queueMicrotask(() => {
					if (!run.signal.aborted)
						app.modes.start('moba-front', {
							options: {
								...options,
								notice: tune.lobby.onlineNotice,
							},
						})
				})
				return {
					epoch: 0,
					snapshot: () => ({ screen: 'unavailable' }),
					apply: () => false,
					validFact: () => false,
				}
			}
			const local = app.session.local[0]
			app.setPalette({})
			document.documentElement.style.removeProperty('--page-bg')
			audio.setMusicScene('play')
			const juice = createJuice(scene)
			const stamps = createStamps(scene)
			const shadows = createShadows(scene, {
				onGround: (x, z) => Math.abs(x) <= FLOOR.halfX && Math.abs(z) <= FLOOR.halfZ,
			})
			const view = createView(scene, run.smooth)
			const skillsView = createSkillsView(scene)
			const hud = createHud({ lobby: isLobby })
			const pips = createPips()
			const follow = createFollow()
			const cameraControls = createCameraControls(
				window,
				run.signal,
				follow,
				() =>
					!isLobby &&
					(options.ready?.() ?? true) &&
					!app.clock.paused &&
					!controls.paused &&
					!menu.frozen() &&
					!app.overlay.visible,
				() => input.activeDevice(),
			)
			const cursor = createCursor(app.renderer.domElement)
			const query = new URLSearchParams(window.location.search)
			const setup = parseMatchSetup(query, options.setup ?? options)
			tune.follow.edgePan = setup.edgePan
			const difficulty = setup.difficulty
			setup.picks = {
				...setup.picks,
				[local]: {
					heroId: setup.picks?.[local]?.heroId ?? setup.heroId,
					team: setup.picks?.[local]?.team ?? 'A',
				},
			}
			const seats = isLobby
				? [{ id: local, team: setup.picks[local].team ?? 'A', heroId: setup.picks[local].heroId }]
				: practiceRoster(local, difficulty, setup.picks)
			setup.heroId = seats.find((seat) => seat.id === local).heroId
			const gallery = isLobby
				? createDifficultyGallery({
						local,
						difficulty,
						present: run.present,
						dummies: () => sim.dummies,
					})
				: null
			const botsOnly = query.has('debug') && query.has('bots-only')
			const sim = map.start(
				run,
				(world) =>
					createSim({
						scene,
						world,
						RAPIER,
						intents: run.intents,
						heroes: seats,
						bots:
							!isLobby && app.session.authoritative
								? seats.filter((seat) => botsOnly || seat.id !== local)
								: [],
						smooth: run.smooth,
						present: run.present,
						lane: !isLobby,
						...(isLobby && {
							lobby: true,
							readyRoster: practiceRoster(local, difficulty, setup.picks),
							spawns: { [local]: tune.lobby.marks[setup.picks[local].team === 'B' ? 3 : 0] },
							bounds: tune.lobby.bounds,
							posts: tune.lobby.dummyPosts,
							respawn: tune.lobby.respawn,
							footprint: gallery.contact,
						}),
						seed: setup.seed,
					}),
				isLobby ? 'plaza' : 'lane',
			)
			const ballView = isLobby ? null : createBallView(scene)
			const hero = sim.heroes.find((h) => h.id === local)
			const onboarding = isLobby ? null : createOnboarding({ scene, sim, hero })
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
				stamps,
			})
			app.clock.reset()

			const lobby = isLobby ? createLobby({ app, run, sim, hero, setup, options, gallery }) : null
			const menu =
				lobby ??
				createMatchMenu({
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
			const controls = isLobby
				? { paused: false }
				: createMatchDebug({
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
			run.input.stickAim((dir, magnitude, slot) =>
				lobby && input.pad()?.buttons[3]
					? lobby.inspectAim(dir, magnitude)
					: sim.stickAim(local, dir, magnitude, slot),
			)

			const onPad = () => input.activeDevice() === 'gamepad'
			if (!isLobby)
				run.camera.frame((dt) => {
					const frame = app.intents.get(local)
					const pad = onPad() && !sim.lane.match.winner
					const aim = pad && Object.keys(frame.held).length ? frame.aim : null
					return follow.frame(
						dt,
						hero.body.mesh.position,
						aim,
						menu.cameraControls({
							...cameraControls.read(),
							pad,
							aspect: app.camera.view.aspect,
							cameraFov: app.camera.view.fov,
						}),
					)
				})

			if (lobby) run.system('intents', lobby.prepareInput)
			run.system('simulate', (dt) => {
				lobby?.step()
				sim.step(dt)
				lobby?.afterStep()
			})
			run.on('present', feedback.present)
			if (onboarding) run.on('present', onboarding.present)
			if (ballView) run.on('present', ballView.present)
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
				menu.result(controls.paused ? 0 : dt, alpha)
				const frozen = menu.frozen() || controls.paused
				const presentationFrozen = menu.presentationFrozen() || controls.paused
				const blend = frozen ? 0 : alpha
				const step = presentationFrozen ? 0 : sim.lane?.match.winner ? dt : gameDt
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
					if (!h.dead) h.body.poseAbility?.(h.cast, blend, h, sim.tick)
				const target =
					!sim.ball?.carrying(hero) && !onPad() && frame.aim ? sim.pick(hero.team, frame.aim) : null
				const hovered = target && locate(target.id)
				cursor.update({
					enemy: !!target,
					aiming: ['slot1', 'slot2', 'slot3', 'slot4'].some((s) => frame.held[s]),
					pad: onPad(),
					paused: frozen,
				})
				ballView?.update(
					sim,
					blend,
					local,
					frame.aim,
					app.camera.view,
					sim.tick + (sim.lane?.match.winner ? menu.endingTime() / app.clock.step : blend),
				)
				sim.laneView?.update(sim.lane, sim.heroes, blend, locate, step, hero.team)
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
						!sim.ball?.carrying(hero) &&
						!!lineAbility &&
						(lineAbility.held === 'line' || lineAbility.tell === 'line'),
					units: [
						...sim.heroes,
						...sim.dummies,
						...(sim.lane?.minions ?? []),
						...(sim.lane?.structures ?? []),
					],
					hovered,
					locate,
				})
				skillsView.update(step, {
					hero: p,
					aim: frame.aim,
					held: hero.dead || sim.ball?.carrying(hero) ? {} : frame.held,
					unit: hero,
					units: [...sim.heroes, ...sim.dummies],
					lobby: isLobby,
					tick: sim.tick,
					obstacles: sim.obstacles,
					boards: sim.boards,
					zones: sim.zones,
					casters: [...sim.heroes, ...sim.dummies].filter((unit) => unit.team !== hero.team),
					alpha: blend,
				})
				feedback.fizzle(gone)
				juice.update(step)
				stamps.update(step)
				feedback.stride(hero)
				shadows.update((cast) => {
					for (const d of [...sim.heroes, ...sim.dummies]) {
						if (d.dead) continue
						const q = d.body.mesh.position
						cast(q.x, q.y - d.body.radius - d.body.halfHeight, q.z, 0.5)
					}
				})
				hud.update(dt, {
					...(lobby ? lobby.hudFrame(blend) : matchFrame(sim, hero, blend, app.clock.step)),
					aim: frame.aim,
					camera: app.camera.view,
					pad: input.pad(),
					device:
						lobby?.touchMode() && input.activeDevice() !== 'gamepad'
							? 'touch'
							: input.activeDevice(),
				})
				stepCamera(app.camera, presentationFrozen ? 0 : dt)
				lobby?.update(blend)
				pips.update(app.camera.view, [...sim.heroes, ...sim.dummies], hero.team, {
					hero,
					ball: null, // Onboarding owns the team-coloured objective pointer.
					carrying: sim.ball?.carrying(hero) ?? false,
				})
				onboarding?.update({
					camera: app.camera.view,
					alpha: blend,
					ballPosition: ballView?.markerPosition,
					frozen,
				})
			})

			run.on('blur', () => app.intents.cancel(local))

			addSliders(run.debug, sliderSections(tune, setup), app.clock.step)
			run.debug.tune('cast', tune.cast, (f, t) => {
				f.add(t, 'cancelLockout', app.clock.step, 2, app.clock.step).name('cancel lockout (s)')
			})
			run.debug.tune('hud', tune.hud, (f, t) => {
				f.add(t, 'hoverDelay', 0, 2, 0.05).name('hover delay')
			})
			run.debug.tune('edge pan', tune.follow, (f, t) => {
				f.add(t, 'edgePan')
					.name('enabled')
					.onChange((value) => {
						setup.edgePan = value
					})
				f.add(t, 'edgeBand', 8, 128, 1).name('band (px)')
				f.add(t, 'edgeSpeed', 0, 1, 0.01).name('speed × pan')
			})
			if (!isLobby)
				run.debug.expose({
					// Names for window.dt: the match runs under the descent until it lands.
					get screen() {
						return (options.ready?.() ?? true) ? menu.screen() : 'descent'
					},
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
				onboarding?.dispose()
				cursor.dispose()
				feedback.reset()
				ballView?.dispose()
				view.dispose()
				skillsView.dispose()
				hud.dispose()
				pips.dispose()
				juice.dispose()
				stamps.dispose()
				shadows.dispose()
			})

			return {
				epoch: ++runs,
				snapshot: sim.snapshot,
				apply: () => false, // no replica until M6
				validFact,
			}
		},
	}
	app.modes.define('moba', definition)
	app.modes.define('moba-lobby', {
		...definition,
		start: (run, { options = {} } = {}) =>
			definition.start(run, { options: { ...options, lobby: true } }),
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
