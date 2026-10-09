import { createJuice } from '../../core/juice.js'
import { createShadows } from '../../core/shadows.js'
import { tune as coreTune } from '../../core/tune.js'
import { tune } from './tune.js'
import { FLOOR } from './obstacles.js'
import { matchRecipe, onlineMaps } from './maps/index.js'
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
import { createFeedback } from './feedback.js'
import { createStamps } from './stamps.js'
import { createMatchMenu } from './menu.js'
import { parseMatchSetup } from './setup.js'
import { createDebugLayout, createMatchDebug } from './debug.js'
import { addSliders, sliderSections } from './sliders.js'
import { createLobby } from './lobby.js'
import { createDifficultyGallery } from './lobby-props.js'
import { createLobbyReplica } from './lobby-replica.js'
import { createLaneReplica } from './lane-replica.js'
import { HEROES } from './heroes.js'

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
	// Room departures survive individual lane/lobby runs, but reset on a new room.
	const departed = new Set()

	const definition = {
		scheme: 'pointClick',
		start(run, { roster = [], options = {} } = {}) {
			const isLobby = !!options.lobby
			const query = new URLSearchParams(window.location.search)
			const setup = parseMatchSetup(query, options.setup ?? options)
			const kind = isLobby ? 'lobby' : setup.map
			const match = matchRecipe(kind)
			const { layout, pieces, palette, debugTune, online } = match
			if (!online && app.session.shared) {
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
			if (!options.handoff && !options.sharedLobby) departed.clear()
			app.setPalette(palette)
			document.documentElement.style.removeProperty('--page-bg')
			audio.setMusicScene('play')
			const juice = createJuice(scene)
			const stamps = createStamps(scene)
			const ground = isLobby ? FLOOR : layout.bounds
			const shadows = createShadows(scene, {
				onGround: (x, z) => Math.abs(x) <= ground.halfX && Math.abs(z) <= ground.halfZ,
			})
			const view = createView(
				scene,
				!app.session.authoritative ? (object, read) => replica.smooth(object, read) : run.smooth,
			)
			const skillsView = createSkillsView(scene)
			const hud = createHud({ lobby: isLobby, layout, pieces })
			const pips = createPips()
			const follow = createFollow(tune.follow, layout.bounds)
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
			tune.follow.edgePan = setup.edgePan
			const difficulty = setup.difficulty
			// Without an explicit seed each match draws one, so bots and the enemy's random hero vary; copied links keep it.
			if (!setup.seeded)
				Object.assign(setup, { seed: (Math.random() * 2 ** 32) >>> 0, seeded: true })
			setup.picks = {
				...setup.picks,
				[local]: {
					heroId: setup.picks?.[local]?.heroId ?? setup.heroId,
					team: setup.picks?.[local]?.team ?? 'A',
				},
			}
			const seats =
				isLobby && roster.length
					? roster
							.filter((seat) => seat.controller === 'human')
							.map((seat) => ({
								...seat,
								heroId:
									seat.data?.heroId ??
									setup.picks[seat.id]?.heroId ??
									(seat.id === local ? setup.heroId : 'fletcher'),
							}))
					: isLobby
						? [
								{
									id: local,
									team: setup.picks[local].team ?? 'A',
									heroId: setup.picks[local].heroId,
								},
							]
						: roster.length
							? roster
							: practiceRoster(local, difficulty, setup.picks, setup.seed)
			setup.heroId = seats.find((seat) => seat.id === local).heroId
			const lobbySpawns = {}
			if (isLobby) {
				const used = new Set()
				for (const seat of seats) {
					const preferred = tune.lobby.marks.filter((mark) => mark.x < 0 === (seat.team === 'A'))
					const mark =
						preferred.find((mark) => !used.has(mark)) ??
						tune.lobby.marks.find((mark) => !used.has(mark))
					// Rooms allow more humans than the lane's six seats; overflow stands beside the marks.
					lobbySpawns[seat.id] = mark ?? {
						x: tune.lobby.marks[0].x * (seats.indexOf(seat) - tune.lobby.marks.length + 2),
						z: tune.lobby.marks[0].z,
					}
					if (mark) used.add(mark)
				}
			}
			const gallery = isLobby
				? createDifficultyGallery({
						local,
						difficulty,
						present: run.present,
						dummies: () => sim.dummies,
					})
				: null
			const botsOnly = query.has('debug') && query.has('bots-only')
			const simulation = map.start(
				run,
				(world) =>
					createSim({
						scene,
						world,
						RAPIER,
						...match,
						intents: run.intents,
						heroes: seats,
						bots:
							pieces.some((piece) => piece.controllers) && app.session.authoritative
								? seats.filter((seat) =>
										app.session.shared ? seat.controller === 'bot' : botsOnly || seat.id !== local,
									)
								: [],
						smooth: app.session.authoritative ? run.smooth : null,
						present: run.present,
						...(isLobby && {
							lobby: true,
							// Online seats only the humans; bots fill the free boxes so a short lobby can still ready up.
							readyRoster: roster.length
								? practiceRoster(
										local,
										difficulty,
										Object.fromEntries(
											roster.map((seat) => [
												seat.id,
												{ heroId: seat.data?.heroId ?? seat.heroId, team: seat.team },
											]),
										),
										setup.seed,
										roster.filter((seat) => seat.controller !== 'bot').map((seat) => seat.id),
									).map((seat) => ({
										...seat,
										...roster.find((human) => human.id === seat.id),
										heroId: seat.heroId,
									}))
								: practiceRoster(local, difficulty, setup.picks, setup.seed),
							spawns: lobbySpawns,
							respawn: tune.lobby.respawn,
							footprint: gallery.contact,
						}),
						seed: setup.seed,
					}),
				kind,
			)
			// Assigned boxes are reservations, not won claims; walking into one stamps the claim tick.
			if (isLobby) for (const seat of simulation.readySeats.seats) seat.claimTick = null
			const ballView = pieces.find((piece) => piece.view)?.view(scene) ?? null
			const replica = !app.session.authoritative
				? isLobby
					? createLobbyReplica(simulation, scene)
					: createLaneReplica(simulation, scene)
				: null
			const sim = replica?.sim ?? simulation
			const onPresent = replica?.onPresent ?? ((listener) => run.on('present', listener))
			if (replica) {
				run.on('present', replica.present)
				run.system('present', () => replica.update(performance.now() / 1000))
			}
			const hero = sim.heroes.find((h) => h.id === local)
			const onboarding =
				pieces.find((piece) => piece.onboarding)?.onboarding({ scene, sim, hero }) ?? null
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

			const arrangeDebug = createDebugLayout(run, isLobby)
			if (debugTune) run.debug.tune(debugTune.name, debugTune.values, debugTune.add)
			const lobby = isLobby
				? createLobby({ app, run, sim, hero, setup, options, gallery, onPresent })
				: null
			const epoch = ++runs
			let returnQueued = false
			function lobbyReturn() {
				const participants = isLobby
					? [
							...sim.heroes.map((h) => ({
								id: h.id,
								team: h.seatTeam,
								heroId: h.heroId,
								joinOrder: h.joinOrder,
								controller: 'human',
							})),
							...sim.readySeats.seats
								.filter((seat) => seat.occupant?.bot)
								.map((seat) => ({
									...seat.occupant,
									team: seat.team,
									controller: 'bot',
								})),
						]
					: seats
				const returning = participants
					.filter((seat) => !departed.has(seat.id))
					.map((seat) => {
						const human = sim.heroes.find((h) => h.id === seat.id)
						const heroId = human?.heroId ?? seat.heroId
						return {
							...seat,
							heroId,
							joinOrder: human?.joinOrder ?? seat.joinOrder,
							data: { heroId },
						}
					})
				return {
					id: epoch,
					roster: returning,
					setup: {
						...setup,
						picks: Object.fromEntries(
							returning.map((seat) => [
								seat.id,
								{
									heroId: seat.heroId,
									team: seat.team,
								},
							]),
						),
					},
				}
			}
			function returnToLobby(next = lobbyReturn()) {
				if (!app.session.shared) return false
				if (returnQueued) return true
				returnQueued = true
				const session = app.session
				// Never tear down a sim from inside its fixed step or a wire callback.
				queueMicrotask(() => {
					if (run.signal.aborted) return
					app.modes.start('moba-lobby', {
						session,
						roster: next.roster,
						options: { setup: { ...next.setup, edgePan: setup.edgePan }, sharedLobby: next },
					})
				})
				return true
			}
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
					returnToLobby,
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
					const pad = onPad() && !sim.lane?.match.winner
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
			onPresent(feedback.present)
			if (onboarding) onPresent(onboarding.present)
			if (ballView) onPresent(ballView.present)
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
				menu.result(controls.paused ? 0 : dt, replica ? 0 : alpha)
				const frozen = menu.frozen() || controls.paused
				const presentationFrozen = menu.presentationFrozen() || controls.paused
				const blend = frozen || replica ? 0 : alpha
				const step = presentationFrozen ? 0 : sim.lane?.match.winner ? dt : gameDt
				map.update(step)
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
					live: new Set(sim.shots.map((s) => s.id)),
					hero: p,
					aim: hero.cast && lineAbility?.tell === 'line' ? hero.cast.target : frame.aim,
					lineStats: lineAbility?.stats,
					obstacles: sim.obstacles,
					bounds: sim.bounds,
					held:
						!hero.dead &&
						!sim.ball?.carrying(hero) &&
						!!lineAbility &&
						(lineAbility.held === 'line' || lineAbility.tell === 'line'),
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
					bounds: sim.bounds,
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
				view.health(
					[
						...sim.heroes,
						...sim.dummies,
						...(sim.lane?.minions ?? []),
						...(sim.lane?.structures ?? []),
					],
					app.camera.view,
					app.renderer.domElement.getBoundingClientRect(),
					local,
					hero.team,
				)
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
				arrangeDebug(f.parent)
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
						replica: replica?.stats,
						snapshot: () => sim.snapshot(),
						focus: (point) => follow.focus(point),
						// Proof uses the real app loop: intents, fixed simulation, smoothing and feedback.
						fastForward({ ticks, target = null }) {
							if (!app.session.authoritative) throw new Error('Only the host can fast-forward')
							if (!Number.isInteger(ticks) || ticks < 0 || ticks > tune.proof.batch)
								throw new Error('Invalid proof step count')
							const wasPhysicsPaused = coreTune.physics.paused
							coreTune.physics.paused = false
							try {
								for (let i = 0; i < ticks; i++) {
									if (target && sim.lane?.structures.find((s) => s.id === target)?.dead) break
									app.frame(app.clock.step)
								}
							} finally {
								coreTune.physics.paused = wasPhysicsPaused
							}
							return {
								tick: sim.tick,
								winner: sim.lane?.match.winner ?? null,
								dead: target ? !!sim.lane?.structures.find((s) => s.id === target)?.dead : false,
							}
						},
					},
				})

			run.signal.addEventListener('abort', () => {
				if (!isLobby) app.setPalette({})
				onboarding?.dispose()
				cursor.dispose()
				feedback.reset()
				replica?.dispose()
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
				capacity: tune.lobby.capacity,
				joinData: () => ({ heroId: hero.heroId }),
				validJoinData: (data) => data?.heroId == null || HEROES[data.heroId]?.playable === true,
				epoch,
				loadingHero: () => ({ x: hero.body.position.x, z: hero.body.position.z }),
				roomLobby: isLobby,
				roomRoster: () =>
					sim.heroes
						.filter(
							(h) =>
								isLobby || seats.some((seat) => seat.id === h.id && seat.controller === 'human'),
						)
						.map((h) => ({
							id: h.id,
							team: h.seatTeam ?? h.team,
							heroId: h.heroId,
							joinOrder: h.joinOrder ?? seats.find((seat) => seat.id === h.id)?.joinOrder,
						})),
				returnToLobby: () => app.session.authoritative && returnToLobby(),
				removeParticipant(id) {
					if (!app.session.shared || id === local) return false
					departed.add(id)
					return sim.removeHero(id)
				},
				soloStart: () => ({
					mode: 'moba-lobby',
					args: {
						options: {
							setup: {
								...setup,
								heroId: hero.heroId,
								picks: { local: { heroId: hero.heroId, team: hero.seatTeam ?? hero.team } },
							},
						},
					},
				}),
				snapshot: () => ({
					...sim.snapshot({ wire: true }),
					...(options.sharedLobby ? { lobbyReturn: options.sharedLobby } : {}),
					...(lobby?.handoff ||
					(options.handoff &&
						(!(options.ready?.() ?? true) || sim.tick * app.clock.step < tune.lobby.handoffFor))
						? { handoff: lobby?.handoff ?? options.handoff }
						: {}),
				}),
				apply(state, nowSeconds) {
					const next = state?.lobbyReturn
					if (!lobby && next && next.id !== options.sharedLobby?.id) {
						if (
							app.session.authoritative ||
							!app.session.shared ||
							!Number.isSafeInteger(next.id) ||
							next.id < 0 ||
							!Array.isArray(next.roster) ||
							!next.roster.length ||
							next.roster.length > tune.lobby.capacity ||
							new Set(next.roster.map((seat) => seat?.id)).size !== next.roster.length ||
							!next.roster.some((seat) => seat.id === local && seat.controller === 'human') ||
							!next.roster.every(
								(seat) =>
									typeof seat?.id === 'string' &&
									['A', 'B'].includes(seat.team) &&
									HEROES[seat.heroId]?.playable &&
									['human', 'bot'].includes(seat.controller) &&
									(seat.controller === 'bot' ||
										(Number.isSafeInteger(seat.joinOrder) && seat.joinOrder >= 0)),
							) ||
							!onlineMaps.includes(next.setup?.map) ||
							!['easy', 'normal', 'hard'].includes(next.setup.difficulty) ||
							!Number.isSafeInteger(next.setup.seed) ||
							next.setup.seed < 0 ||
							next.setup.seed > tune.testing.seedMax
						)
							return false
						return returnToLobby(structuredClone(next))
					}
					if (lobby && state?.handoff) return lobby.follow(state.handoff)
					return replica?.apply(state, nowSeconds) ?? false
				},
				validFact,
			}
		},
	}
	app.modes.define('moba', definition)
	app.modes.define('moba-lobby', {
		...definition,
		start: (run, { roster = [], options = {} } = {}) =>
			definition.start(run, { roster, options: { ...options, lobby: true } }),
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
