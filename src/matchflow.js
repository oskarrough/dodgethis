import { createRound } from './round.js'
import { createPortal } from './portal.js'
import { sfx, isMusicEnabled, setMusicEnabled, setMusicScene } from './audio.js'
import { tune } from './tune.js'

// Owns match lifetime, score, menus, and the input handoff between scenes.
export function createMatchFlow({
	ctx,
	overlay,
	fadeEl,
	splashEl,
	portalOptions,
	clearActions,
	resetPresentation,
	onChange,
	onTheme,
}) {
	// --- Game state machine (Godot framing) -----------------------------------
	// phase drives the frame loop and which overlay is up (menu → playing → roundOver → … → matchOver); match holds the best-of-N score, `round` is the live scene or null.
	const { combat } = ctx
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
	let roundScored = false
	let lastWinner = null
	let lastDifficulty = 0
	try {
		lastDifficulty = Number(localStorage.getItem('dodgethis.difficulty'))
	} catch {
		/* storage may be unavailable */
	}

	function transition(label, arrive) {
		if (teleporting) return
		teleporting = true
		setMusicScene('paused')
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
			setMusicScene('paused')
			showPause()
		}
	}

	function showPause() {
		overlay.show({
			title: 'PAUSED',
			subtitle: `Round ${match.round} · ${match.wins.A}–${match.wins.B}`,
			actions: [
				{ label: 'Resume', keyLabel: 'Enter', onSelect: togglePause },
				{
					label: `Music: ${isMusicEnabled() ? 'On' : 'Off'}`,
					onSelect: () => {
						setMusicEnabled(!isMusicEnabled())
						showPause()
					},
				},
				{
					label: `Impact effects: ${tune.fx.impact ? 'On' : 'Off'}`,
					onSelect: () => {
						tune.fx.impact = !tune.fx.impact
						tune.fx.rumble = tune.fx.impact
						showPause()
					},
				},
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

	// --- The hub: a live, physical splash ------------------------------------
	// The menu IS a lobby round — no enemies, no scoring; free-roam and step into a portal to commit to a match.
	function enterHub() {
		clearActions()
		resetPresentation()
		if (round) {
			round.dispose()
			round = null
		}
		clearPortals()
		overlay.hide()
		phase = 'menu'
		onTheme(0)
		// Re-showing restarts the CSS letter animations, so the title bounces in fresh.
		splashEl.hidden = false
		for (const button of portalOptions) {
			const recent = Number(button.dataset.enemies) === lastDifficulty
			button.classList.toggle('recent', recent)
			if (recent) button.setAttribute('aria-description', 'Last played difficulty')
			else button.removeAttribute('aria-description')
		}
		round = createRound(ctx, { enemies: 0, arrowCount: 0, roundNum: 0, lobby: true })
		onChange()
		// Three difficulty portals; stepping in starts a best-of-3 match with that many enemies.
		for (const s of [
			{ x: -3.5, enemies: 1 },
			{ x: 0, enemies: 2 },
			{ x: 3.5, enemies: 3 },
		]) {
			portals.push(createPortal(ctx.scene, { x: s.x, z: -3, enemies: s.enemies }))
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

	// Splash difficulties in printed order — the same list the 1-9 keys and the printed hint use, so a fourth mode numbers itself.
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
		onTheme(enemies)
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

	// Build a fresh round (incrementing the counter) and start play — disposing the old round is the real reset that replaced location.reload().
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
		lastWinner = null
		clearActions()
		resetPresentation()
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
		phase = 'playing'
		overlay.hide()
		splashEl.hidden = true
		onChange()
	}

	// round.onOver handler: tally the win, then advance or end the match; a null winner (simultaneous wipe) is a draw — nobody scores, round replays. Card is verdict + actions only.
	function endRound(winner) {
		if (phase !== 'playing' || roundScored) return
		lastWinner = winner
		if (!winner) {
			phase = 'roundOver'
			onChange()
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
		onChange()
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
		lastWinner = winner
		phase = 'matchOver'
		onChange()
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

	function cancelTransition() {
		clearTimeout(transitionTimer)
		transitionTimer = null
		teleporting = false
		fadeEl.classList.remove('active')
	}
	function dispose() {
		cancelTransition()
		clearPortals()
		round?.dispose()
		round = null
	}
	return {
		get winner() {
			return lastWinner
		},
		get phase() {
			return phase
		},
		get round() {
			return round
		},
		get portals() {
			return portals
		},
		get transitioning() {
			return teleporting
		},
		match,
		enterHub,
		startMatch,
		restartRound,
		endRound,
		endMatch,
		togglePause,
		transition,
		checkPortals,
		cancelTransition,
		dispose,
	}
}
