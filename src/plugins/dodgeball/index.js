import * as THREE from 'three'
import { createShadows } from '../../core/shadows.js'
import { tune as coreTune } from '../../core/tune.js'
import { tune } from './tune.js'
import { createImpactBeat } from './impact.js'
import { scenarioFromURL } from './scenario.js'
import { buildCourt } from './court.js'
import { onCourt } from './arena.js'
import { createMatchFlow } from './matchflow.js'
import { aimArrowSpeed } from './arrow.js'
import { WEAPONS, TRAIL } from './weapons.js'
import { createActions, aimAt } from './actions.js'
import { handPoint } from './loadout.js'
import { createWeaponHud } from './weaponhud.js'
import { createGodmodeFx } from './godmodefx.js'
import { createFeedback } from './feedback.js'
import { validFact } from './replica.js'
import { createAimPreview } from './aim.js'
import { createScoreboard } from './scoreboard.js'
import { createSandbox } from './sandbox.js'

// Charge ticks only on rising steps, with a brighter cue on entering the perfect band.
const CHARGE_STEP = 0.16

// Dodgeball: the court, its presentation and debug tools live as long as the plugin; the match flow lives as long as a run of the mode.
export default function dodgeball(app, { hubExit = null } = {}) {
	const { scene, world, RAPIER, input, audio, overlay, camera } = app
	const { sfx } = audio
	const { combat } = app.debug
	const hud = document.querySelector('.hud')
	const scoreEl = document.querySelector('.score')
	const fadeEl = document.querySelector('.fade')
	const splashEl = document.querySelector('.splash')
	const exitEl = splashEl.querySelector('.hub-exit')
	const hitConfirmation = document.querySelector('.hit-confirmation')
	const hitmarker = document.querySelector('.hitmarker')

	const impact = createImpactBeat()
	const godmodeFx = createGodmodeFx(scene)
	const shadows = createShadows(scene, { onGround: onCourt })
	const feedback = createFeedback(scene, {
		sfx,
		addShake: camera.shake,
		kickFov: camera.kick,
		confirm(text) {
			hitConfirmation.textContent = text
			hitConfirmation.hidden = !text
		},
	})

	// Court and contact queue persist; only round.js entities come and go.
	const court = buildCourt(scene, world, RAPIER)
	court.setShown(false) // until the dodgeball mode runs
	const scoreboard = createScoreboard(scoreEl, court)
	const eventQueue = new RAPIER.EventQueue(true)
	function applyCourtTheme(enemies) {
		const theme = court.setTheme(enemies >= 3 ? 'gym' : enemies === 2 ? 'sunset' : 'park')
		app.setPalette(theme.palette)
		document.documentElement.style.setProperty(
			'--page-bg',
			`#${theme.palette.page.toString(16).padStart(6, '0')}`,
		)
	}

	// The run's flow and seats; the session says which verbs the local player has.
	let flow = null
	let actions = createActions()
	const may = (verb) => app.session.actions.includes(verb)

	// Flick the hitmarker at a world point (the near-miss or the eliminated unit), restarting its CSS animation via a forced reflow.
	const _hm = new THREE.Vector3()
	function hitmark(kind, point) {
		if (!point) return
		_hm.set(point.x, point.y, point.z).project(camera.view)
		hitmarker.style.left = `${((_hm.x + 1) / 2) * 100}%`
		hitmarker.style.top = `${((1 - _hm.y) / 2) * 100}%`
		hitmarker.classList.remove('near', 'kill')
		void hitmarker.offsetWidth
		hitmarker.classList.add(kind)
	}

	// Services a Round borrows. The court/world persist; the round fills the rest.
	const ctx = {
		scene,
		world,
		RAPIER,
		eventQueue,
		combat,
		get obstacles() {
			return court.obstacles
		},
		present: (fact) => app.present(fact),
		smooth: app.smooth,
	}

	// The fact router: which facts rumble, mark, react and refresh the HUD.
	function route(event) {
		const localId = flow.round?.localPlayer?.id
		event = {
			...event,
			source: event.source && { ...event.source, isLocal: event.source.id === localId },
			target: event.target && { ...event.target, isLocal: event.target.id === localId },
		}
		const target = flow.round?.units.find((u) => u.id === (event.target?.id ?? event.source?.id))
		if (tune.fx.impact && impact.trigger(event)) input.rumble(0.35, 0.6, 85)
		if (event.type === 'dash' && event.source?.isLocal) input.rumble(0.15, 0.3, 55)
		if (event.type === 'shot' && event.source?.isLocal && event.perfect) input.rumble(0.2, 0.4, 65)
		if (event.outcome === 'nearMiss') {
			if (event.target?.isLocal) input.rumble(0.25, 0.1, 60)
			if (event.source?.isLocal) hitmark('near', event.point)
		} else if (event.outcome === 'eliminated' && event.source?.isLocal)
			hitmark('kill', target?.position ?? event.point)
		target?.react(event)
		feedback.present(event, target?.visual)
		if (event.source?.isLocal && (event.type === 'shot' || event.type === 'pickup')) {
			if (event.type === 'pickup') weaponHud.emphasizePickup()
			updateHud()
		}
		if (event.outcome === 'eliminated' && event.target.isLocal) {
			aim.hide()
			updateHud()
		}
	}

	function clearActions() {
		app.intents.cancel()
		actions.cancel()
		app.clock.reset()
	}
	function resetPresentation() {
		feedback.reset()
		weaponHud.reset()
		impact.reset()
	}
	const renderScore = () => scoreboard.render(flow)

	// --- Weapons and aim -------------------------------------------------------
	// Human seats hold the weapon and the bow's charge meter (actions.js). The simulation drives them; a replica previews its own.
	const local = () => app.session.local[0]
	const mySeat = () => actions.seat(local())
	let shownWeapon = 'bow'
	let chargeStep = 0
	let chargePerfect = false

	// A weapon button is one more device: it presses the weapon's slot.
	const weaponHud = createWeaponHud({
		onSelect: (w) => app.intents.press(local(), WEAPONS[w].slot),
	})

	const aimDir = new THREE.Vector3(0, 0, -1)
	const _hand = new THREE.Vector3()
	const aim = createAimPreview(scene, app.renderer.domElement)

	// Present the local seat: switch feedback, charge ticks, and the aim preview from the rendered hand to the frame's ground point.
	function presentAim(show) {
		const seat = mySeat()
		if (seat.weapon !== shownWeapon) {
			shownWeapon = seat.weapon
			sfx.switch()
			combat.push(`weapon → ${WEAPONS[seat.weapon].label}`, 'pickup')
			updateHud()
		}
		const h = flow.round?.localPlayer
		const target = app.intents.get(local()).aim
		if (!show || !h?.alive || !h.heldArrow || !target) {
			aim.hide()
			return
		}
		const p = h.mesh.position
		aimDir.set(target.x - p.x, 0, target.z - p.z)
		const dist = Math.hypot(aimDir.x, aimDir.z)
		if (dist < 1e-4) aimDir.set(0, 0, -1)
		aimDir.normalize()
		const hand = handPoint(p, aimDir, _hand)
		if (seat.weapon !== 'bow') {
			// The bowl rolls along the ground.
			aim.untarget()
			aim.ground(hand, aimDir)
			return
		}
		// Ratchet ticks: rising pitch per step up, brighter cue entering perfect.
		const { meter } = seat
		if (meter.charging) {
			const step = Math.floor(meter.value / CHARGE_STEP)
			if (step > chargeStep) sfx.tick(meter.value)
			chargeStep = step
			if (meter.perfect && !chargePerfect) sfx.tickPerfect()
			chargePerfect = meter.perfect
		} else {
			chargeStep = 0
			chargePerfect = false
		}
		const targetDistance = Math.max(0, dist - 0.6) // measured from the hand, not feet
		const speed = aimArrowSpeed(targetDistance, hand.y, meter.previewSpeed())
		aim.arc(hand, aimDir, speed, meter.perfect ? TRAIL.perfect : TRAIL.arrow)
		aim.target(target, meter.perfect)
	}

	// The hub's way out: Esc, the pad's View button (B is dash here) or the round arrow.
	const canExit = () =>
		!!hubExit && !app.session.shared && flow?.phase === 'menu' && !flow.transitioning
	function leaveHub() {
		if (!canExit()) return
		sfx.menuClose()
		hubExit.onSelect()
	}
	function updateHud() {
		const exitKey = input.activeDevice() === 'gamepad' ? 'View' : 'Esc'
		const keyEl = exitEl.querySelector('kbd')
		if (keyEl.textContent !== exitKey) keyEl.textContent = exitKey
		let music =
			flow.phase === 'menu'
				? 'hub'
				: flow.phase === 'playing'
					? 'play'
					: flow.phase === 'paused'
						? 'paused'
						: flow.winner === flow.round?.localPlayer?.team
							? 'victory'
							: flow.winner != null
								? 'defeat'
								: 'paused'
		if (flow.phase === 'playing' && flow.round) {
			const localTeam = flow.round.localPlayer.team
			const allies = flow.round.units.filter((u) => u.alive && u.team === localTeam).length
			const enemies = flow.round.units.filter((u) => u.alive && u.team !== localTeam).length
			if (allies === 1 && enemies > 0 && (flow.match.allies > 0 || enemies === 1)) music = 'clutch'
		}
		audio.setMusicScene(coreTune.physics.paused || flow.transitioning ? 'paused' : music)
		const { weapon, meter: charge } = mySeat()
		// Hub keeps the corner clear so the splash title owns it.
		if (flow.phase === 'menu') {
			hud.textContent = ''
			weaponHud.update({ weapon, charge, visible: false, holding: false })
			return
		}
		// Left stack is opt-in diagnostics; armed status belongs on the weapon HUD, never the scoreboard.
		const perf = app.debug.stats.perf
		hud.textContent =
			`G god · H ∞ammo · =/- foe · ]/[ ally\n` +
			`fps ${app.debug.stats.fps}  ${flow.phase}` +
			`${coreTune.physics.paused ? '  paused' : ''}` +
			`${tune.cheats.godmode ? '  GOD' : ''}` +
			`${tune.cheats.infiniteAmmo ? '  ∞' : ''}` +
			(perf?.ms.cpu
				? `\ncpu p95 ${perf.ms.cpu.p95.toFixed(1)}ms / 6.94ms\nsim ${perf.ms.simulation.p95.toFixed(1)} · render ${perf.ms.render.p95.toFixed(1)}ms`
				: '')
		scoreboard.sync(flow)
		weaponHud.update({
			weapon,
			charge,
			visible: flow.phase === 'playing' && !!flow.round?.localPlayer?.alive,
			device: input.activeDevice(),
			pausable: may('pause'),
			holding: !!(flow.round && flow.round.localPlayer && flow.round.localPlayer.heldArrow),
		})
	}

	// --- Debug GUI and window.game ---------------------------------------------
	app.debug.tune('shortcuts', {}, (f) => {
		for (const [key, action] of [
			['`', 'toggle debug'],
			['G / H', 'godmode / infinite ammo'],
			['= / −', 'add / remove enemy'],
			['] / [', 'add / remove ally'],
			['R', 'restart round'],
			['1 / 2', 'bow / bowl'],
			['Esc', 'pause / back'],
		])
			f.add({ key }, 'key').name(action).disable()
	})
	app.debug.tune('player', tune.player, (f, t) => {
		f.add(t, 'speed', 1, 20, 0.5)
		f.add(t, 'accel', 1, 40, 0.5).name('accel')
		f.add(t, 'friction', 0, 30, 0.5).name('friction')
		f.add(t, 'stopFriction', 0, 40, 0.5).name('stop friction')
		f.add(t, 'stopSpeed', 0.1, 10, 0.1).name('stop speed')
		f.add(t, 'airAccel', 0, 20, 0.5).name('air accel')
		f.add(t, 'airSpeedMul', 1, 2, 0.05).name('air speed ×')
		f.add(t, 'dashMul', 1, 5, 0.1).name('dash ×')
		f.add(t, 'dashTime', 0.05, 0.4, 0.01).name('dash time (s)')
		f.add(t, 'dashCooldown', 0.1, 2, 0.05).name('dash cooldown (s)')
	})
	app.debug.tune('arrow', tune.arrow, (f, t) => {
		f.add(t, 'maxSpeed', 10, 60, 0.5).name('max speed')
		f.add(t, 'launchAngle', 0, 60, 1).name('launch angle')
		f.add(t, 'linearDamping', 0, 2, 0.01).onChange(() => {
			if (flow?.round) for (const a of flow.round.arrows) a.applyDamping()
		})
	})
	app.debug.tune('weapons', tune.weapons, (f, t) => {
		f.add(t, 'chargeTime', 0.3, 2, 0.05).name('charge time (s)')
		f.add(t, 'chargeMin', 8, 30, 0.5).name('charge min spd')
		f.add(t, 'chargeMax', 12, 50, 0.5).name('charge max spd')
		f.add(t, 'perfectWindow', 0.02, 0.3, 0.01).name('perfect window')
		f.add(t, 'perfectMult', 1, 2.5, 0.05).name('perfect ×')
		f.add(t, 'bowlSpeed', 6, 30, 0.5).name('bowl speed')
		f.add(t, 'bowlRadius', 0.15, 1, 0.05).name('bowl radius')
		f.add(t, 'bowlDensity', 1, 10, 0.5).name('bowl density')
		f.add(t, 'bowlStop', 0.5, 8, 0.25).name('bowl stop spd')
	})
	app.debug.tune('ai', tune.ai, (f, t) => {
		f.add(t, 'enabled')
		f.add(t, 'reaction', 0, 2, 0.05).name('reaction (s)')
		f.add(t, 'jitter', 0, 0.6, 0.01).name('aim jitter (rad)')
		f.add(t, 'standoff', 2, 18, 0.5).name('standoff (m)')
	})
	app.debug.tune('fx', tune.fx, (f, t) => {
		f.add(t, 'trails')
		f.add(t, 'deathTime', 0.25, 3, 0.05).name('death length ×')
	})
	// godmode toggles live (also bound to the G key below).
	app.debug.tune('cheats', tune.cheats, (f, t) => {
		f.add(t, 'godmode').name('godmode (G)').listen()
		f.add(t, 'infiniteAmmo').name('infinite ammo (H)').listen()
	})
	const sandbox = createSandbox(app, {
		flow: () => flow,
		blocked: () => !may('cheat'),
		updateHud,
	})

	// Splash digits pick difficulty, play keys restart/cheat/edit teams, verdict overlays own R/Enter.
	function onKey(e) {
		if (e.defaultPrevented || e.repeat || e.code === 'Backquote') return
		// Without the pause verb, Escape opens whatever menu the session offers, as the HUD says.
		if (e.code === 'Escape' && !may('pause')) return app.emit('menu')
		if (flow.transitioning) return
		if (may('cheat') && e.code === 'KeyG') {
			tune.cheats.godmode = !tune.cheats.godmode
			combat.push(`godmode ${tune.cheats.godmode ? 'ON' : 'off'}`, tune.cheats.godmode ? 'win' : '')
			return
		}
		if (may('cheat') && e.code === 'KeyH') {
			tune.cheats.infiniteAmmo = !tune.cheats.infiniteAmmo
			combat.push(
				`infinite ammo ${tune.cheats.infiniteAmmo ? 'ON' : 'off'}`,
				tune.cheats.infiniteAmmo ? 'win' : '',
			)
			return
		}
		if (e.code === 'Escape') {
			if (flow.phase === 'playing' || flow.phase === 'paused') flow.togglePause()
			else if (flow.phase !== 'menu') flow.transition('BACK TO THE COURT', flow.enterHub)
			else leaveHub()
			return
		}
		// Number keys enter the matching difficulty portal.
		if (flow.phase === 'menu') {
			const pick = /^Digit([1-3])$/.exec(e.code)
			if (pick) flow.enterPortal(Number(pick[1]))
			return
		}
		if (flow.phase !== 'playing') return
		if (e.code === 'KeyR' && may('restart')) return flow.restartRound()
		if (!flow.round || !may('cheat')) return
		if (e.code === 'Equal') flow.round.addUnit('B')
		else if (e.code === 'Minus') flow.round.removeUnit('B')
		else if (e.code === 'BracketRight') flow.round.addUnit('A')
		else if (e.code === 'BracketLeft') flow.round.removeUnit('A')
	}

	let runs = 0
	app.modes.define('dodgeball', {
		scheme: 'direct',
		start(run, { roster }) {
			const session = app.session
			if (hubExit && !session.shared) {
				exitEl.hidden = false
				exitEl.onclick = leaveHub
				exitEl.onpointerenter = () => sfx.hover()
				run.signal.addEventListener('abort', () => (exitEl.hidden = true), { once: true })
			}
			let exitHeld = !!input.pad()?.buttons[8]
			court.setShown(true)
			actions = createActions()
			flow = createMatchFlow({
				ctx,
				overlay,
				fadeEl,
				splashEl,
				session,
				actions,
				clearActions,
				resetPresentation,
				onChange: renderScore,
				onTheme(enemies, layout = 'open') {
					applyCourtTheme(enemies)
					court.setLayout(layout)
				},
				onMenu: () => app.emit('menu'),
			})

			// The round steps while it is live: the hub or a match in play, nothing modal on top.
			let live = false
			const playable = () =>
				!!flow.round && !flow.transitioning && (flow.phase === 'playing' || flow.phase === 'menu')
			run.clock.pause(() => !live || (flow.phase !== 'playing' && flow.phase !== 'menu'))
			run.clock.scale((dt) => {
				const stopped = flow.phase === 'paused' || flow.transitioning || coreTune.physics.paused
				return stopped ? 1 : impact.step(dt)
			})
			// Nothing the player does while a modal, a transition or the debug pause holds the game reaches the round.
			run.intents.suspend(() => !playable() || coreTune.physics.paused)

			run.system('input', () => {
				const exitPressed = !!input.pad()?.buttons[8]
				if (exitPressed && !exitHeld) leaveHub()
				exitHeld = exitPressed
				const menuInput = input.consumeMenuInput()
				// A native modal (another plugin's panel) sits above the verdict card and takes the pad.
				if (!flow.transitioning && !document.querySelector('dialog[open]'))
					overlay.handleGamepad(menuInput)
				audio.setAudioListener(flow.round?.localPlayer?.position)
			})

			run.system('intents', ({ dt }) => {
				live = playable()
				if (session.authoritative) return
				// A replica turns its own unit to the cursor and previews its seat; the authority simulates the frame.
				const frame = app.intents.get(local())
				const h = flow.round?.localPlayer
				const armed = flow.phase === 'playing' && !!h?.alive && !!h.heldArrow
				if (h?.alive && flow.phase === 'playing') aimAt(h, frame.aim)
				actions.preview(local(), frame, dt, armed)
			})

			// Every human seat's frame runs through the same actions, then the round steps.
			run.system('simulate', (step) => flow.step(step, app.intents))

			let hudTimer = 0
			run.system('present', ({ dt, gameDt }) => {
				presentAim(live && flow.phase === 'playing' && !coreTune.physics.paused)
				// Replicas interpolate on wall-clock seconds; rounds ignore the argument.
				flow.round?.lateUpdate(performance.now() / 1000)
				if (live) {
					godmodeFx.update(dt, flow.round.localPlayer)
					if (flow.phase === 'menu') flow.checkPortals()
					// A destination portal can dispose this run during the proximity check.
					if (run.signal.aborted) return
				} else godmodeFx.update(0, flow.phase === 'paused' ? flow.round?.localPlayer : null)

				// Hub player proximity drives portal wake pops; outside the hub the portal list is empty.
				const lp = flow.round?.localPlayer
				const hubPlayer = flow.phase === 'menu' && lp && lp.alive ? lp.position : null
				for (const p of flow.portals) p.update(dt, hubPlayer)

				const frozen = flow.phase === 'paused' || flow.transitioning || coreTune.physics.paused
				if (flow.round && !frozen)
					for (const unit of flow.round.units) {
						const mine = unit === flow.round.localPlayer
						// A replica's own unit shows its preview charge rather than the authority's echo.
						const meter = mySeat().meter
						const windup =
							mine && !session.authoritative
								? flow.phase === 'playing' && meter.charging
									? meter.value
									: 0
								: (unit.windup ?? 0)
						const stepped = unit.updateVisual(gameDt, windup)
						if (stepped && mine && (flow.phase === 'playing' || flow.phase === 'menu'))
							sfx.step(unit.position)
					}
				const round = flow.round
				shadows.update(
					round &&
						((cast) => {
							// Shadows sit under what is rendered, not under the sim pose.
							for (const unit of round.units) {
								if (!unit.alive) continue
								const p = unit.mesh.position
								cast(p.x, p.y - 1, p.z, 0.46)
							}
							for (const arrow of round.arrows) {
								if (arrow.state !== 'flying') continue
								const p = arrow.kind === 'bowl' ? arrow.ball.position : arrow.mesh.position
								cast(p.x, p.y, p.z, arrow.kind === 'bowl' ? 0.5 : 0.2)
							}
						}),
				)
				feedback.update(frozen ? 0 : gameDt) // exits and confirmation finish even after the verdict
				camera.update(frozen ? 0 : dt)

				// Throttle HUD writes/allocations to ~10Hz, except while charging so the meter stays smooth.
				hudTimer += dt
				if (hudTimer >= 0.1 || mySeat().meter.charging) {
					hudTimer = 0
					updateHud()
				}
			})

			run.on('present', route)
			run.on('menu', () => {
				if (may('pause')) flow.togglePause()
			})
			run.on('blur', () => {
				if (!may('pause')) app.intents.cancel(local())
				else if (flow.phase === 'playing' && !flow.transitioning) flow.togglePause()
			})
			window.addEventListener('keydown', onKey, { signal: run.signal })

			run.signal.addEventListener('abort', () => {
				flow.dispose()
				flow = null
				splashEl.hidden = true
				aim.hide()
				resetPresentation()
				shadows.update(null)
				godmodeFx.update(0, null)
				overlay.hide()
				splashEl.hidden = true
				scoreEl.hidden = true
				hitConfirmation.hidden = true
				hitmarker.classList.remove('near', 'kill')
				weaponHud.update({ visible: false })
				hud.textContent = ''
				court.setShown(false)
			})

			if (roster.length) {
				// Sandbox settings stay out of a match that others share.
				if (!may('cheat')) {
					tune.cheats.godmode = false
					tune.cheats.infiniteAmmo = false
					coreTune.physics.paused = false
					coreTune.physics.timeScale = 1
					tune.ai.enabled = true
				}
				flow.startRoster(roster)
			} else {
				flow.enterHub()
				// A URL scenario sets up the first run only; later solo runs return to the hub.
				if (!runs)
					try {
						const setup = scenarioFromURL(location.search)
						if (setup) sandbox.start(setup)
					} catch (error) {
						app.debug.log.error('debug setup', error.message)
					}
			}

			return {
				epoch: ++runs,
				snapshot: flow.snapshot,
				apply: flow.apply,
				validFact,
			}
		},
	})

	return () => {
		shadows.dispose()
		eventQueue.free()
	}
}
