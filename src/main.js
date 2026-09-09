import { createOnlineMatch } from './online-match.js'
import { Net } from './net.js'
import { createOnlineSession } from './online-session.js'
import { createOnlineUi } from './online-ui.js'
import * as THREE from 'three'
import { createImpactBeat } from './impact.js'
import { makeStyleMaterial, FORWARD_LAYER } from './stylepass.js'
import { createPerformanceMonitor } from './performance.js'
import { PRESETS, scenario, scenarioFromURL } from './scenario.js'
import { initPhysics } from './physics.js'
import { createRenderer } from './render.js'
import { buildCourt } from './court.js'
import { createMatchFlow } from './matchflow.js'
import { aimArrowSpeed, clampArrowLanding, projectArrowFlight } from './arrow.js'
import { createOverlay } from './overlay.js'
import {
	moveVector,
	pointerNDC,
	consumePress,
	consumeRelease,
	clearShoot,
	pointerDown,
	pollGamepad,
	consumeDash,
	consumeJump,
	consumeMenuInput,
	activeDevice,
	consumeWeaponSwitch,
	consumePause,
	resetActions,
	rumble,
} from './input.js'
import { WEAPONS, TRAIL, createChargeMeter } from './weapons.js'
import { createWeaponHud } from './weaponhud.js'
import { setAudioListener, setSound, setMusicScene, sfx } from './audio.js'
import { tune } from './tune.js'
import { log, createDebugGui, createCombatLog } from './debug.js'
import { createGodmodeFx } from './godmodefx.js'
import { createShadows } from './shadows.js'
import { createFeedback } from './feedback.js'
import { createAimLine } from './aimline.js'
import { PALETTE, applyCssVariables } from './style.js'

const hud = document.querySelector('.hud')
const scoreEl = document.querySelector('.score')
const fadeEl = document.querySelector('.fade')
const splashEl = document.querySelector('.splash')

async function main() {
	applyCssVariables() // one palette drives both the WebGL world and the HTML chrome
	const { RAPIER, world } = await initPhysics()
	const {
		renderer,
		scene,
		camera,
		aimCamera,
		addShake,
		kickFov,
		updateCamera,
		render,
		setPalette,
	} = createRenderer()
	const perf = createPerformanceMonitor()
	const impact = createImpactBeat()
	let diagnostics = new URLSearchParams(location.search).has('debug')
	let gameApi = null
	const combatEl = document.querySelector('.combat')
	hud.hidden = !diagnostics
	combatEl.hidden = !diagnostics
	const combat = createCombatLog()
	const overlay = createOverlay()
	const godmodeFx = createGodmodeFx(scene)
	const shadows = createShadows(scene)
	const hitConfirmation = document.querySelector('.hit-confirmation')
	const feedback = createFeedback(scene, {
		sfx,
		addShake,
		kickFov,
		confirm(text) {
			hitConfirmation.textContent = text
			hitConfirmation.hidden = !text
		},
	})
	log.info('booted', { renderer: 'style-pass', physics: 'rapier' })

	// Mute the shared output so already-playing cues go silent too.
	const muteBtn = document.querySelector('.mute')
	function renderMute() {
		const muted = !tune.fx.sound
		muteBtn.textContent = muted ? '🔇' : '🔊'
		muteBtn.classList.toggle('muted', muted)
		muteBtn.title = muted ? 'Unmute' : 'Mute'
		muteBtn.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound')
		muteBtn.setAttribute('aria-pressed', String(muted))
	}
	muteBtn.addEventListener('click', () => {
		setSound(!tune.fx.sound)
		renderMute()
		if (tune.fx.sound) sfx.switch() // audible confirmation when unmuting
	})
	renderMute()

	// Court and contact queue persist; only round.js entities come and go.
	const court = buildCourt(scene, world, RAPIER)
	function applyCourtTheme(enemies) {
		const theme = court.setTheme(enemies >= 3 ? 'gym' : enemies === 2 ? 'sunset' : 'park')
		setPalette(theme.palette)
		document.documentElement.style.setProperty(
			'--page-bg',
			`#${theme.palette.page.toString(16).padStart(6, '0')}`,
		)
	}
	const eventQueue = new RAPIER.EventQueue(true)
	world.timestep = 1 / 60

	// Flick the hitmarker at a world point (the near-miss or the eliminated unit), restarting its CSS animation via a forced reflow.
	const hitmarker = document.querySelector('.hitmarker')
	const _hm = new THREE.Vector3()
	function hitmark(kind, point) {
		if (!point) return
		_hm.set(point.x, point.y, point.z).project(camera)
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
		present(event) {
			const localId = flow.round?.localPlayer?.id
			event = {
				...event,
				source: event.source && { ...event.source, isLocal: event.source.id === localId },
				target: event.target && { ...event.target, isLocal: event.target.id === localId },
			}
			const target = flow.round?.units.find((u) => u.id === (event.target?.id ?? event.source?.id))
			if (tune.fx.impact && impact.trigger(event)) rumble(0.35, 0.6, 85)
			if (event.type === 'dash' && event.source?.isLocal) rumble(0.15, 0.3, 55)
			if (event.type === 'shot' && event.source?.isLocal && event.perfect) rumble(0.2, 0.4, 65)
			if (event.outcome === 'nearMiss') {
				if (event.target?.isLocal) rumble(0.25, 0.1, 60)
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
				hideAim()
				charge.cancel()
				updateHud()
			}
		},
	}

	let humanDashBuffer = 0
	let humanJumpBuffer = 0
	function clearActions() {
		resetActions()
		humanDashBuffer = 0
		humanJumpBuffer = 0
		charge.cancel()
		acc = 0
	}
	const portalOptions = [...splashEl.querySelectorAll('.portal-option')]
	let onlineMatch = null
	let flow = createMatchFlow({
		ctx,
		overlay,
		fadeEl,
		splashEl,
		portalOptions,
		clearActions,
		resetPresentation() {
			feedback.reset()
			weaponHud.reset()
			impact.reset()
		},
		onChange: renderScore,
		onTheme(enemies, layout = 'open') {
			applyCourtTheme(enemies)
			court.setLayout(layout)
		},
	})

	const soloFlow = flow
	let debugGui
	const net = new Net()
	const online = createOnlineSession(net, {
		onChange(state, message) {
			onlineUi.render(state, message)
			if (debugGui) debugGui.domElement.inert = !!state
		},
		onStart(roster, matchId) {
			soloFlow.cancelTransition()
			soloFlow.dispose()
			onlineMatch?.dispose()
			tune.cheats.godmode = false
			tune.cheats.infiniteAmmo = false
			tune.physics.paused = false
			tune.physics.timeScale = 1
			tune.ai.enabled = true
			applyCourtTheme(3)
			onlineMatch = createOnlineMatch({
				ctx,
				net,
				roster,
				matchId,
				overlay,
				clearActions,
				resetPresentation() {
					feedback.reset()
					weaponHud.reset()
					impact.reset()
				},
				onChange: renderScore,
				onLobby(leave = false, message = '') {
					if (leave) {
						online.leave()
						if (message) onlineUi.show(message)
					} else online.backToLobby()
				},
			})
			flow = onlineMatch
			splashEl.hidden = true
			onlineUi.hide()
			renderScore()
		},
		onAbort(message) {
			if (onlineMatch) {
				onlineMatch.dispose()
				onlineMatch = null
				flow = soloFlow
				flow.enterHub()
			}
			clearActions()
			if (online.state || message) onlineUi.show(message)
		},
		onMessage(type, data, from) {
			onlineMatch?.receive(type, data, from)
		},
	})
	const onlineUi = createOnlineUi(online, {
		onOpen() {
			clearActions()
		},
		onClose() {
			clearActions()
		},
	})

	// --- Scoreboard ------------------------------------------------------------
	// YOU/FOE pips imply best-of; CSS dots avoid Darumadrop's fallback glyph shapes.
	function pips(n) {
		let s = ''
		for (let i = 0; i < flow.match.needed; i++) {
			s += `<span class="pip${i < n ? ' on' : ''}"></span>`
		}
		return s
	}
	// Filled marks count survivors; beyond MAX_MARKS use one mark plus a number so debug-sized teams still fit.
	const MAX_MARKS = 6
	function roster(team) {
		if (!flow.round) return ''
		let alive = 0
		let total = 0
		for (const u of flow.round.units) {
			if (u.team !== team) continue
			total++
			if (u.alive) alive++
		}
		if (total > MAX_MARKS) {
			return `<span class="unit${alive ? ' up' : ''}"></span><span class="count">${alive}</span>`
		}
		let s = ''
		for (const u of flow.round.units) {
			if (u.team !== team) continue
			s += `<span class="unit${u.alive ? ' up' : ''}"></span>`
		}
		return s
	}
	function renderScore() {
		court.updateScore(
			flow.phase === 'menu' ? 0 : flow.match.wins.A,
			flow.phase === 'menu' ? 0 : flow.match.wins.B,
		)
		if (flow.phase === 'menu') {
			scoreEl.hidden = true
			return
		}
		scoreEl.hidden = false
		scoreEl.innerHTML =
			`<span class="side a"><span class="name">${flow.round?.localPlayer?.team === 'B' ? 'Foe' : 'You'}</span>` +
			`<span class="crew">${roster('A')}</span>` +
			`<span class="pips">${pips(flow.match.wins.A)}</span></span>` +
			`<span class="mid">Round ${flow.match.round}</span>` +
			`<span class="side b"><span class="pips">${pips(flow.match.wins.B)}</span>` +
			`<span class="crew">${roster('B')}</span>` +
			`<span class="name">${flow.round?.localPlayer?.team === 'B' ? 'You' : 'Foe'}</span></span>`
	}
	// Cheap per-frame refresh: only touch the DOM when someone actually goes out.
	let lastRoster = ''
	function syncRoster() {
		if (flow.phase === 'menu' || !flow.round) return
		const key = `${roster('A')}|${roster('B')}`
		if (key === lastRoster) return
		lastRoster = key
		const crews = scoreEl.querySelectorAll('.crew')
		if (crews.length === 2) {
			crews[0].innerHTML = roster('A')
			crews[1].innerHTML = roster('B')
		}
	}

	// --- Weapons (1/2) ---------------------------------------------------------
	// Shooter weapon changes how pooled arrows launch; the bow's charge meter stays a separate component.
	let weapon = 'bow'
	const charge = createChargeMeter()

	// Charge ticks only on rising steps, with a brighter cue on entering the perfect band.
	const CHARGE_STEP = 0.16
	let chargeStep = -1
	let chargePerfect = false

	function setWeapon(w) {
		if (weapon === w || !WEAPONS[w]) return
		weapon = w
		charge.cancel()
		sfx.switch()
		combat.push(`weapon → ${WEAPONS[w].label}`, 'pickup')
		updateHud()
	}

	const weaponHud = createWeaponHud({ onSelect: setWeapon })

	// --- Aim: raycast the pointer onto the ground plane (reads the live human) --
	const raycaster = new THREE.Raycaster()
	const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
	const aimTarget = new THREE.Vector3()
	const aimDir = new THREE.Vector3(0, 0, -1)
	let aimSpeed = tune.arrow.impulse

	// Back the landing reticle's ammo yellow with ink so it reads against the similarly valued green court.
	const aimMarker = new THREE.Mesh(
		new THREE.RingGeometry(0.26, 0.38, 24),
		new THREE.MeshBasicMaterial({ color: PALETTE.ammo, transparent: true, depthWrite: false }),
	)
	aimMarker.layers.set(FORWARD_LAYER)
	aimMarker.rotation.x = -Math.PI / 2
	aimMarker.visible = false
	const markerInk = new THREE.Mesh(
		new THREE.RingGeometry(0.22, 0.42, 24),
		makeStyleMaterial('ink', { flat: true }),
	)
	markerInk.position.z = -0.01 // the parent's local -z is world down once rotated
	aimMarker.add(markerInk)
	scene.add(aimMarker)

	// The hollow cursor is the requested target; the solid dot is actual touchdown.
	const targetMarker = aimMarker.clone(true)
	targetMarker.material = aimMarker.material.clone()
	scene.add(targetMarker)
	aimMarker.geometry = new THREE.CircleGeometry(0.14, 24)
	markerInk.geometry = new THREE.CircleGeometry(0.2, 24)

	const PREVIEW_N = 32
	const previewPos = new Float32Array(PREVIEW_N * 3)
	const previewDistance = new Float32Array(PREVIEW_N)
	const previewHeight = new Float32Array(PREVIEW_N)
	const preview = createAimLine(scene, { samples: PREVIEW_N })

	function hideAim() {
		renderer.domElement.style.cursor = ''
		preview.hide()
		aimMarker.visible = false
		targetMarker.visible = false
	}

	// Aim every frame and fire per the selected weapon. dt drives the charge meter.
	function weaponUpdate(dt) {
		const h = flow.round && flow.round.localPlayer
		if (!h || !h.alive || !h.heldArrow) {
			hideAim()
			clearShoot()
			charge.cancel()
			return
		}
		raycaster.setFromCamera(pointerNDC(), aimCamera)
		if (!raycaster.ray.intersectPlane(groundPlane, aimTarget)) {
			hideAim()
			return
		}
		const p = h.mesh.position
		aimDir.set(aimTarget.x - p.x, 0, aimTarget.z - p.z)
		const dist = Math.hypot(aimDir.x, aimDir.z)
		if (dist < 1e-4) aimDir.set(0, 0, -1)
		aimDir.normalize()
		h.aim.copy(aimDir)
		const hand = h.handPosition()
		const def = WEAPONS[weapon]

		// The bow loads on hold and fires on release — its own input model.
		if (weapon === 'bow') {
			if (consumePress()) {
				if (onlineMatch && !sendOnlineInput('press', true)) return
				charge.press()
				chargeStep = 0
				chargePerfect = false
			}
			if (pointerDown()) charge.update(dt)
			// Ratchet ticks: rising pitch per step up, brighter cue entering perfect.
			if (charge.charging) {
				const step = Math.floor(charge.value / CHARGE_STEP)
				if (step > chargeStep) sfx.tick(charge.value)
				chargeStep = step
				if (charge.perfect && !chargePerfect) sfx.tickPerfect()
				chargePerfect = charge.perfect
			}
			const targetDistance = Math.max(0, dist - 0.6) // measured from the hand, not feet
			aimSpeed = aimArrowSpeed(targetDistance, hand.y, charge.previewSpeed())
			updateArc(hand, aimSpeed, charge.perfect ? TRAIL.perfect : TRAIL.arrow)
			targetMarker.position.set(aimTarget.x, 0.04, aimTarget.z)
			targetMarker.visible = true
			// Canvas only: HUD buttons and overlays retain their normal pointers.
			renderer.domElement.style.cursor = 'none'
			const onTarget =
				aimMarker.visible &&
				Math.hypot(aimMarker.position.x - aimTarget.x, aimMarker.position.z - aimTarget.z) < 0.3
			targetMarker.material.color.set(
				onTarget ? (charge.perfect ? TRAIL.perfect : PALETTE.ammo) : PALETTE.cream,
			)
			if (consumeRelease()) {
				if (onlineMatch && !sendOnlineInput('release', true)) return
				const shot = charge.release()
				if (shot) {
					if (!onlineMatch)
						flow.round.looseHuman(aimDir, aimArrowSpeed(targetDistance, hand.y, shot.speed), {
							kind: 'arrow',
							perfect: shot.perfect,
						})
					charge.cancel()
					hideAim()
				}
			} else if (charge.charging && !pointerDown()) {
				charge.cancel() // lost the button without a clean release (blur) — no shot
			}
			return
		}

		targetMarker.visible = false
		renderer.domElement.style.cursor = ''
		// The bowl rolls along the ground and fires on click.
		aimSpeed = tune.weapons.bowlSpeed
		updateGroundLine(hand)
		if (consumePress()) {
			if (onlineMatch) {
				sendOnlineInput('press', true)
				return
			} else flow.round.looseHuman(aimDir, aimSpeed, { kind: def.kind })
		}
	}

	function sendOnlineInput(action = null, force = false) {
		if (!onlineMatch) return
		const blocked = onlineUi.open || document.hidden || !document.hasFocus()
		const activeMatch = onlineMatch
		activeMatch.setInput(
			{
				move: blocked ? { x: 0, z: 0 } : moveVector(),
				target: { x: aimTarget.x, z: aimTarget.z },
				weapon,
				down: !blocked && pointerDown(),
			},
			blocked ? 'cancel' : action,
			force,
		)
		return onlineMatch === activeMatch
	}

	// Share damped flight and the projectile's court clamp so preview endpoint, marker and grounded ammo agree.
	function updateArc(hand, speed, color) {
		const distance = projectArrowFlight(speed, hand.y, previewDistance, previewHeight)
		if (distance === null) {
			hideAim()
			return
		}
		for (let i = 0; i < PREVIEW_N; i++) {
			previewPos[i * 3] = hand.x + aimDir.x * previewDistance[i]
			previewPos[i * 3 + 1] = previewHeight[i]
			previewPos[i * 3 + 2] = hand.z + aimDir.z * previewDistance[i]
		}
		const landing = clampArrowLanding(hand.x + aimDir.x * distance, hand.z + aimDir.z * distance)
		previewPos[(PREVIEW_N - 1) * 3] = landing.x
		previewPos[(PREVIEW_N - 1) * 3 + 1] = 0.03
		previewPos[(PREVIEW_N - 1) * 3 + 2] = landing.z
		preview.update(previewPos, aimDir, color)
		aimMarker.position.set(landing.x, 0.03, landing.z)
		aimMarker.visible = true
	}

	// Bowls stop through live physics, so their flat range guide deliberately has no landing marker.
	function updateGroundLine(hand) {
		const len = 7
		for (let i = 0; i < PREVIEW_N; i++) {
			const t = i / (PREVIEW_N - 1)
			previewPos[i * 3] = hand.x + aimDir.x * len * t
			previewPos[i * 3 + 1] = 0.05
			previewPos[i * 3 + 2] = hand.z + aimDir.z * len * t
		}
		preview.update(previewPos, aimDir, TRAIL.bowl)
		aimMarker.visible = false
	}

	// --- Collider debug overlay (GUI toggle) ----------------------------------
	const debugGeom = new THREE.BufferGeometry()
	const debugLines = new THREE.LineSegments(
		debugGeom,
		new THREE.LineBasicMaterial({ vertexColors: true }),
	)
	debugLines.layers.set(FORWARD_LAYER)
	debugLines.visible = tune.debug.showColliders
	scene.add(debugLines)

	// GUI cheats and hotkeys read the current round on every call, surviving scene rebuilds.
	const cheats = {
		addEnemy: () => !online.active && flow.round?.addUnit('B'),
		removeEnemy: () => !online.active && flow.round?.removeUnit('B'),
		addAlly: () => !online.active && flow.round?.addUnit('A'),
		removeAlly: () => !online.active && flow.round?.removeUnit('A'),
		load20v20: () => !online.active && startScenario(PRESETS['20v20']),
		step: () => {
			if (online.active) return
			tune.physics.paused = true
			stepPaused()
		},
	}

	debugGui = createDebugGui(() => {
		world.gravity = { x: 0, y: tune.physics.gravity, z: 0 }
		debugLines.visible = tune.debug.showColliders
		setSound(tune.fx.sound)
		renderMute()
		if (flow.round) for (const a of flow.round.arrows) a.applyDamping()
	}, cheats)

	function setDiagnostics(enabled) {
		diagnostics = enabled
		hud.hidden = !enabled
		combatEl.hidden = !enabled
		if (enabled) debugGui.show()
		else debugGui.hide()
		if (gameApi) {
			if (enabled || import.meta.env.DEV) window.game = gameApi
			else delete window.game
		}
	}
	setDiagnostics(diagnostics)

	// Backquote toggles diagnostics/API; splash digits pick difficulty, play keys restart/cheat/edit teams, verdict overlays own R/Enter.
	window.addEventListener('keydown', (e) => {
		if (e.defaultPrevented || e.repeat) return
		if (e.code === 'Backquote') {
			setDiagnostics(!diagnostics)
			return
		}
		if (onlineUi.open || online.active || flow.transitioning) return
		if (e.code === 'KeyG') {
			tune.cheats.godmode = !tune.cheats.godmode
			combat.push(`godmode ${tune.cheats.godmode ? 'ON' : 'off'}`, tune.cheats.godmode ? 'win' : '')
			return
		}
		if (e.code === 'KeyH') {
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
			return
		}
		// Splash digits click difficulty buttons instead of bypassing their handlers.
		if (flow.phase === 'menu') {
			const pick = /^Digit([1-9])$/.exec(e.code)
			if (pick) portalOptions[Number(pick[1]) - 1]?.click()
			return
		}
		if (flow.phase !== 'playing') return
		if (e.code === 'KeyR') return flow.restartRound()
		if (e.code === 'Digit1') return setWeapon('bow')
		if (e.code === 'Digit2') return setWeapon('bowl')
		if (!flow.round) return
		if (e.code === 'Equal') flow.round.addUnit('B')
		else if (e.code === 'Minus') flow.round.removeUnit('B')
		else if (e.code === 'BracketRight') flow.round.addUnit('A')
		else if (e.code === 'BracketLeft') flow.round.removeUnit('A')
	})

	// --- Frame loop ------------------------------------------------------------
	let last = performance.now()

	// Reset stale rAF time on tab return to avoid an artificial 0.1s simulation step.
	window.addEventListener('blur', () => {
		if (onlineMatch) {
			clearActions()
			sendOnlineInput('cancel', true)
		} else if (flow.phase === 'playing' && !flow.transitioning) flow.togglePause()
	})
	document.addEventListener('visibilitychange', () => {
		if (!document.hidden) last = performance.now()
	})
	let acc = 0
	let frames = 0
	let fps = 0
	let fpsTimer = 0
	let hudTimer = 0
	let perfSummary = null

	function frame(now) {
		const frameStart = perf.enabled ? performance.now() : 0
		const interval = now - last
		const dt = Math.min(interval / 1000, 0.1)
		last = now

		const stopped = flow.phase === 'paused' || flow.transitioning || tune.physics.paused
		const impactScale = stopped ? 1 : impact.step(dt)
		const gameDt = onlineMatch ? dt : dt * impactScale
		const simulationStart = perf.enabled ? performance.now() : 0
		pollGamepad(dt)
		if (consumePause() && !onlineUi.open) {
			if (onlineMatch) {
				clearActions()
				onlineUi.show()
			} else if (!online.active) flow.togglePause()
		}
		overlay.setDevice(activeDevice())
		const menuInput = consumeMenuInput()
		if (!flow.transitioning && !onlineUi.open) overlay.handleGamepad(menuInput)
		const selectedWeapon = consumeWeaponSwitch()
		if (!flow.transitioning && flow.phase === 'playing' && selectedWeapon) setWeapon(selectedWeapon)
		setAudioListener(flow.round?.localPlayer?.position)
		if (onlineMatch) {
			const activeMatch = onlineMatch
			if (flow.phase === 'playing' && !onlineUi.open) weaponUpdate(dt)
			else hideAim()
			if (onlineMatch === activeMatch && consumeDash()) sendOnlineInput('dash', true)
			if (onlineMatch === activeMatch && consumeJump()) sendOnlineInput('jump', true)
			if (onlineMatch === activeMatch) sendOnlineInput()
			if (onlineMatch === activeMatch && net.isHost) {
				acc += dt
				while (onlineMatch === activeMatch && acc >= world.timestep) {
					activeMatch.step(world.timestep)
					acc -= world.timestep
				}
			}
			if (onlineMatch === activeMatch) activeMatch.update(dt)
			godmodeFx.update(0, null)
		} else {
			// The hub (menu) is a live round too — same step/lateUpdate, just no aiming.
			if (
				flow.round &&
				!onlineUi.open &&
				!flow.transitioning &&
				(flow.phase === 'playing' || flow.phase === 'menu')
			) {
				if (flow.phase === 'playing' && !tune.physics.paused) weaponUpdate(gameDt)
				else hideAim()
				// Dash latches a direction now; the burst plays out across the steps below.
				if (consumeDash() && !tune.physics.paused) humanDashBuffer = 0.1
				if (consumeJump() && !tune.physics.paused) humanJumpBuffer = 0.1
				if (!tune.physics.paused) {
					acc += gameDt * tune.physics.timeScale
					// Guard on phase too: a winning hit flips us out of 'playing' mid-step.
					while (acc >= world.timestep && (flow.phase === 'playing' || flow.phase === 'menu')) {
						if (humanJumpBuffer > 0) {
							if (flow.round.localPlayer.jump()) humanJumpBuffer = 0
							else humanJumpBuffer = Math.max(0, humanJumpBuffer - world.timestep)
						}
						if (humanDashBuffer > 0) {
							if (flow.round.dashHuman(moveVector())) humanDashBuffer = 0
							else humanDashBuffer = Math.max(0, humanDashBuffer - world.timestep)
						}
						flow.round.step(world.timestep, moveVector())
						acc -= world.timestep
					}
				}
				flow.round.lateUpdate(dt)
				godmodeFx.update(dt, flow.round.localPlayer)
				if (flow.phase === 'menu') flow.checkPortals()
			} else {
				hideAim()
				godmodeFx.update(0, flow.phase === 'paused' ? flow.round?.localPlayer : null)
			}
		}

		const simulationEnd = perf.enabled ? performance.now() : 0

		// Hub player proximity drives portal wake pops; outside the hub the portal list is empty.
		const hubPlayer =
			flow.phase === 'menu' && flow.round && flow.round.localPlayer && flow.round.localPlayer.alive
				? flow.round.localPlayer.position
				: null
		for (const p of flow.portals) p.update(dt, hubPlayer)

		if (debugLines.visible) {
			const { vertices, colors: vcolors } = world.debugRender()
			// Reuse same-sized GPU buffers; replacing attributes leaks old buffers until geometry disposal.
			const pos = debugGeom.getAttribute('position')
			if (pos && pos.array.length === vertices.length) {
				pos.array.set(vertices)
				pos.needsUpdate = true
				const col = debugGeom.getAttribute('color')
				col.array.set(vcolors)
				col.needsUpdate = true
			} else {
				debugGeom.dispose() // release the old buffers before replacing
				debugGeom.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
				debugGeom.setAttribute('color', new THREE.BufferAttribute(vcolors, 4))
			}
		}

		const frozen = flow.phase === 'paused' || flow.transitioning || tune.physics.paused
		if (flow.round && !frozen)
			for (const unit of flow.round.units) {
				const windup =
					unit === flow.round.localPlayer &&
					flow.phase === 'playing' &&
					weapon === 'bow' &&
					charge.charging
						? charge.value
						: unit === flow.round.localPlayer
							? 0
							: (unit.windup ?? 0)
				const stepped = unit.updateVisual(gameDt, windup)
				if (
					stepped &&
					unit === flow.round.localPlayer &&
					(flow.phase === 'playing' || flow.phase === 'menu')
				)
					sfx.step(unit.position)
			}
		shadows.update(flow.round)
		feedback.update(frozen ? 0 : gameDt) // exits and confirmation finish even after the verdict
		updateCamera(frozen ? 0 : dt)
		const renderStart = perf.enabled ? performance.now() : 0
		render()
		const renderEnd = perf.enabled ? performance.now() : 0

		frames++
		fpsTimer += interval / 1000
		if (fpsTimer >= 0.5) {
			fps = Math.round(frames / fpsTimer)
			perfSummary = perf.enabled ? perf.report() : null
			frames = 0
			fpsTimer = 0
		}

		// Throttle HUD writes/allocations to ~10Hz, except while charging so the meter stays smooth.
		hudTimer += dt
		if (hudTimer >= 0.1 || (weapon === 'bow' && charge.charging)) {
			hudTimer = 0
			updateHud()
		}

		if (perf.enabled)
			perf.record({
				frame: interval,
				simulation: simulationEnd - simulationStart,
				presentation: renderStart - simulationEnd,
				render: renderEnd - renderStart,
				cpu: performance.now() - frameStart,
			})
		requestAnimationFrame(frame)
	}

	function updateHud() {
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
		setMusicScene(tune.physics.paused || flow.transitioning ? 'paused' : music)
		// Hub keeps the corner clear so the splash title owns it.
		if (flow.phase === 'menu') {
			hud.textContent = ''
			weaponHud.update({ weapon, charge, visible: false, holding: false })
			return
		}
		// Left stack is opt-in diagnostics; armed status belongs on the weapon HUD, never the scoreboard.
		hud.textContent =
			`G god · H ∞ammo · =/- foe · ]/[ ally\n` +
			`fps ${fps}  ${flow.phase}` +
			`${tune.physics.paused ? '  paused' : ''}` +
			`${tune.cheats.godmode ? '  GOD' : ''}` +
			`${tune.cheats.infiniteAmmo ? '  ∞' : ''}` +
			(perfSummary?.ms.cpu
				? `\ncpu p95 ${perfSummary.ms.cpu.p95.toFixed(1)}ms / 6.94ms\nsim ${perfSummary.ms.simulation.p95.toFixed(1)} · render ${perfSummary.ms.render.p95.toFixed(1)}ms`
				: '')
		syncRoster()
		weaponHud.update({
			weapon,
			charge,
			visible: flow.phase === 'playing' && !!flow.round?.localPlayer?.alive,
			device: activeDevice(),
			online: !!onlineMatch,
			holding: !!(flow.round && flow.round.localPlayer && flow.round.localPlayer.heldArrow),
		})
	}

	function startScenario(options = {}) {
		if (online.active) throw new Error('Leave online before starting a solo scenario')
		const setup = scenario(options) // validate before replacing the current round
		flow.cancelTransition()
		tune.ai.enabled = setup.ai
		tune.physics.paused = setup.paused
		tune.physics.timeScale = 1
		acc = 0
		tune.cheats.godmode = setup.godmode
		tune.cheats.infiniteAmmo = setup.infiniteAmmo
		if (setup.phase === 'menu') flow.enterHub()
		else {
			flow.startMatch(setup.teamB, {
				allies: setup.teamA - 1,
				arrowCount: setup.arrows,
				seed: setup.seed,
				layout: setup.layout,
				hp: setup.hp,
			})
			if (setup.phase === 'roundOver') flow.endRound(setup.winner)
			if (setup.phase === 'matchOver') {
				flow.match.wins[setup.winner] = flow.match.needed
				flow.endMatch(setup.winner)
			}
		}
		perf.enabled = true
		perf.reset()
		perfSummary = null
		updateHud()
		return snapshot()
	}

	function snapshot() {
		return {
			phase: flow.phase,
			match: { ...flow.match, wins: { ...flow.match.wins } },
			paused: tune.physics.paused || flow.phase === 'paused',
			units: flow.round.units.map((u) => ({
				id: u.id,
				team: u.team,
				human: u.isHuman,
				alive: u.alive,
				position: { ...u.position },
				heldArrow: u.heldArrow?.id ?? null,
			})),
			arrows: flow.round.arrows.map((a) => ({
				id: a.id,
				state: a.state,
				kind: a.kind,
				position: { ...a.position },
			})),
		}
	}

	function stepPaused(ticks = 1) {
		if (online.active) throw new Error('Leave online before single-stepping')
		if (!tune.physics.paused) throw new Error('Pause before single-stepping')
		if (!Number.isInteger(ticks) || ticks < 1 || ticks > 3600)
			throw new Error('ticks must be 1..3600')
		for (let i = 0; i < ticks && (flow.phase === 'playing' || flow.phase === 'menu'); i++) {
			flow.round.step(world.timestep, { x: 0, z: 0 })
			flow.round.lateUpdate()
		}
		updateHud()
		return snapshot()
	}

	// Keep the console API ready so the debug hotkey can expose it without a reload.
	gameApi = {
		online,
		get onlineMatch() {
			return onlineMatch
		},
		get round() {
			return flow.round
		},
		get phase() {
			return flow.phase
		},
		tune,
		perf,
		renderer,
		scene,
		world,
		start: startScenario,
		preset(name, overrides = {}) {
			if (!PRESETS[name]) throw new Error(`Unknown preset: ${name}`)
			return startScenario({ ...PRESETS[name], ...overrides })
		},
		snapshot,
		pause(value = true) {
			tune.physics.paused = value
			acc = 0
		},
		step: stepPaused,
		hub: flow.enterHub,
		restart: flow.restartRound,
		async benchmark({ seconds = 10, warmup = 2 } = {}) {
			if (
				![seconds, warmup].every(Number.isFinite) ||
				seconds <= 0 ||
				seconds > 60 ||
				warmup < 0 ||
				warmup > 60
			)
				throw new Error('Invalid benchmark duration')
			await new Promise((resolve) => setTimeout(resolve, warmup * 1000))
			perf.enabled = true
			perf.reset()
			const before = snapshot()
			await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
			return {
				...perf.report(),
				before,
				after: snapshot(),
				viewport: {
					width: innerWidth,
					height: innerHeight,
					pixelRatio: renderer.getPixelRatio(),
				},
				draw: { ...renderer.info.render },
				memory: { ...renderer.info.memory },
				hidden: document.hidden,
			}
		},
	}
	setDiagnostics(diagnostics)
	flow.enterHub()
	try {
		const setup = scenarioFromURL(location.search)
		if (setup) {
			startScenario(setup)
			perf.enabled = true
		}
	} catch (error) {
		log.error('debug setup', error.message)
	}

	requestAnimationFrame(frame)
}

main().catch((err) => {
	console.error(err)
	log.error('boot failed', String(err))
	hud.hidden = false
	hud.textContent = 'boot error — see console\n' + err
})
