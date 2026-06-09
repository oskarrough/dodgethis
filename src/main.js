import * as THREE from 'three'
import { initPhysics } from './physics.js'
import { createRenderer } from './render.js'
import { buildCourt } from './court.js'
import { createRound } from './round.js'
import { solveLaunch, launchVelocity } from './arrow.js'
import { createOverlay } from './overlay.js'
import {
	moveVector,
	pointerNDC,
	consumePress,
	consumeRelease,
	pointerDown,
	clearShoot,
	pollGamepad,
} from './input.js'
import { WEAPONS, TRAIL, createChargeMeter } from './weapons.js'
import { sfx } from './audio.js'
import { tune } from './tune.js'
import { log, createDebugGui, createCombatLog } from './debug.js'

const hud = document.getElementById('hud')
const scoreEl = document.getElementById('score')

async function main() {
	const { RAPIER, world } = await initPhysics()
	const { renderer, scene, camera, addShake, updateCamera } = createRenderer()
	const combat = createCombatLog()
	const overlay = createOverlay()
	log.info('booted', { renderer: 'three', physics: 'rapier' })

	// Persistent stage: the court and the contact queue outlive every round. Only
	// the per-round entities (built in round.js) come and go.
	buildCourt(scene, world, RAPIER)
	const eventQueue = new RAPIER.EventQueue(true)
	world.timestep = 1 / 60

	// Services a Round borrows. The court/world persist; the round fills the rest.
	const ctx = { scene, world, RAPIER, eventQueue, combat, sfx, addShake }

	// --- Game state machine (Godot framing) -----------------------------------
	// phase drives what the frame loop does and which overlay is up.
	//   menu → playing → roundOver → playing → … → matchOver → menu
	// match holds the best-of-N score. `round` is the live gameplay scene or null.
	const match = { bestOf: 3, needed: 2, wins: { A: 0, B: 0 }, round: 0 }
	let phase = 'menu'
	let round = null

	function enterMenu() {
		if (round) {
			round.dispose()
			round = null
		}
		phase = 'menu'
		renderScore()
		overlay.show({
			title: 'ARRRROW',
			subtitle: '3D Dodge Bolt',
			lines: ['Grab arrows, dodge incoming, wipe out the red team.', 'Pick a match length:'],
			actions: [
				{ label: 'Best of 3', key: 'Digit3', keyLabel: '3', onSelect: () => startMatch(3) },
				{ label: 'Best of 5', key: 'Digit5', keyLabel: '5', onSelect: () => startMatch(5) },
			],
		})
	}

	function startMatch(bestOf) {
		match.bestOf = bestOf
		match.needed = Math.floor(bestOf / 2) + 1 // first to a majority of rounds
		match.wins.A = 0
		match.wins.B = 0
		match.round = 0
		combat.push(`match start — best of ${bestOf}, first to ${match.needed}`, 'win')
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
		if (round) round.dispose()
		round = createRound(ctx, {
			enemies: 3,
			arrowCount: 7,
			roundNum: match.round,
			onOver: endRound,
		})
		clearShoot() // swallow the click/Enter that dismissed the overlay
		charge.cancel()
		acc = 0
		phase = 'playing'
		overlay.hide()
		renderScore()
	}

	// Signal handler for round.onOver: tally the win, then branch to the next round
	// or end the match. A null winner is a draw (both teams wiped in the same
	// step) — nobody scores and the round is replayed.
	function endRound(winner) {
		if (!winner) {
			phase = 'roundOver'
			combat.push(`round ${match.round} is a DRAW — replaying`, 'win')
			overlay.show({
				title: 'DRAW',
				subtitle: `Both teams wiped — round ${match.round} replays`,
				lines: [scoreLine()],
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
			subtitle: `Team ${winner} takes round ${match.round}`,
			lines: [scoreLine()],
			actions: [
				{ label: 'Next round', keyLabel: 'Enter', onSelect: startRound },
				{ label: 'Restart', key: 'KeyR', keyLabel: 'R', onSelect: restartRound },
			],
		})
	}

	function endMatch(winner) {
		phase = 'matchOver'
		const youWon = winner === 'A'
		combat.push(`Team ${winner} wins the match ${match.wins.A}–${match.wins.B}!`, 'win')
		overlay.show({
			title: youWon ? 'YOU WIN' : 'YOU LOSE',
			subtitle: `Match to Team ${winner} · ${match.wins.A}–${match.wins.B}`,
			lines: [`Best of ${match.bestOf}`],
			actions: [
				{ label: 'Rematch', keyLabel: 'Enter', onSelect: () => startMatch(match.bestOf) },
				{ label: 'Main menu', key: 'KeyM', keyLabel: 'M', onSelect: enterMenu },
			],
		})
	}

	// --- Scoreboard ------------------------------------------------------------
	function pips(n) {
		let s = ''
		for (let i = 0; i < match.needed; i++) s += i < n ? '●' : '○'
		return s
	}
	function scoreLine() {
		return (
			`<span style="color:#5db4ff">You ${match.wins.A}</span>` +
			` — ` +
			`<span style="color:#ff5d5d">${match.wins.B} Foe</span>`
		)
	}
	function renderScore() {
		if (phase === 'menu') {
			scoreEl.hidden = true
			return
		}
		scoreEl.hidden = false
		scoreEl.innerHTML =
			`<span class="a">YOU ${pips(match.wins.A)}</span>` +
			`<span class="mid">best of ${match.bestOf} · round ${match.round}</span>` +
			`<span class="b">${pips(match.wins.B)} FOE</span>`
	}

	// --- Weapons (1/2/3) -------------------------------------------------------
	// The weapon is a property of the human shooter, not the ammo: you still grab
	// arrows from the scarce pool, but the selected weapon changes how a held
	// arrow is loosed. The charge bow's wind-up meter is its own component.
	let weapon = 'arrow'
	const charge = createChargeMeter()

	function setWeapon(w) {
		if (weapon === w || !WEAPONS[w]) return
		weapon = w
		charge.cancel()
		combat.push(`weapon → ${WEAPONS[w].label}`, 'pickup')
	}

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
	scene.add(aimMarker)

	const PREVIEW_N = 32
	const previewPos = new Float32Array(PREVIEW_N * 3)
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
			charge.cancel()
			return
		}
		raycaster.setFromCamera(pointerNDC(), camera)
		if (!raycaster.ray.intersectPlane(groundPlane, aimTarget)) {
			hideAim()
			return
		}
		aimMarker.position.set(aimTarget.x, 0.02, aimTarget.z)
		aimMarker.visible = true
		const p = h.mesh.position
		aimDir.set(aimTarget.x - p.x, 0, aimTarget.z - p.z)
		const dist = Math.hypot(aimDir.x, aimDir.z)
		if (dist < 1e-4) aimDir.set(0, 0, -1)
		aimDir.normalize()
		h.aim.copy(aimDir)
		const hand = h.handPosition()
		const def = WEAPONS[weapon]

		// The charge bow loads on hold and fires on release — its own input model.
		if (weapon === 'charge') {
			if (consumePress()) charge.press()
			if (pointerDown()) charge.update(dt)
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

		// Instant weapons (arrow, bowl): aim differs, but both fire on click.
		if (def.kind === 'bowl') {
			aimSpeed = tune.weapons.bowlSpeed
			updateGroundLine(hand)
		} else {
			aimSpeed = solveLaunch(dist, hand.y) // auto-solve to land on the reticle
			updateArc(hand, aimSpeed, TRAIL.arrow)
		}
		if (consumePress()) round.looseHuman(aimDir, aimSpeed, { kind: def.kind })
	}

	// Sample the (drag-free) parabola from the hand at a given speed/angle.
	function updateArc(hand, speed, color) {
		preview.visible = true
		preview.material.color.set(color)
		const { vx, vy } = launchVelocity(speed)
		const g = tune.physics.gravity // negative
		let n = 0
		for (let i = 0; i < PREVIEW_N; i++) {
			const t = i * 0.06
			const y = hand.y + vy * t + 0.5 * g * t * t
			previewPos[i * 3] = hand.x + aimDir.x * vx * t
			previewPos[i * 3 + 1] = Math.max(y, 0.02)
			previewPos[i * 3 + 2] = hand.z + aimDir.z * vx * t
			n = i + 1
			if (y <= 0) break
		}
		previewGeom.setDrawRange(0, n)
		previewGeom.attributes.position.needsUpdate = true
		preview.computeLineDistances()
	}

	// A flat ground line in the aim direction — the bowl's travel preview.
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
		if (round) for (const a of round.arrows) a.applyDamping()
	}, cheats)

	// Hotkeys during play:
	//   R         restart the current round (a real in-place reset — no reload)
	//   G         toggle godmode (you can't be eliminated)
	//   = / -     add / remove an enemy (Team B)
	//   ] / [     add / remove an ally (Team A, AI fights for you)
	// During roundOver/matchOver the overlay's own buttons own R/Enter.
	window.addEventListener('keydown', (e) => {
		if (e.code === 'KeyG') {
			tune.cheats.godmode = !tune.cheats.godmode
			combat.push(`godmode ${tune.cheats.godmode ? 'ON' : 'off'}`, tune.cheats.godmode ? 'win' : '')
			return
		}
		if (phase !== 'playing') return
		if (e.code === 'KeyR') return restartRound()
		if (e.code === 'Digit1') return setWeapon('arrow')
		if (e.code === 'Digit2') return setWeapon('charge')
		if (e.code === 'Digit3') return setWeapon('bowl')
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
		if (phase === 'playing' && round) {
			weaponUpdate(dt)
			if (!tune.physics.paused) {
				acc += dt * tune.physics.timeScale
				// Guard on phase too: a winning hit flips us out of 'playing' mid-step.
				while (acc >= world.timestep && phase === 'playing') {
					round.step(world.timestep, moveVector())
					acc -= world.timestep
				}
			}
			round.lateUpdate(dt)
		} else {
			hideAim()
		}

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
		if (hudTimer >= 0.1 || (weapon === 'charge' && charge.charging)) {
			hudTimer = 0
			updateHud()
		}

		requestAnimationFrame(frame)
	}

	function updateHud() {
		let status = ''
		if (round) {
			// Single pass each — the old code made three filtered copies of units and
			// one of arrows every refresh just to read their lengths.
			let allies = 0
			let enemiesLeft = 0
			for (const u of round.units) {
				if (!u.alive) continue
				if (u.team === 'A') allies++
				else if (u.team === 'B') enemiesLeft++
			}
			let grounded = 0
			for (const a of round.arrows) if (a.state === 'grounded') grounded++
			status = `team A: ${allies}  enemies left: ${enemiesLeft}  held: ${round.human.heldArrow ? 'yes' : '—'}  loose: ${grounded}\n`
		}
		hud.textContent =
			`arrrrow — milestone 7\n` +
			`WASD move · mouse aim · click shoot · R restart\n` +
			`G godmode · =/- enemy · ]/[ ally\n` +
			status +
			`weapon: ${WEAPONS[weapon].label}  (1 arrow · 2 charge · 3 bowl)${chargeBar()}\n` +
			`fps: ${fps}  [${phase}]${tune.physics.paused ? '  [paused]' : ''}${tune.cheats.godmode ? '  [GODMODE]' : ''}`
	}

	// ASCII wind-up meter for the charge bow: '=' filled, '.' empty, and the top
	// perfectWindow slice shown as '#'/'+' so you can see the perfect band.
	function chargeBar() {
		if (weapon !== 'charge') return ''
		const N = 24
		const lo = Math.round((1 - tune.weapons.perfectWindow) * N)
		const filled = Math.round(charge.value * N)
		let s = ''
		for (let i = 0; i < N; i++) {
			if (i < filled) s += i >= lo ? '#' : '='
			else s += i >= lo ? '+' : '.'
		}
		const tag = charge.charging
			? charge.perfect
				? '  PERFECT!'
				: `  ${Math.round(charge.value * 100)}%`
			: '  (hold to wind)'
		return `\ncharge [${s}]${tag}`
	}

	enterMenu()
	requestAnimationFrame(frame)
}

main().catch((err) => {
	console.error(err)
	log.error('boot failed', String(err))
	hud.textContent = 'boot error — see console\n' + err
})
