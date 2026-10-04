import { createRound } from './round.js'
import { createReplicaRound, snapshotRound } from './replica.js'
import { createActions } from './actions.js'
import { createPortal } from './portal.js'
import { sfx, isMusicEnabled, setMusicEnabled, setMusicScene } from '../../core/audio.js'
import { SOLO } from '../../core/app.js'
import { validateRoster } from '../../core/roster.js'
import { tune } from './tune.js'
import { tune as coreTune } from '../../core/tune.js'

// Difficulty portals map to court obstacle layouts; anything else plays on the open court.
const LAYOUT_BY_ENEMIES = { 1: 'open', 2: 'pillars', 3: 'walls' }
const PHASES = ['playing', 'roundOver', 'matchOver']
const count = (n, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(n) && n >= 0 && n <= max

// Owns match lifetime, score, menus, and the input handoff between scenes.
// `session` decides the rest: a solo flow has the hub, fades and pause; a shared one plays a fixed roster, and only its authority builds rounds.
export function createMatchFlow({
	ctx,
	overlay,
	fadeEl,
	splashEl,
	clearActions,
	resetPresentation,
	onChange,
	onTheme,
	session = SOLO,
	actions = createActions(),
	onMenu = () => {},
}) {
	// --- Game state machine (Godot framing) -----------------------------------
	// phase drives the frame loop and which overlay is up (menu → playing → roundOver → … → matchOver); match holds the best-of-N score, `round` is the live scene or null.
	const { combat } = ctx
	const { shared, authoritative } = session
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
	let participants
	let localParticipantId
	let phase = 'menu'
	let round = null
	let roundId = 0 // every round built, replays included; a replica rebuilds when it changes
	let portals = []
	let teleporting = false
	let transitionTimer = null
	let roundScored = false
	let lastWinner = null

	function transition(label, arrive) {
		if (teleporting) return
		// A shared match has no fades: every screen changes round at once.
		if (shared) {
			clearActions()
			overlay.hide()
			arrive()
			return
		}
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
			coreTune.physics.paused = false
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
						coreTune.output.rumble = tune.fx.impact
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
	// The menu IS a hub round — no enemies, no scoring; free-roam and step into a portal to commit to a match.
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
		onTheme(0, 'open') // the hub round is always the open court
		// Re-showing restarts the CSS letter animations, so the title bounces in fresh.
		splashEl.hidden = false
		round = createRound(ctx, { enemies: 0, arrowCount: 0, roundNum: 0, hub: true })
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

	// Step-into-portal check, run each frame while roaming the hub.
	function checkPortals() {
		if (!round || !round.localPlayer || !round.localPlayer.alive) return
		const p = round.localPlayer.position
		for (const portal of portals) {
			if (portal.trigger(p.x, p.z)) {
				teleportTo(portal.enemies)
				return
			}
		}
	}

	function startMatch(enemies, options = {}) {
		configure(enemies, options)
		combat.push(
			`match start — ${enemies} enemies, best of ${BEST_OF}, first to ${match.needed}`,
			'win',
		)
		startRound()
	}

	function configure(
		enemies,
		{
			allies = 0,
			arrowCount = 7,
			seed,
			layout,
			theme = enemies,
			hp = 1,
			roster,
			localParticipantId: localId,
		} = {},
	) {
		participants = roster
		localParticipantId = localId
		match.layout = layout ?? LAYOUT_BY_ENEMIES[enemies] ?? 'open'
		match.theme = theme
		onTheme(theme, match.layout)
		match.allies = allies
		match.arrowCount = arrowCount
		match.seed = seed
		match.hp = hp
		match.bestOf = BEST_OF
		match.needed = Math.floor(BEST_OF / 2) + 1 // first to a majority of rounds
		match.wins.A = 0
		match.wins.B = 0
		match.round = 0
		match.enemies = enemies
	}

	// A match on a fixed roster with no hub, as a shared session plays it. The authority builds rounds; a replica shows spawn poses until apply().
	function startRoster(roster) {
		const localId = session.local[0]
		const people = validateRoster(roster)
		const me = people.find((p) => p.id === localId)
		if (me?.controller !== 'human')
			throw new Error('The local participant must be a human in the roster')
		const enemies = people.filter((p) => p.team !== me.team).length
		const options = {
			allies: people.filter((p) => p.team === me.team).length - 1,
			// Every human starts armed, and the court keeps seven loose at least.
			arrowCount: Math.max(7, people.filter((p) => p.controller === 'human').length),
			layout: 'open',
			theme: 3,
			roster: people,
			localParticipantId: localId,
		}
		clearPortals()
		if (authoritative) return startMatch(enemies, options)
		configure(enemies, options)
		round?.dispose()
		round = createReplicaRound(ctx, { roster: people, localParticipantId: localId })
		phase = 'playing'
		overlay.hide()
		splashEl.hidden = true
		onChange()
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
		roundId++
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
			hp: match.hp,
			roundNum: match.round,
			onOver: endRound,
			roster: participants,
			localParticipantId,
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
		lastWinner = winner ?? null
		if (!winner) {
			phase = 'roundOver'
			onChange()
			combat.push(`round ${match.round} is a DRAW — replaying`, 'win')
			showResult()
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
		showResult()
	}

	function endMatch(winner) {
		lastWinner = winner
		phase = 'matchOver'
		onChange()
		combat.push(`Team ${winner} wins the match ${match.wins.A}–${match.wins.B}!`, 'win')
		showResult()
	}

	// The verdict card. Solo offers the hub; a shared match gives the next step to its authority alone, and everyone the menu.
	function showResult() {
		const over = phase === 'matchOver'
		const won = lastWinner === (round?.localPlayer?.team ?? 'A')
		const title =
			lastWinner === null
				? 'DRAW'
				: over
					? won
						? 'YOU WIN'
						: 'YOU LOSE'
					: won
						? 'ROUND WON'
						: 'ROUND LOST'
		const next = {
			keyLabel: 'Enter',
			...(lastWinner === null
				? { label: 'Replay round', onSelect: restartRound }
				: over
					? {
							label: 'Rematch',
							onSelect: () =>
								transition('ROUND 1 · AGAIN', () =>
									startMatch(match.enemies, { ...match, roster: participants, localParticipantId }),
								),
						}
					: {
							label: 'Next round',
							onSelect: () => transition(`ROUND ${match.round + 1}`, startRound),
						}),
		}
		if (shared) {
			overlay.show({
				title,
				subtitle: `${match.wins.A}–${match.wins.B}${authoritative ? '' : ' · Waiting for the next round'}`,
				actions: [...(authoritative ? [next] : []), { label: 'Menu', onSelect: onMenu }],
			})
			return
		}
		const hub = {
			label: 'Back to hub',
			key: 'KeyM',
			keyLabel: 'M',
			onSelect: () => transition('BACK TO THE COURT', enterHub),
		}
		const harder =
			over && match.enemies < 3 && match.allies === 0
				? [
						{
							label: 'Try harder',
							onSelect: () => transition('STEP IT UP', () => startMatch(match.enemies + 1)),
						},
					]
				: []
		overlay.show({
			title,
			clear: !over,
			actions: lastWinner === null ? [next] : [next, ...harder, hub],
		})
	}

	// One simulation step: every human seat's intent frame through the actions, then the round.
	function step(dt, intents) {
		const frames = new Map()
		for (const unit of round.units)
			if (unit.isHuman) frames.set(unit.participantId, intents.get(unit.participantId))
		const moves = actions.step(round, frames, dt, intents.consume)
		round.step(dt, moves.get(round.localParticipantId), moves)
	}

	// The replicated state: the flow's verdict plus the round's bodies and arrows. Plain JSON.
	function snapshot() {
		return {
			roundId,
			phase,
			winner: lastWinner,
			round: match.round,
			wins: { ...match.wins },
			world: round ? snapshotRound(round) : null,
		}
	}

	function validState(state) {
		return (
			!!state &&
			count(state.roundId) &&
			state.roundId >= Math.max(roundId, 1) &&
			PHASES.includes(state.phase) &&
			[null, 'A', 'B'].includes(state.winner) &&
			count(state.round) &&
			state.round >= 1 &&
			!!state.wins &&
			['A', 'B'].every((team) => count(state.wins[team], match.needed))
		)
	}

	// A replica takes the authority's state: checked whole first, a new round rebuilt only once its first state is known good.
	function apply(state, now) {
		if (authoritative || !participants || !validState(state)) return false
		const fresh = state.roundId !== roundId
		const next = fresh
			? createReplicaRound(ctx, { roster: participants, localParticipantId })
			: round
		if (!next.push(state.world, now)) {
			if (fresh) next.dispose()
			return false
		}
		if (fresh) {
			round?.dispose()
			round = next
			roundId = state.roundId
			resetPresentation()
			clearActions()
			overlay.hide()
		}
		const was = phase
		phase = state.phase
		lastWinner = state.winner
		match.round = state.round
		match.wins.A = state.wins.A
		match.wins.B = state.wins.B
		if (phase !== 'playing' && (was !== phase || fresh)) {
			if (lastWinner) sfx.win()
			showResult()
		}
		onChange()
		return true
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
		actions,
		enterHub,
		startRoster,
		step,
		snapshot,
		apply,
		enterPortal: teleportTo,
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
