import { createJuice } from '../../core/juice.js'
import { createShadows } from '../../core/shadows.js'
import { tune as coreTune } from '../../core/tune.js'
import { tune } from './tune.js'
import { look } from './look.js'
import { FLOOR } from './obstacles.js'
import { matchRecipe, onlineMaps, maps } from './maps/all-maps.js'
import mechanicViews from './mechanics/all-mechanic-views.js'
import { castAbility } from './ability.js'
import { blocked } from './statuses.js'
import { createSim } from './sim.js'
import { practiceRoster } from './bots.js'
import { createFollow, stepCamera } from './follow.js'
import { createCameraControls } from './camera-controls.js'
import { createCursor } from './cursor.js'
import { createView } from './view.js'
import { createSkillsView } from './skills-view.js'
import { createRecallView } from './recall-view.js'
import { createBaseView } from './base-view.js'
import { createHud, matchFrame } from './hud.js'
import { createPips } from './pips.js'
import { createSounds } from './sounds.js'
import { facts as soundFacts } from './sound-table.js'
import { createFeedback } from './feedback.js'
import { createStamps } from './stamps.js'
import { createMatchMenu } from './menu.js'
import { parseMatchSetup } from './setup.js'
import { createMatchDebug } from './debug.js'
import { createFog } from './fog.js'
import { restyle, styleKnobs } from './restyle.js'
import { addSliders, sliderSections } from './sliders.js'
import { resolveUnit } from './units.js'
import { createPortalLobby } from './portal-lobby.js'
import { createDifficultyGallery } from './lobby-props.js'
import { createLobbyReplica } from './lobby-replica.js'
import { createLaneReplica } from './lane-replica.js'
import { createDungeonReplica } from './maps/dungeon/dungeon-replica.js'
import { DEFAULT_HERO, HEROES } from './heroes.js'
import { controls as playerControls } from '../../core/controls.js'

const FACTS = [
	'boardExpired',
	'caught',
	'catchExpired',
	'channelCancelled',
	'channelEnd',
	'recallStart',
	'recallOpen',
	'recallEnter',
	'recallCancelled',
	'recallEnd',
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
	'castCancelled',
	'projectile',
	'blocked',
	'cushion',
	'hit',
	'heal',
	'pull',
	'threat',
	'absorb',
	'status',
	'contact',
	'nearMiss',
	'death',
	'shove',
	'dunk',
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
	'camp',
	'flagWarn',
	'flagUp',
	'flagTaken',
	'flagLowered',
	'matchOver',
]
// Every fact has a line in the sound table, silent or not; the sound board lists the silent ones.
const unsounded = FACTS.filter((type) => !Object.hasOwn(soundFacts, type))
if (unsounded.length) console.warn(`sound-table.js has no line for facts: ${unsounded.join(', ')}`)

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
			const setup = parseMatchSetup(query, {
				...(options.setup ?? options),
				shared: app.session.shared,
			})
			const party = maps[setup.map].party
			const kind = isLobby ? 'lobby' : setup.map
			const match = matchRecipe(kind)
			const { layout, mechanics, palette, debugTune, online } = match
			if ((!online || !onlineMaps.includes(setup.map)) && app.session.shared) {
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
			// A late guest joins a lane already running; the host's next snapshots carry its seating.
			if (
				!isLobby &&
				app.session.shared &&
				!app.session.authoritative &&
				!options.handoff &&
				!options.seating
			) {
				const session = app.session
				let seated = false
				return {
					epoch: 0,
					snapshot: () => ({ screen: 'joining' }),
					apply(state) {
						const next = state?.seating
						if (seated) return true
						if (!validPlan(next, local)) return false
						seated = true
						queueMicrotask(() => {
							if (run.signal.aborted) return
							app.modes.start('moba', {
								session,
								roster: next.roster,
								options: { setup: { ...next.setup, edgePan: setup.edgePan }, seating: next },
							})
						})
						return true
					},
					validFact,
				}
			}
			if (!options.handoff && !options.sharedLobby) departed.clear()
			app.setPalette(palette)
			document.documentElement.style.removeProperty('--page-bg')
			// The lobby and a descent keep the wind (the descent starts the match theme on landing): no theme blip.
			audio.setMusicScene(isLobby || options.ready ? 'wind' : 'play')
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
			const recallView = isLobby ? null : createRecallView(app, layout)
			const baseView =
				!isLobby && layout.bases && mechanics.some((m) => m.lane)
					? createBaseView(scene, layout)
					: null
			const fog =
				!isLobby && query.get('fog') !== '0'
					? createFog(scene, layout.bounds, layout.brush, palette)
					: null
			const cameraTune = Object.create(tune.follow)
			cameraTune.edgePan = setup.edgePan
			const follow = createFollow(cameraTune, layout.bounds)
			const hud = createHud({
				lobby: isLobby,
				layout,
				mechanics,
				onMinimap: (point) => cameraControls.enabled() && follow.focus(point),
			})
			const pips = createPips()
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
				cameraTune,
			)
			const cursor = createCursor(app.renderer.domElement)
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
									(seat.id === local ? setup.heroId : DEFAULT_HERO),
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
							? party
								? roster.map((seat) => ({ ...seat }))
								: roster
							: practiceRoster(local, difficulty, setup.picks, setup.seed, [local], match.party)
			if (app.session.shared)
				for (const seat of seats)
					if (!(party ? HEROES[seat.heroId]?.playable : HEROES[seat.heroId]?.listed)) {
						console.warn(
							`MOBA: invalid online hero=${JSON.stringify(seat.heroId)}; using ${DEFAULT_HERO}`,
						)
						seat.heroId = DEFAULT_HERO
					}
			if (party) for (const seat of seats) seat.team = 'A'
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
			const gallery =
				isLobby && !party
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
							mechanics.some((mechanic) => mechanic.controllers) && app.session.authoritative
								? seats.filter((seat) =>
										app.session.shared ? seat.controller === 'bot' : botsOnly || seat.id !== local,
									)
								: [],
						smooth: app.session.authoritative ? run.smooth : null,
						present: run.present,
						...(isLobby && {
							lobby: true,
							// Dungeon keeps explicit empty seats; the competitive maps still fill their teams.
							readyRoster:
								party && roster.length
									? [
											...roster,
											...(options.partyBots ?? []).slice(
												0,
												Math.max(0, tune.lobby.partyCapacity - roster.length),
											),
										].map((seat) => ({
											...seat,
											team: 'A',
											heroId:
												seat.data?.heroId ??
												seat.heroId ??
												setup.picks[seat.id]?.heroId ??
												DEFAULT_HERO,
										}))
									: roster.length
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
										: practiceRoster(local, difficulty, setup.picks, setup.seed, [local], party),
							readyParty: party,
							readyPortal: true,
							...(isLobby && { posts: tune.lobby.portal.dummies }),
							spawns: lobbySpawns,
							respawn: tune.lobby.respawn,
							footprint: party ? null : gallery.contact,
						}),
						seed: setup.seed,
					}),
				kind,
			)
			// Assigned boxes are reservations, not won claims; walking into one stamps the claim tick.
			if (isLobby) for (const seat of simulation.readySeats.seats) seat.claimTick = null
			const ballView =
				mechanics.map((mechanic) => mechanicViews[mechanic.id]?.view).find(Boolean)?.(scene, {
					returnToLobby,
					canReturnToLobby: app.session.authoritative,
				}) ?? null
			const replica = !app.session.authoritative
				? isLobby
					? createLobbyReplica(simulation, scene)
					: party
						? createDungeonReplica(simulation, scene)
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
				mechanics.map((mechanic) => mechanicViews[mechanic.id]?.onboarding).find(Boolean)?.({
					scene,
					sim,
					hero,
				}) ?? null
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

			if (debugTune) {
				run.debug.tune(`lane/${debugTune.name}`, debugTune.values, debugTune.add, {
					units: (o, key, dotted) => resolveUnit(`${debugTune.name}.${dotted}`),
				})
				const repaint = () => {
					Object.assign(palette, maps[kind].palette())
					restyle()
					app.setPalette(palette)
				}
				for (const [section, add] of Object.entries(styleKnobs))
					if (debugTune.values[section])
						run.debug.tune(
							`style/${debugTune.name}/${section}`,
							debugTune.values[section],
							(f, o) => {
								add(f, o)
								for (const c of f.controllers) c.onChange(repaint)
							},
							{
								onChange: repaint,
								units: (o, key, dotted) => resolveUnit(`${debugTune.name}.${section}.${dotted}`),
							},
						)
			}
			const lobby = isLobby
				? createPortalLobby({
						app,
						run,
						sim,
						hero,
						setup,
						options,
						gallery,
						onPresent,
					})
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
			function returnToLobby(next = lobbyReturn(), following = false) {
				if (app.session.shared && !app.session.authoritative && !following) return false
				if (!app.session.shared && !party) return false
				if (returnQueued) return true
				returnQueued = true
				const session = app.session
				// Never tear down a sim from inside its fixed step or a wire callback.
				queueMicrotask(() => {
					if (run.signal.aborted) return
					app.modes.start('moba-lobby', {
						session,
						roster: next.roster,
						options: {
							setup: { ...next.setup, edgePan: setup.edgePan },
							...(app.session.shared ? { sharedLobby: next } : {}),
						},
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
			const controls = createMatchDebug({
				app,
				run,
				sim,
				local,
				menu,
				setup,
				botsOnly,
				isLobby,
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
			run.system('input', () => {
				playerControls.throwClick =
					!!sim.ball?.carrying(hero) || !!hero.definition.outOfPlay?.({ hero, sim })
			})
			run.signal.addEventListener(
				'abort',
				() => {
					playerControls.throwClick = false
				},
				{ once: true },
			)

			const onPad = () => input.activeDevice() === 'gamepad'
			// Keyboard only aims like the pad, so it frames, hovers and draws like the pad too.
			const stickAimed = () => onPad() || playerControls.preset === 'keyboard'
			if (!isLobby)
				run.camera.frame((dt) => {
					const frame = app.intents.get(local)
					const pad = stickAimed() && !sim.lane?.match.winner
					const aim = pad && Object.keys(frame.held).length ? frame.aim : null
					return follow.frame(
						dt,
						hero.definition.outOfPlay?.({ hero, sim, alpha: 0 })?.position ??
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
			if (ballView) (replica?.onReportFact ?? onPresent)(ballView.present)
			const ballFacts = []
			run.on('present', (fact) => {
				if (!fact.type.startsWith('ball')) return
				ballFacts.push(fact)
				if (ballFacts.length > tune.proof.trace) ballFacts.shift()
			})

			const locate = (id) => {
				const unit = sim.find(id)
				return unit?.body.mesh?.position ?? unit?.body.position ?? null
			}
			run.system('present', ({ dt, gameDt, alpha }) => {
				menu.result(controls.paused ? 0 : dt, replica ? 0 : alpha)
				const frozen = menu.frozen() || controls.paused
				const presentationFrozen = menu.presentationFrozen() || controls.paused
				const blend = frozen || replica ? 0 : alpha
				const step = presentationFrozen ? 0 : sim.lane?.match.winner ? dt : gameDt
				map.update(step)
				const frame = app.intents.get(local)
				const outOfPlay = hero.definition.outOfPlay?.({ hero, sim, alpha: blend })
				const p = outOfPlay?.position ?? hero.body.mesh.position
				audio.setAudioListener(p)
				if (
					!hero.dead &&
					!blocked(hero, 'still', sim.tick) &&
					hero.body.animate(step, hero.cast || hero.attack || hero.ballThrow ? 1 : 0)
				)
					sfx.playOwn('step', p)
				for (const d of [...sim.heroes.filter((h) => h.id !== local), ...sim.dummies])
					if (!d.dead && !blocked(d, 'still', sim.tick))
						d.body.animate(step, d.cast || d.attack || d.ballThrow ? 1 : 0)
				for (const h of [...sim.heroes, ...sim.dummies])
					if (!h.dead && !blocked(h, 'still', sim.tick))
						h.body.poseAbility?.(h.cast, blend, h, sim.tick)
				// Your own hero wears the cream ring; a redress (lobby seat swap) rebuilds it hidden.
				for (const h of sim.heroes) h.body.setYours?.(h.id === local)
				const target =
					!sim.ball?.carrying(hero) && !stickAimed() && frame.aim
						? sim.pick(hero.team, frame.aim)
						: null
				const hovered = target && locate(target.id)
				const aiming = ['slot1', 'slot2', 'slot3', 'slot4'].some((s) => frame.held[s])
				cursor.update({
					enemy: !!target,
					aiming,
					armed: playerControls.attackArmed || playerControls.preset === 'wasd', // either click attacks
					pad: stickAimed(),
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
				fog?.update(sim, hero.team, options.ready?.() ?? true)
				const unseen = (unit) => fog && !fog.seen.has(unit.id)
				const lineAbility = outOfPlay
					? outOfPlay.cast || frame.held.slot1
						? outOfPlay.abilities.slot1
						: null
					: hero.cast
						? castAbility(hero)
						: Object.entries(hero.definition.abilities).find(
								([slot, ability]) => frame.held[slot] && ability?.held === 'line',
							)?.[1]
				const gone = view.update(step, {
					live: new Set(sim.shots.map((s) => s.id)),
					hero: outOfPlay?.aimOrigin ?? p,
					aim: hero.cast && lineAbility?.tell === 'line' ? hero.cast.target : frame.aim,
					lineStats: lineAbility?.stats,
					target: aiming && !stickAimed() ? frame.aim : null,
					obstacles: sim.obstacles,
					bounds: sim.bounds,
					held:
						(!hero.dead || !!outOfPlay) &&
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
					units: [...sim.heroes, ...sim.dummies].filter((u) => u.team === hero.team || !unseen(u)),
					lobby: isLobby,
					tick: sim.tick,
					bounds: sim.bounds,
					obstacles: sim.obstacles,
					boards: sim.boards,
					cutouts: sim.cutouts,
					summons: sim.summons.filter((u) => u.team === hero.team || !unseen(u)),
					groundFields: sim.groundFields,
					zones: sim.zones,
					casters: [...sim.heroes, ...sim.dummies].filter(
						(unit) => unit.team !== hero.team && !unseen(unit),
					),
					alpha: blend,
				})
				feedback.fizzle(gone)
				juice.update(step)
				stamps.update(step)
				feedback.stride(hero)
				recallView?.update(step, {
					heroes: sim.heroes.filter((h) => h.team === hero.team || !unseen(h)),
					camera: app.camera.view,
				})
				shadows.update((cast) => {
					for (const d of [...sim.heroes, ...sim.dummies]) {
						if (d.dead || unseen(d)) continue
						const q = d.body.mesh.position
						cast(q.x, q.y - d.body.radius - d.body.halfHeight, q.z, 0.5)
					}
				})
				const device =
					lobby?.touchMode() && input.activeDevice() !== 'gamepad' ? 'touch' : input.activeDevice()
				hud.update(dt, {
					...(lobby ? lobby.hudFrame(blend) : matchFrame(sim, hero, blend, app.clock.step)),
					seen: fog?.seen,
					aim: frame.aim,
					camera: app.camera.view,
					pad: input.pad(),
					device,
				})
				stepCamera(app.camera, presentationFrozen ? 0 : dt)
				lobby?.update(blend)
				view.health(
					[
						...sim.heroes,
						...sim.dummies,
						...(sim.lane?.minions ?? []),
						...(sim.lane?.structures ?? []),
					].filter((unit) => !unseen(unit)),
					app.camera.view,
					app.renderer.domElement.getBoundingClientRect(),
					local,
					hero.team,
					names,
				)
				pips.update(
					app.camera.view,
					[...sim.heroes, ...sim.dummies].filter((unit) => !unseen(unit)),
					hero.team,
					{
						hero,
						ball: null, // Onboarding owns the team-coloured objective pointer.
						carrying: sim.ball?.carrying(hero) ?? false,
					},
				)
				onboarding?.update({
					camera: app.camera.view,
					alpha: blend,
					ballPosition: ballView?.markerPosition,
					frozen,
					device,
				})
			})

			run.on('blur', () => app.intents.cancel(local))

			addSliders(run.debug, sliderSections(tune, look, setup, kind, cameraTune), app.clock.step, {
				follow: (f) =>
					f
						.add(cameraTune, 'edgePan')
						.name('edge pan')
						.onChange((value) => {
							setup.edgePan = value
						}),
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
				recallView?.dispose()
				baseView?.dispose()
				fog?.dispose()
				hud.dispose()
				pips.dispose()
				juice.dispose()
				stamps.dispose()
				shadows.dispose()
			})

			const names = new Map()
			// Mid-lane, a late human takes a bot's seat as it stands, on the side with fewer humans.
			let seating = null
			function seatLate({ joinOrder, prefer = null }) {
				if (!openSeats()) return null
				const humans = (team) =>
					seats.filter((seat) => seat.team === team && seat.controller === 'human').length
				// A refreshed tab gets its own hero back, as the bot left it.
				const index = seats
					.map((seat, i) => i)
					.filter((i) => seats[i].controller === 'bot')
					.sort(
						(a, b) =>
							(seats[b].id === prefer) - (seats[a].id === prefer) ||
							humans(seats[a].team) - humans(seats[b].team) ||
							a - b,
					)[0]
				const seat = seats[index]
				if (!sim.releaseBot(seat.id)) return null
				seats[index] = { ...seat, controller: 'human', joinOrder }
				seating = {
					id: (seating?.id ?? 0) + 1,
					tick: sim.tick,
					roster: seats.map(({ id, team, heroId, controller, joinOrder }) => ({
						id,
						team,
						heroId,
						controller,
						...(controller === 'human' ? { joinOrder } : {}),
					})),
					setup: { ...structuredClone(setup), edgePan: false },
				}
				return { id: seat.id, team: seat.team, data: { heroId: seat.heroId } }
			}
			function openSeats() {
				return (
					!isLobby &&
					app.session.authoritative &&
					app.session.shared &&
					!sim.lane?.match.winner &&
					seats.some((seat) => seat.controller === 'bot')
				)
			}
			return {
				openSeats,
				seatLate,
				// Online's sticker names by participant id; heroes without one show their hero.
				names(byId) {
					lobby?.names?.(byId)
					names.clear()
					for (const [id, name] of Object.entries(byId)) if (name) names.set(id, name)
				},
				capacity: party ? tune.lobby.partyCapacity : tune.lobby.capacity,
				joinData: () => ({ heroId: hero.heroId }),
				validJoinData: (data) =>
					data?.heroId == null ||
					(party ? HEROES[data.heroId]?.playable : HEROES[data.heroId]?.listed) === true,
				epoch,
				loadingHero: () => ({ x: hero.body.position.x, z: hero.body.position.z }),
				roomLobby: isLobby,
				roomOptions: () =>
					party
						? {
								setup: {
									map: setup.map,
									difficulty: setup.difficulty,
									seed: setup.seed,
									seeded: true,
								},
								...(isLobby
									? {
											partyBots: sim.readySeats
												.laneRoster(local, difficulty, setup.seed)
												.filter((seat) => seat.controller === 'bot'),
										}
									: {}),
							}
						: undefined,
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
					const index = isLobby ? -1 : seats.findIndex((seat) => seat.id === id)
					if (index < 0 || seats[index].controller !== 'human') {
						departed.add(id)
						return sim.removeHero(id)
					}
					// Mid-lane a leaver's hero plays on as a bot, and the seat is open to the next link.
					const seat = { ...seats[index], controller: 'bot' }
					delete seat.joinOrder
					seats[index] = seat
					if (app.session.authoritative)
						sim.adoptBot({ ...seat, difficulty: seat.difficulty ?? setup.difficulty })
					return true
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
					...(seating && (sim.tick - seating.tick) * app.clock.step < tune.lobby.handoffFor
						? { seating: { id: seating.id, roster: seating.roster, setup: seating.setup } }
						: {}),
					...(lobby?.handoff ||
					(options.handoff &&
						(!(options.ready?.() ?? true) || sim.tick * app.clock.step < tune.lobby.handoffFor))
						? { handoff: lobby?.handoff ?? options.handoff }
						: {}),
				}),
				apply(state, nowSeconds) {
					const next = state?.lobbyReturn
					if (!lobby && next && next.id !== options.sharedLobby?.id) {
						if (app.session.authoritative || !app.session.shared || !validPlan(next, local))
							return false
						return returnToLobby(structuredClone(next), true)
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

// A room plan from the host (a lobby return or a late seating): seats, map and seed, with the local player seated.
function validPlan(next, local) {
	return (
		Number.isSafeInteger(next?.id) &&
		next.id >= 0 &&
		Array.isArray(next.roster) &&
		next.roster.length > 0 &&
		next.roster.length <=
			(maps[next.setup?.map]?.party ? tune.lobby.partyCapacity : tune.lobby.capacity) &&
		new Set(next.roster.map((seat) => seat?.id)).size === next.roster.length &&
		next.roster.some((seat) => seat.id === local && seat.controller === 'human') &&
		next.roster.every(
			(seat) =>
				typeof seat?.id === 'string' &&
				['A', 'B'].includes(seat.team) &&
				(maps[next.setup?.map]?.party
					? seat.team === 'A' && HEROES[seat.heroId]?.playable
					: HEROES[seat.heroId]?.listed) &&
				['human', 'bot'].includes(seat.controller) &&
				(seat.controller === 'bot' ||
					(Number.isSafeInteger(seat.joinOrder) && seat.joinOrder >= 0)),
		) &&
		onlineMaps.includes(next.setup?.map) &&
		['easy', 'normal', 'hard'].includes(next.setup.difficulty) &&
		Number.isSafeInteger(next.setup.seed) &&
		next.setup.seed >= 0 &&
		next.setup.seed <= tune.testing.seedMax
	)
}

// A fact is a known type carrying plain data: finite numbers, strings, booleans and nulls, shallowly nested.
export function validFact(fact) {
	if (!fact || typeof fact !== 'object' || !FACTS.includes(fact.type)) return false
	const plain = (v, depth) => {
		if (v === null || typeof v === 'string' || typeof v === 'boolean') return true
		if (typeof v === 'number') return Number.isFinite(v)
		if (depth > (fact.type === 'pull' ? 3 : 2) || typeof v !== 'object' || Array.isArray(v))
			return false
		return Object.values(v).every((x) => plain(x, depth + 1))
	}
	return plain(fact, 0)
}
