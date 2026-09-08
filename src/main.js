import * as THREE from 'three'
import { initPhysics } from './physics.js'
import { createRenderer } from './render.js'
import { buildCourt } from './court.js'
import { createRound } from './round.js'
import { createPortal } from './portal.js'
import { clampArrowLanding, projectArrowFlight } from './arrow.js'
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
} from './input.js'
import { WEAPONS, TRAIL, createChargeMeter } from './weapons.js'
import { createWeaponHud } from './weaponHud.js'
import { setAudioListener, setSound, sfx } from './audio.js'
import { tune } from './tune.js'
import { log, createDebugGui, createCombatLog } from './debug.js'
import { createGodmodeFx } from './godmodeFx.js'
import { createFeedback } from './feedback.js'

const hud = document.querySelector('.hud')
const scoreEl = document.querySelector('.score')
const fadeEl = document.querySelector('.fade')
const splashEl = document.querySelector('.splash')

async function main() {
	const { RAPIER, world } = await initPhysics()
	const { renderer, scene, camera, aimCamera, addShake, updateCamera } = createRenderer()
	const combat = createCombatLog()
	const overlay = createOverlay()
	const godmodeFx = createGodmodeFx(scene)
	const hitConfirmation = document.querySelector('.hit-confirmation')
	const feedback = createFeedback(scene, {
		sfx,
		addShake,
		confirm(text) {
			hitConfirmation.textContent = text
			hitConfirmation.hidden = !text
		},
	})
	log.info('booted', { renderer: 'three', physics: 'rapier' })

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
	buildCourt(scene, world, RAPIER)
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
	const match = { bestOf: BEST_OF, needed: 2, wins: { A: 0, B: 0 }, round: 0, enemies: 3 }
	let phase = 'menu'
	let round = null
	let portals = []
	let teleporting = false

	// --- The hub: a live, physical splash ------------------------------------
	// The menu IS a game instance — a lobby round with no enemies, no scoring, no
	// arrows. You free-roam the court and step into a portal to commit to a match.
	// That's the "splash doesn't block the game" trick: same scene, same input.
	function fadeOut(done) {
		fadeEl.style.opacity = '1'
		setTimeout(done, 280)
	}
	function fadeIn() {
		fadeEl.style.opacity = '0'
	}

	function enterHub() {
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
		teleporting = true
		sfx.portal()
		fadeOut(() => {
			startMatch(enemies)
			teleporting = false
			fadeIn()
		})
	}

	for (const button of splashEl.querySelectorAll('.portal-option')) {
		button.addEventListener('click', () => {
			sfx.click()
			teleportTo(Number(button.dataset.enemies))
		})
	}

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

	function startMatch(enemies) {
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
		if (match.round === 0) return
		spawnRound()
	}

	function spawnRound() {
		feedback.reset()
		weaponHud.reset()
		consumeWeaponSwitch()
		if (round) round.dispose()
		clearPortals() // leave the hub's portals behind when a match begins
		round = createRound(ctx, {
			enemies: match.enemies,
			arrowCount: 7,
			roundNum: match.round,
			onOver: endRound,
		})
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
				{ label: 'Next round', keyLabel: 'Enter', onSelect: startRound },
				{ label: 'Restart', key: 'KeyR', keyLabel: 'R', onSelect: restartRound },
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
				{ label: 'Rematch', keyLabel: 'Enter', onSelect: () => startMatch(match.enemies) },
				{ label: 'Main menu', key: 'KeyM', keyLabel: 'M', onSelect: enterHub },
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
	function renderScore() {
		if (phase === 'menu') {
			scoreEl.hidden = true
			return
		}
		scoreEl.hidden = false
		scoreEl.innerHTML =
			`<span class="a">YOU <span class="pips">${pips(match.wins.A)}</span></span>` +
			`<span class="mid">round ${match.round}</span>` +
			`<span class="b"><span class="pips">${pips(match.wins.B)}</span> FOE</span>`
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
	const aimMarker = new THREE.Mesh(
		new THREE.RingGeometry(0.25, 0.35, 24),
		new THREE.MeshBasicMaterial({ color: 0xffd35d }),
	)
	aimMarker.rotation.x = -Math.PI / 2
	aimMarker.visible = false
	scene.add(aimMarker)

	const PREVIEW_N = 32
	const previewPos = new Float32Array(PREVIEW_N * 3)
	const previewDistance = new Float32Array(PREVIEW_N)
	const previewHeight = new Float32Array(PREVIEW_N)
	const previewGeom = new THREE.BufferGeometry()
	previewGeom.setAttribute('position', new THREE.BufferAttribute(previewPos, 3))
	const preview = new THREE.Line(
		previewGeom,
		new THREE.LineDashedMaterial({
			color: 0xffd35d,
			dashSize: 0.45,
			gapSize: 0.28,
			transparent: true,
			opacity: 0.85,
		}),
	)
	preview.frustumCulled = false
	preview.visible = false
	scene.add(preview)

	function hideAim() {
		preview.visible = false
		aimMarker.visible = false
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
			aimSpeed = charge.previewSpeed()
			updateArc(hand, aimSpeed, charge.perfect ? TRAIL.perfect : TRAIL.arrow)
			if (consumeRelease()) {
				const shot = charge.release()
				if (shot) round.looseHuman(aimDir, shot.speed, { kind: 'arrow', perfect: shot.perfect })
			} else if (charge.charging && !pointerDown()) {
				charge.cancel() // lost the button without a clean release (blur) — no shot
			}
			return
		}

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
		preview.visible = true
		preview.material.color.set(color)
		for (let i = 0; i < PREVIEW_N; i++) {
			previewPos[i * 3] = hand.x + aimDir.x * previewDistance[i]
			previewPos[i * 3 + 1] = previewHeight[i]
			previewPos[i * 3 + 2] = hand.z + aimDir.z * previewDistance[i]
		}
		const landing = clampArrowLanding(hand.x + aimDir.x * distance, hand.z + aimDir.z * distance)
		previewPos[(PREVIEW_N - 1) * 3] = landing.x
		previewPos[(PREVIEW_N - 1) * 3 + 1] = 0.02
		previewPos[(PREVIEW_N - 1) * 3 + 2] = landing.z
		previewGeom.setDrawRange(0, PREVIEW_N)
		previewGeom.attributes.position.needsUpdate = true
		preview.computeLineDistances()
		aimMarker.position.set(landing.x, 0.02, landing.z)
		aimMarker.visible = true
	}

	// A flat range guide in the aim direction. Bowls stop through live physics, so
	// unlike arrows this deliberately has no landing marker.
	function updateGroundLine(hand) {
		preview.visible = true
		preview.material.color.set(TRAIL.bowl)
		const len = 7
		for (let i = 0; i < PREVIEW_N; i++) {
			const t = i / (PREVIEW_N - 1)
			previewPos[i * 3] = hand.x + aimDir.x * len * t
			previewPos[i * 3 + 1] = 0.05
			previewPos[i * 3 + 2] = hand.z + aimDir.z * len * t
		}
		previewGeom.setDrawRange(0, PREVIEW_N)
		previewGeom.attributes.position.needsUpdate = true
		preview.computeLineDistances()
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
	}

	createDebugGui(() => {
		world.gravity = { x: 0, y: tune.physics.gravity, z: 0 }
		debugLines.visible = tune.debug.showColliders
		setSound(tune.fx.sound)
		renderMute()
		if (round) for (const a of round.arrows) a.applyDamping()
	}, cheats)

	// Hotkeys during play:
	//   R         restart the current round (a real in-place reset — no reload)
	//   G         toggle godmode (you can't be eliminated)
	//   = / -     add / remove an enemy (Team B)
	//   ] / [     add / remove an ally (Team A, AI fights for you)
	// During roundOver/matchOver the overlay's own buttons own R/Enter.
	window.addEventListener('keydown', (e) => {
		if (e.defaultPrevented) return
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
			if (phase !== 'menu') enterHub() // quit the match back to the hub
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
	document.addEventListener('visibilitychange', () => {
		if (!document.hidden) last = performance.now()
	})
	let acc = 0
	let frames = 0
	let fps = 0
	let fpsTimer = 0
	let hudTimer = 0

	function frame(now) {
		const dt = Math.min((now - last) / 1000, 0.1)
		last = now

		pollGamepad(dt)
		overlay.setDevice(activeDevice())
		overlay.handleGamepad(consumeMenuInput())
		const selectedWeapon = consumeWeaponSwitch()
		if (phase === 'playing' && selectedWeapon) setWeapon(selectedWeapon)
		setAudioListener(round?.human.position)
		// The hub (menu) is a live round too — same step/lateUpdate, just no aiming.
		if (round && (phase === 'playing' || phase === 'menu')) {
			if (phase === 'playing') weaponUpdate(dt)
			else hideAim()
			// Dash latches a direction now; the burst plays out across the steps below.
			if (consumeDash()) round.dashHuman(moveVector())
			if (!tune.physics.paused) {
				acc += dt * tune.physics.timeScale
				// Guard on phase too: a winning hit flips us out of 'playing' mid-step.
				while (acc >= world.timestep && (phase === 'playing' || phase === 'menu')) {
					round.step(world.timestep, moveVector())
					acc -= world.timestep
				}
			}
			round.lateUpdate(dt)
			godmodeFx.update(dt, round.human)
			if (phase === 'menu') checkPortals()
		} else {
			hideAim()
			godmodeFx.update(dt, null)
		}

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

		if (round)
			for (const unit of round.units) {
				const windup =
					unit.isHuman && phase === 'playing' && weapon === 'bow' && charge.charging
						? charge.value
						: 0
				unit.updateVisual(dt, windup)
			}
		feedback.update(dt) // exits and confirmation finish even after the verdict
		updateCamera(dt)
		renderer.render(scene, camera)

		frames++
		fpsTimer += dt
		if (fpsTimer >= 0.5) {
			fps = Math.round(frames / fpsTimer)
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
		let status = ''
		if (phase === 'playing' && round) {
			let allies = 0
			let enemiesLeft = 0
			for (const u of round.units) {
				if (!u.alive) continue
				if (u.team === 'A') allies++
				else if (u.team === 'B') enemiesLeft++
			}
			let grounded = 0
			for (const a of round.arrows) if (a.state === 'grounded') grounded++
			status = `A:${allies}  B:${enemiesLeft}  loose:${grounded}\n`
		}
		hud.textContent =
			`G god · H ∞ammo · =/- foe · ]/[ ally\n` +
			status +
			`fps ${fps}  ${phase}` +
			`${tune.physics.paused ? '  paused' : ''}` +
			`${tune.cheats.godmode ? '  GOD' : ''}` +
			`${tune.cheats.infiniteAmmo ? '  ∞' : ''}`
		weaponHud.update({
			weapon,
			charge,
			visible: phase === 'playing' && !!round?.human.alive,
			device: activeDevice(),
			holding: !!(round && round.human && round.human.heldArrow),
		})
	}

	enterHub()
	requestAnimationFrame(frame)
}

main().catch((err) => {
	console.error(err)
	log.error('boot failed', String(err))
	hud.textContent = 'boot error — see console\n' + err
})
