import { tune } from './tune.js'
import { tune as coreTune } from '../../core/tune.js'
import { listedHeroes } from './heroes.js'
import { matchLink, parseTrySetup } from './setup.js'

export function createMatchDebug({
	app,
	run,
	sim,
	local,
	menu,
	setup,
	botsOnly,
	isLobby = false,
	ready = () => true,
	clearCamera,
}) {
	const initial = parseTrySetup(
		new URLSearchParams(globalThis.location?.search ?? ''),
		setup.tryMode,
	)
	let paused = initial.paused
	let speed = initial.speed
	const canPause = () => ready() && !app.session.shared && app.session.actions.includes('pause')
	const allowed = () =>
		canPause() && !sim.lane?.match.winner && app.session.actions.includes('cheat')
	const hero = () => sim.heroes.find((h) => h.id === local)
	const roster = () =>
		sim.heroes
			.filter((h) => h.id !== local)
			.map((h) => ({
				team: h.team,
				heroId: h.heroId,
				bot: !!sim.bots?.brains.some((b) => b.id === h.id),
			}))
	const state = () => ({
		noCooldowns: sim.training.noCooldowns,
		godMode: sim.training.godMode,
		waves: sim.training.waves,
		botsEnabled: sim.training.botsEnabled,
		paused,
		speed,
		level: hero().level,
		allyHero: controls.allyHero,
		enemyHero: controls.enemyHero,
		allyBot: controls.allyBot,
		enemyBot: controls.enemyBot,
		// Lobby humans and ready seats are not a custom Try Mode match roster.
		...(isLobby
			? initial.tryRoster === undefined
				? {}
				: { tryRoster: initial.tryRoster }
			: { tryRoster: roster() }),
	})
	const remember = () => {
		setup.tryMode = state()
	}
	const toggle = (key, value) => {
		if (!allowed()) return
		sim.setTraining({ [key]: !!value })
		remember()
	}
	const spawn = (allied) => {
		if (isLobby || !allowed()) return false
		const side = allied ? 'ally' : 'enemy'
		const team = allied ? hero().team : hero().team === 'A' ? 'B' : 'A'
		const spawned = sim.spawnHero(
			{
				team,
				heroId: controls[`${side}Hero`],
				bot: controls[`${side}Bot`],
				difficulty: allied ? 'normal' : setup.difficulty,
			},
			local,
		)
		remember()
		return !!spawned
	}
	const clear = (allied) => {
		if (isLobby || !allowed()) return false
		const team = allied ? hero().team : hero().team === 'A' ? 'B' : 'A'
		sim.clearHeroes(team, local)
		remember()
		return true
	}
	const controls = {
		get paused() {
			return paused || coreTune.physics.paused || menu.presentationFrozen()
		},
		set paused(value) {
			if (!canPause()) return
			paused = !!value
			menu.resume()
			if (!paused) coreTune.physics.paused = false
			app.intents.cancel(local)
			clearCamera()
			run.clock.reset()
			remember()
		},
		get speed() {
			return speed
		},
		set speed(value) {
			if (
				!canPause() ||
				!Number.isFinite(value) ||
				value < tune.testing.speedMin ||
				value > tune.testing.speedMax
			) {
				console.warn('MOBA: invalid debug speed; keeping', speed)
				return
			}
			speed = value
			remember()
		},
		get noCooldowns() {
			return sim.training.noCooldowns
		},
		set noCooldowns(value) {
			toggle('noCooldowns', value)
		},
		get godMode() {
			return sim.training.godMode
		},
		set godMode(value) {
			toggle('godMode', value)
		},
		get waves() {
			return sim.training.waves
		},
		set waves(value) {
			toggle('waves', value)
		},
		get botsEnabled() {
			return sim.training.botsEnabled
		},
		set botsEnabled(value) {
			toggle('botsEnabled', value)
		},
		get level() {
			return hero().level
		},
		set level(value) {
			if (!allowed() || !sim.setLevel(local, value)) return
			remember()
		},
		allyHero: initial.allyHero,
		enemyHero: initial.enemyHero,
		allyBot: initial.allyBot,
		enemyBot: initial.enemyBot,
		spawnAlly: () => spawn(true),
		spawnEnemy: () => spawn(false),
		clearAllies: () => clear(true),
		clearEnemies: () => clear(false),
		step() {
			if (!allowed()) return false
			if (!paused) controls.paused = true
			return run.clock.stepOnce()
		},
		respawn() {
			if (!allowed()) return false
			return sim.respawnNow(local)
		},
		resetCooldowns() {
			if (!allowed() || hero().dead) return false
			hero().cd.fill(0)
			return true
		},
		resetMatch() {
			if (isLobby || !canPause() || !app.session.actions.includes('restart')) return false
			remember()
			app.intents.cancel(local)
			clearCamera()
			coreTune.physics.paused = false
			app.modes.start('moba', { options: { setup } })
			return true
		},
		linkStatus: '',
		link: () => matchLink(location.href, setup, botsOnly, state()),
		async copyLink() {
			try {
				await navigator.clipboard.writeText(controls.link())
				controls.linkStatus = 'Copied'
				return true
			} catch (error) {
				controls.linkStatus = 'Copy failed — see console'
				console.warn('MOBA: could not copy match link', error)
				return false
			}
		},
	}
	if (!app.session.shared && app.session.actions.includes('cheat')) {
		sim.setTraining({
			local,
			noCooldowns: initial.noCooldowns,
			godMode: initial.godMode,
			waves: initial.waves,
			botsEnabled: initial.botsEnabled,
		})
		if (!isLobby && initial.tryRoster) {
			for (const team of ['A', 'B']) sim.clearHeroes(team, local)
			for (const seat of initial.tryRoster)
				sim.spawnHero(
					{ ...seat, difficulty: seat.team === hero().team ? 'normal' : setup.difficulty },
					local,
				)
		}
		if (initial.level !== hero().level) sim.setLevel(local, initial.level)
	} else {
		paused = false
		speed = tune.testing.speed
	}
	run.clock.pause(() => paused)
	run.clock.scale(() => speed)
	run.intents.suspend(() => paused)

	const featured = { 'match.speed': 'Game speed', 'lobby.speed': 'Game speed' }
	run.debug.tune('tryMode', controls, { featured }, (folder, values) => {
		const match = folder.addFolder(isLobby ? 'lobby' : 'match')
		match.add(values, 'paused').name('pause / resume').listen()
		match.add(values, 'step').name('step one tick')
		match
			.add(values, 'speed', tune.testing.speedMin, tune.testing.speedMax, tune.testing.speedStep)
			.name('speed ×')
			.listen().unit = 'multiplier'
		if (!isLobby) {
			match.add(values, 'waves').name('minion waves').listen()
			match.add(values, 'botsEnabled').name('bots active').listen()
			match.add(values, 'resetMatch').name('reset match')
		}
		const player = folder.addFolder('hero')
		player.add(values, 'noCooldowns').name('no cooldowns').listen()
		player.add(values, 'godMode').name('god mode').listen()
		player.add(values, 'level', tune.hero.level, tune.levels.cap, 1).name('team level').listen()
		player.add(values, 'respawn').name('respawn now')
		player.add(values, 'resetCooldowns').name('reset cooldowns')
		if (!isLobby) {
			const choices = Object.fromEntries(
				listedHeroes({ ...setup, debug: true }).map((h) => [h.name, h.id]),
			)
			for (const [name, side, spawnKey, clearKey] of [
				['allies', 'ally', 'spawnAlly', 'clearAllies'],
				['enemies', 'enemy', 'spawnEnemy', 'clearEnemies'],
			]) {
				const team = folder.addFolder(name)
				team.add(values, `${side}Hero`, choices).name('hero').onChange(remember)
				team.add(values, `${side}Bot`).name('spawn as bot').onChange(remember)
				team.add(values, spawnKey).name('spawn hero')
				team.add(values, clearKey).name('clear heroes')
			}
		}
		folder.add(values, 'copyLink').name('copy Try Mode link')
		folder.add(values, 'linkStatus').name('clipboard').disable().listen()
	})
	return controls
}
