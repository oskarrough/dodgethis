import * as THREE from 'three'
import { createPerformanceMonitor } from './performance.js'
import { PRESETS, scenario, scenarioFromURL } from './scenario.js'
import { initPhysics } from './physics.js'
import { createRenderer } from './render.js'
import { buildCourt } from './court.js'
import { createRound } from './round.js'
import { createPortal } from './portal.js'
import { aimArrowSpeed, clampArrowLanding, projectArrowFlight } from './arrow.js'
import { createOverlay } from './overlay.js'
import {
	moveVector,
	pointerNDC,
	consumePress,
	consumeRelease,
	pointerDown,
	clearShoot,
	clearDash,
	pollGamepad,
	consumeDash,
	consumeMenuInput,
	activeDevice,
	consumeWeaponSwitch,
	consumePause,
	resetActions,
} from './input.js'
import { WEAPONS, TRAIL, createChargeMeter } from './weapons.js'
import { createWeaponHud } from './weaponhud.js'
import { setAudioListener, setSound, sfx } from './audio.js'
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
	const { renderer, scene, aimCamera, addShake, updateCamera, render } = createRenderer()
	const perf = createPerformanceMonitor()
	const combat = createCombatLog()
	const overlay = createOverlay()
	const godmodeFx = createGodmodeFx(scene)
	const shadows = createShadows(scene)
	const hitConfirmation = document.querySelector('.hit-confirmation')
	const feedback = createFeedback(scene, {
		sfx,
		addShake,
		confirm(text) {
			hitConfirmation.textContent = text
			hitConfirmation.hidden = !text
		},
	})
	log.info('booted', { renderer: 'style-pass', physics: 'rapier' })

	// Mute toggle controls the shared audio output, so it also silences cues that
	// are already playing instead of only gating future sounds.
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

	// Persistent stage: the court and the contact queue outlive every round. Only
	// the per-round entities (built in round.js) come and go.
	const court = buildCourt(scene, world, RAPIER)
	const eventQueue = new RAPIER.EventQueue(true)
	world.timestep = 1 / 60

	// Services a Round borrows. The court/world persist; the round fills the rest.
	const ctx = {
		scene,
		world,
		RAPIER,
		eventQueue,
		combat,
		present(event) {
			const target = round?.units.find((u) => u.id === (event.target?.id ?? event.source?.id))
			target?.react(event)
			feedback.present(event, target?.visual)
			if (event.source?.isHuman && (event.type === 'shot' || event.type === 'pickup')) {
				if (event.type === 'pickup') weaponHud.emphasizePickup()
				updateHud()
			}
			if (event.outcome === 'eliminated' && event.target.isHuman) {
				hideAim()
				charge.cancel()
				updateHud()
			}
		},
	}

	// --- Game state machine (Godot framing) -----------------------------------
	// phase drives what the frame loop does and which overlay is up.
	//   menu → playing → roundOver → playing → … → matchOver → menu
	// match holds the best-of-N score. `round` is the live gameplay scene or null.
	const BEST_OF = 3
	const match = {
		bestOf: BEST_OF,
		needed: 2,
		wins: { A: 0, B: 0 },
		round: 0,
		enemies: 3,
		allies: 0,
		arrowCount: 7,
		seed: undefined,
	}
	let phase = 'menu'
	let round = null
	let portals = []
	let teleporting = false
	let transitionTimer = null
	let humanDashBuffer = 0
	let roundScored = false
	let lastDifficulty = 0
	try {
		lastDifficulty = Number(localStorage.getItem('dodgethis.difficulty'))
	} catch {
		/* storage may be unavailable */
	}

	function clearActions() {
		resetActions()
		humanDashBuffer = 0
		charge.cancel()
		acc = 0
	}

	function transition(label, arrive) {
		if (teleporting) return
		teleporting = true
		clearActions()
		overlay.hide()
		fadeEl.textContent = label
		fadeEl.classList.add('active')
		transitionTimer = setTimeout(() => {
			arrive()
			clearActions()
			fadeEl.classList.remove('active')
			transitionTimer = setTimeout(() => {
				clearActions()
				teleporting = false
				transitionTimer = null
			}, 180)
		}, 180)
	}

	function togglePause() {
		if (teleporting) return
		if (phase === 'paused') {
			clearActions()
			phase = 'playing'
			tune.physics.paused = false
			overlay.hide()
		} else if (phase === 'playing') {
			clearActions()
			phase = 'paused'
			hideAim()
			overlay.show({
				title: 'PAUSED',
				subtitle: `Round ${match.round} · ${match.wins.A}–${match.wins.B}`,
				actions: [
					{ label: 'Resume', keyLabel: 'Enter', onSelect: togglePause },
					{ label: 'Restart round', key: 'KeyR', keyLabel: 'R', onSelect: restartRound },
					{
						label: 'Back to hub',
						key: 'KeyM',
						keyLabel: 'M',
						onSelect: () => transition('BACK TO THE COURT', enterHub),
					},
				],
			})
		}
	}

	// --- The hub: a live, physical splash ------------------------------------
	// The menu IS a game instance — a lobby round with no enemies, no scoring, no
	// arrows. You free-roam the court and step into a portal to commit to a match.
	// That's the "splash doesn't block the game" trick: same scene, same input.
	function enterHub() {
		clearActions()
		feedback.reset()
		weaponHud.reset()
		if (round) {
			round.dispose()
			round = null
		}
		clearPortals()
		overlay.hide()
		phase = 'menu'
		// Un-hiding restarts the CSS letter animations, so the title bounces in
		// fresh every time you come back to the hub.
		splashEl.hidden = false
		renderScore()
		for (const button of portalOptions) {
			const recent = Number(button.dataset.enemies) === lastDifficulty
			button.classList.toggle('recent', recent)
			if (recent) button.setAttribute('aria-description', 'Last played difficulty')
			else button.removeAttribute('aria-description')
		}
		round = createRound(ctx, { enemies: 0, arrowCount: 0, roundNum: 0, lobby: true })
		// Three portals, one per difficulty — black holes in the ground with a
		// swirling ring and a floating number. Step in to teleport into a best-of-3
		// match with that many enemies.
		for (const s of [
			{ x: -3.5, enemies: 1 },
			{ x: 0, enemies: 2 },
			{ x: 3.5, enemies: 3 },
		]) {
			portals.push(createPortal(scene, { x: s.x, z: -3, enemies: s.enemies }))
		}
	}

	function clearPortals() {
		for (const p of portals) p.dispose()
		portals = []
	}

	function teleportTo(enemies) {
		if (teleporting) return
		sfx.portal()
		transition('ROUND 1', () => startMatch(enemies))
	}

	// The splash difficulties, in the order they are printed. That order is also
	// what the 1-9 keys pick, and the printed hint is written from the same list,
	// so a fourth mode would number itself.
	const portalOptions = [...splashEl.querySelectorAll('.portal-option')]
	portalOptions.forEach((button, i) => {
		if (i < 9) button.append(`  (${i + 1})`) // same hint shape the overlay uses
		button.addEventListener('click', () => {
			sfx.click()
			teleportTo(Number(button.dataset.enemies))
		})
	})

	// Step-into-portal check, run each frame while roaming the hub.
	function checkPortals() {
		if (!round || !round.human || !round.human.alive) return
		const p = round.human.position
		for (const portal of portals) {
			if (portal.trigger(p.x, p.z)) {
				teleportTo(portal.enemies)
				return
			}
		}
	}

	function startMatch(enemies, { allies = 0, arrowCount = 7, seed } = {}) {
		if (enemies >= 1 && enemies <= 3 && allies === 0) {
			lastDifficulty = enemies
			try {
				localStorage.setItem('dodgethis.difficulty', String(enemies))
			} catch {
				/* optional preference */
			}
		}
		match.allies = allies
		match.arrowCount = arrowCount
		match.seed = seed
		match.bestOf = BEST_OF
		match.needed = Math.floor(BEST_OF / 2) + 1 // first to a majority of rounds
		match.wins.A = 0
		match.wins.B = 0
		match.round = 0
		match.enemies = enemies
		combat.push(
			`match start — ${enemies} enemies, best of ${BEST_OF}, first to ${match.needed}`,
			'win',
		)
		startRound()
	}

	// Build a fresh round (incrementing the counter) and start play. Disposing the
	// old round here is the real reset that replaced location.reload().
	function startRound() {
		match.round++
		spawnRound()
	}

	// Replay the current round without touching the score (R / restart button).
	function restartRound() {
		if (match.round === 0 || roundScored || phase === 'menu') return
		transition(`ROUND ${match.round} · AGAIN`, spawnRound)
	}

	function spawnRound() {
		roundScored = false
		clearActions()
		feedback.reset()
		weaponHud.reset()
		consumeWeaponSwitch()
		if (round) round.dispose()
		clearPortals() // leave the hub's portals behind when a match begins
		round = createRound(ctx, {
			enemies: match.enemies,
			allies: match.allies,
			arrowCount: match.arrowCount,
			seed: match.seed,
			roundNum: match.round,
			onOver: endRound,
		})
		for (const unit of round.units) unit.updateVisual(0)
		clearShoot() // swallow the click/Enter that dismissed the overlay
		clearDash() // a Space confirm shouldn't become an instant dash
		charge.cancel()
		acc = 0
		phase = 'playing'
		overlay.hide()
		splashEl.hidden = true
		renderScore()
	}

	// Signal handler for round.onOver: tally the win, then branch to the next round
	// or end the match. A null winner is a draw (both teams wiped in the same
	// step) — nobody scores and the round is replayed.
	// Round-over card is verdict + actions only; the live scoreboard keeps the score.
	function endRound(winner) {
		if (phase !== 'playing' || roundScored) return
		if (!winner) {
			phase = 'roundOver'
			renderScore()
			combat.push(`round ${match.round} is a DRAW — replaying`, 'win')
			overlay.show({
				title: 'DRAW',
				clear: true,
				actions: [{ label: 'Replay round', keyLabel: 'Enter', onSelect: restartRound }],
			})
			return
		}
		roundScored = true
		match.wins[winner]++
		renderScore()
		sfx.win()
		combat.push(
			`Team ${winner} wins round ${match.round}  (${match.wins.A}–${match.wins.B})`,
			'win',
		)

		if (match.wins[winner] >= match.needed) {
			endMatch(winner)
			return
		}

		phase = 'roundOver'
		const youWon = winner === 'A'
		overlay.show({
			title: youWon ? 'ROUND WON' : 'ROUND LOST',
			clear: true,
			actions: [
				{
					label: 'Next round',
					keyLabel: 'Enter',
					onSelect: () => transition(`ROUND ${match.round + 1}`, startRound),
				},
				{
					label: 'Back to hub',
					key: 'KeyM',
					keyLabel: 'M',
					onSelect: () => transition('BACK TO THE COURT', enterHub),
				},
			],
		})
	}

	function endMatch(winner) {
		phase = 'matchOver'
		renderScore()
		const youWon = winner === 'A'
		combat.push(`Team ${winner} wins the match ${match.wins.A}–${match.wins.B}!`, 'win')
		overlay.show({
			title: youWon ? 'YOU WIN' : 'YOU LOSE',
			actions: [
				{
					label: 'Rematch',
					keyLabel: 'Enter',
					onSelect: () => transition('ROUND 1 · AGAIN', () => startMatch(match.enemies, match)),
				},
				...(match.enemies < 3 && match.allies === 0
					? [
							{
								label: 'Try harder',
								onSelect: () => transition('STEP IT UP', () => startMatch(match.enemies + 1)),
							},
						]
					: []),
				{
					label: 'Back to hub',
					key: 'KeyM',
					keyLabel: 'M',
					onSelect: () => transition('BACK TO THE COURT', enterHub),
				},
			],
		})
	}

	// --- Scoreboard ------------------------------------------------------------
	// Gym clock: YOU/FOE + filled pips. Pip count implies best-of — don't also print it.
	// CSS dots (not ●/○ glyphs) so Darumadrop can't substitute weird fallback shapes.
	function pips(n) {
		let s = ''
		for (let i = 0; i < match.needed; i++) {
			s += `<span class="pip${i < n ? ' on' : ''}"></span>`
		}
		return s
	}
	// One mark per unit on a side, filled while that unit is still standing, so
	// you can read the state of the round without counting capsules on the court.
	// Individual marks stop being countable at a glance (and stop fitting) once a
	// side is more than a squad, so past MAX_MARKS it collapses to one mark and a
	// number. The debug keys can add foes without limit, so this is not academic.
	const MAX_MARKS = 6
	function roster(team) {
		if (!round) return ''
		let alive = 0
		let total = 0
		for (const u of round.units) {
			if (u.team !== team) continue
			total++
			if (u.alive) alive++
		}
		if (total > MAX_MARKS) {
			return `<span class="unit${alive ? ' up' : ''}"></span><span class="count">${alive}</span>`
		}
		let s = ''
		for (const u of round.units) {
			if (u.team !== team) continue
			s += `<span class="unit${u.alive ? ' up' : ''}"></span>`
		}
		return s
	}
	function renderScore() {
		court.updateScore(phase === 'menu' ? 0 : match.wins.A, phase === 'menu' ? 0 : match.wins.B)
		if (phase === 'menu') {
			scoreEl.hidden = true
			return
		}
		scoreEl.hidden = false
		scoreEl.innerHTML =
			`<span class="side a"><span class="name">You</span>` +
			`<span class="crew">${roster('A')}</span>` +
			`<span class="pips">${pips(match.wins.A)}</span></span>` +
			`<span class="mid">Round ${match.round}</span>` +
			`<span class="side b"><span class="pips">${pips(match.wins.B)}</span>` +
			`<span class="crew">${roster('B')}</span>` +
			`<span class="name">Foe</span></span>`
	}
	// Cheap per-frame refresh: only touch the DOM when someone actually goes out.
	let lastRoster = ''
	function syncRoster() {
		if (phase === 'menu' || !round) return
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
	// The weapon is a property of the human shooter, not the ammo: you still grab
	// arrows from the scarce pool, but the selected weapon changes how a held
	// arrow is loosed. The bow's wind-up meter is its own component.
	let weapon = 'bow'
	const charge = createChargeMeter()

	// Audio feedback for the charge meter: a tick each time the wind-up climbs into
	// a new step (the meter ping-pongs, so ticks fire on the way up and fall silent
	// on the way down), plus a brighter cue the instant it enters the perfect band.
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

	// Landing reticle + a dotted preview of the arrow's arc to that spot.
	// Two rings, not one: the ammo yellow alone is nearly the same value as the
	// green court, so it rides on an ink one the way every other mark here does.
	const aimMarker = new THREE.Mesh(
		new THREE.RingGeometry(0.26, 0.38, 24),
		new THREE.MeshBasicMaterial({ color: PALETTE.ammo, transparent: true, depthWrite: false }),
	)
	aimMarker.rotation.x = -Math.PI / 2
	aimMarker.visible = false
	const markerInk = new THREE.Mesh(
		new THREE.RingGeometry(0.22, 0.42, 24),
		new THREE.MeshBasicMaterial({ color: PALETTE.ink }),
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
		const h = round && round.human
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
				const shot = charge.release()
				if (shot) {
					round.looseHuman(aimDir, aimArrowSpeed(targetDistance, hand.y, shot.speed), {
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
		if (consumePress()) round.looseHuman(aimDir, aimSpeed, { kind: def.kind })
	}

	// Sample the damped flight through touchdown and share the projectile's court
	// clamp, so the final preview point and landing marker match grounded ammo.
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

	// A flat range guide in the aim direction. Bowls stop through live physics, so
	// unlike arrows this deliberately has no landing marker.
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
	debugLines.visible = tune.debug.showColliders
	scene.add(debugLines)

	// Live sandbox actions for the GUI's "cheats" folder. They read the current
	// `round` each call, so they always act on the live scene (which is rebuilt
	// every round). The same actions are bound to keys below.
	const cheats = {
		addEnemy: () => round && round.addUnit('B'),
		removeEnemy: () => round && round.removeUnit('B'),
		addAlly: () => round && round.addUnit('A'),
		removeAlly: () => round && round.removeUnit('A'),
		load20v20: () => startScenario(PRESETS['20v20']),
		step: () => {
			tune.physics.paused = true
			stepPaused()
		},
	}

	createDebugGui(() => {
		world.gravity = { x: 0, y: tune.physics.gravity, z: 0 }
		debugLines.visible = tune.debug.showColliders
		setSound(tune.fx.sound)
		renderMute()
		if (round) for (const a of round.arrows) a.applyDamping()
	}, cheats)

	// Hotkeys on the splash:
	//   1-9       enter that difficulty, in the order the options are printed
	// Hotkeys during play:
	//   R         restart the current round (a real in-place reset — no reload)
	//   G         toggle godmode (you can't be eliminated)
	//   = / -     add / remove an enemy (Team B)
	//   ] / [     add / remove an ally (Team A, AI fights for you)
	// During roundOver/matchOver the overlay's own buttons own R/Enter.
	window.addEventListener('keydown', (e) => {
		if (e.defaultPrevented || teleporting || e.repeat) return
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
			if (phase === 'playing' || phase === 'paused') togglePause()
			else if (phase !== 'menu') transition('BACK TO THE COURT', enterHub)
			return
		}
		// On the splash, a number key is the same act as clicking that difficulty —
		// so it goes through the button, not around it.
		if (phase === 'menu') {
			const pick = /^Digit([1-9])$/.exec(e.code)
			if (pick) portalOptions[Number(pick[1]) - 1]?.click()
			return
		}
		if (phase !== 'playing') return
		if (e.code === 'KeyR') return restartRound()
		if (e.code === 'Digit1') return setWeapon('bow')
		if (e.code === 'Digit2') return setWeapon('bowl')
		if (!round) return
		if (e.code === 'Equal') round.addUnit('B')
		else if (e.code === 'Minus') round.removeUnit('B')
		else if (e.code === 'BracketRight') round.addUnit('A')
		else if (e.code === 'BracketLeft') round.removeUnit('A')
	})

	// --- Frame loop ------------------------------------------------------------
	let last = performance.now()

	// rAF stops while the tab is hidden, leaving `last` stale; without this the
	// first frame back would advance the sim by the (clamped) 0.1s max step.
	window.addEventListener('blur', () => {
		if (phase === 'playing' && !teleporting) togglePause()
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

		const simulationStart = perf.enabled ? performance.now() : 0
		pollGamepad(dt)
		if (consumePause()) togglePause()
		overlay.setDevice(activeDevice())
		const menuInput = consumeMenuInput()
		if (!teleporting) overlay.handleGamepad(menuInput)
		const selectedWeapon = consumeWeaponSwitch()
		if (!teleporting && phase === 'playing' && selectedWeapon) setWeapon(selectedWeapon)
		setAudioListener(round?.human.position)
		// The hub (menu) is a live round too — same step/lateUpdate, just no aiming.
		if (round && !teleporting && (phase === 'playing' || phase === 'menu')) {
			if (phase === 'playing' && !tune.physics.paused) weaponUpdate(dt)
			else hideAim()
			// Dash latches a direction now; the burst plays out across the steps below.
			if (consumeDash() && !tune.physics.paused) humanDashBuffer = 0.1
			if (!tune.physics.paused) {
				acc += dt * tune.physics.timeScale
				// Guard on phase too: a winning hit flips us out of 'playing' mid-step.
				while (acc >= world.timestep && (phase === 'playing' || phase === 'menu')) {
					if (humanDashBuffer > 0) {
						if (round.dashHuman(moveVector())) humanDashBuffer = 0
						else humanDashBuffer = Math.max(0, humanDashBuffer - world.timestep)
					}
					round.step(world.timestep, moveVector())
					acc -= world.timestep
				}
			}
			round.lateUpdate(dt)
			godmodeFx.update(dt, round.human)
			if (phase === 'menu') checkPortals()
		} else {
			hideAim()
			godmodeFx.update(0, phase === 'paused' ? round?.human : null)
		}

		const simulationEnd = perf.enabled ? performance.now() : 0

		// Portal idle/wake animation — cheap, and the list is empty outside the hub.
		// The player position drives the proximity "wake" pop.
		const hubPlayer =
			phase === 'menu' && round && round.human && round.human.alive ? round.human.position : null
		for (const p of portals) p.update(dt, hubPlayer)

		if (debugLines.visible) {
			const { vertices, colors: vcolors } = world.debugRender()
			// Reuse the existing GPU buffers when the vertex count is unchanged;
			// blindly swapping in new BufferAttributes every frame leaks the old
			// buffers until the geometry itself is disposed.
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

		const frozen = phase === 'paused' || teleporting || tune.physics.paused
		if (round && !frozen)
			for (const unit of round.units) {
				const windup =
					unit.isHuman && phase === 'playing' && weapon === 'bow' && charge.charging
						? charge.value
						: 0
				const stepped = unit.updateVisual(dt, windup)
				if (stepped && unit.isHuman && (phase === 'playing' || phase === 'menu'))
					sfx.step(unit.position)
			}
		shadows.update(round)
		feedback.update(frozen ? 0 : dt) // exits and confirmation finish even after the verdict
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

		// The HUD is plain text (counts + fps + weapon line): refreshing it 60×/s
		// burns DOM writes and array allocs for no visible gain. Throttle to ~10Hz,
		// but keep it live while the charge meter is winding so its bar stays smooth.
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
		// Hub keeps the corner clear so the splash title owns it.
		if (phase === 'menu') {
			hud.textContent = ''
			weaponHud.update({ weapon, charge, visible: false, holding: false })
			return
		}
		// Left-stack stays developer chrome (always visible in-match). Armed status
		// lives on the weapon HUD — not here, and never as match-scoreboard copy.
		hud.textContent =
			`G god · H ∞ammo · =/- foe · ]/[ ally\n` +
			`fps ${fps}  ${phase}` +
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
			visible: phase === 'playing' && !!round?.human.alive,
			device: activeDevice(),
			holding: !!(round && round.human && round.human.heldArrow),
		})
	}

	function startScenario(options = {}) {
		const setup = scenario(options) // validate before replacing the current round
		clearTimeout(transitionTimer)
		transitionTimer = null
		teleporting = false
		fadeEl.classList.remove('active')
		tune.ai.enabled = setup.ai
		tune.physics.paused = setup.paused
		tune.physics.timeScale = 1
		acc = 0
		tune.cheats.godmode = setup.godmode
		tune.cheats.infiniteAmmo = setup.infiniteAmmo
		if (setup.phase === 'menu') enterHub()
		else {
			startMatch(setup.teamB, {
				allies: setup.teamA - 1,
				arrowCount: setup.arrows,
				seed: setup.seed,
			})
			if (setup.phase === 'roundOver') endRound(setup.winner)
			if (setup.phase === 'matchOver') {
				match.wins[setup.winner] = match.needed
				endMatch(setup.winner)
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
			phase,
			match: { ...match, wins: { ...match.wins } },
			paused: tune.physics.paused || phase === 'paused',
			units: round.units.map((u) => ({
				id: u.id,
				team: u.team,
				human: u.isHuman,
				alive: u.alive,
				position: { ...u.position },
				heldArrow: u.heldArrow?.id ?? null,
			})),
			arrows: round.arrows.map((a) => ({
				id: a.id,
				state: a.state,
				kind: a.kind,
				position: { ...a.position },
			})),
		}
	}

	function stepPaused(ticks = 1) {
		if (!tune.physics.paused) throw new Error('Pause before single-stepping')
		if (!Number.isInteger(ticks) || ticks < 1 || ticks > 3600)
			throw new Error('ticks must be 1..3600')
		for (let i = 0; i < ticks && (phase === 'playing' || phase === 'menu'); i++) {
			round.step(world.timestep, { x: 0, z: 0 })
			round.lateUpdate()
		}
		updateHud()
		return snapshot()
	}

	// Opt-in in a production build; always available on the development server.
	if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
		window.game = {
			get round() {
				return round
			},
			get phase() {
				return phase
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
			hub: enterHub,
			restart: restartRound,
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
	}
	enterHub()
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
	hud.textContent = 'boot error — see console\n' + err
})
