import { tune } from './tune.js'
import { tune as coreTune } from '../../core/tune.js'
import { HEROES } from './heroes.js'
import { sliderSections } from './sliders.js'
import { matchLink, parseTrySetup } from './setup.js'

export function createMatchDebug({
	app,
	run,
	sim,
	local,
	menu,
	setup,
	botsOnly,
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
		canPause() && !sim.lane.match.winner && app.session.actions.includes('cheat')
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
		tryRoster: roster(),
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
		if (!allowed()) return false
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
		if (!allowed()) return false
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
			if (!canPause() || !app.session.actions.includes('restart')) return false
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
		if (initial.tryRoster) {
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

	// Restore DOM-only grouping before the debug service removes its run's folders.
	let restorePanel = () => {}
	const groups = []
	run.signal.addEventListener(
		'abort',
		() => {
			restorePanel()
			for (const group of groups) group.destroy()
		},
		{ once: true },
	)
	run.debug.tune('Try Mode', controls, (folder, values) => {
		const root = folder.parent
		root.title('MOBA / Try Mode')
		const group = (name) => {
			const child = folder.addFolder(name)
			groups.push(child)
			return child
		}
		const match = group('Match')
		match.add(values, 'paused').name('pause / resume').listen()
		match.add(values, 'step').name('step one tick')
		match
			.add(values, 'speed', tune.testing.speedMin, tune.testing.speedMax, tune.testing.speedStep)
			.name('speed ×')
			.listen()
		match.add(values, 'waves').name('minion waves').listen()
		match.add(values, 'botsEnabled').name('bots active').listen()
		match.add(values, 'resetMatch').name('reset match')
		const player = group('Your hero')
		player.add(values, 'noCooldowns').name('no cooldowns').listen()
		player.add(values, 'godMode').name('god mode').listen()
		player.add(values, 'level', tune.hero.level, tune.levels.cap, 1).name('team level').listen()
		player.add(values, 'respawn').name('respawn now')
		player.add(values, 'resetCooldowns').name('reset cooldowns')
		const choices = Object.fromEntries(
			Object.values(HEROES)
				.filter((h) => h.playable)
				.map((h) => [h.id[0].toUpperCase() + h.id.slice(1), h.id]),
		)
		for (const [name, side, spawnKey, clearKey] of [
			['Allied heroes', 'ally', 'spawnAlly', 'clearAllies'],
			['Enemy heroes', 'enemy', 'spawnEnemy', 'clearEnemies'],
		]) {
			const team = group(name)
			team.add(values, `${side}Hero`, choices).name('hero').onChange(remember)
			team.add(values, `${side}Bot`).name('spawn as bot').onChange(remember)
			team.add(values, spawnKey).name('spawn hero')
			team.add(values, clearKey).name('clear heroes')
		}
		folder.add(values, 'copyLink').name('copy Try Mode link')
		folder.add(values, 'linkStatus').name('clipboard').disable().listen()

		// Right-clicks over the panel still order on the ground beneath it.
		root.domElement.addEventListener(
			'mousedown',
			(event) => {
				if (event.button !== 2) return
				event.preventDefault()
				event.stopPropagation()
				app.renderer.domElement.dispatchEvent(
					new MouseEvent('mousedown', {
						button: event.button,
						buttons: event.buttons,
						clientX: event.clientX,
						clientY: event.clientY,
						bubbles: true,
					}),
				)
			},
			{ capture: true, signal: run.signal },
		)
		root.domElement.addEventListener('contextmenu', (event) => event.preventDefault(), {
			signal: run.signal,
		})

		// Other plugin registrations are long-lived; hide them, don't destroy them.
		queueMicrotask(() => {
			if (run.signal.aborted) return
			const tuneGroup = root.addFolder('Tune').close()
			const active = new Set([
				...sliderSections(tune, setup).map(([name]) => name),
				'cast',
				'hud',
				'edge pan',
				'kit',
				'physics',
				'pointClick',
				'output',
				'debug',
			])
			const oldTitle = 'dodgethis / debug'
			const others = root.folders.filter((f) => f !== folder && f !== tuneGroup)
			for (const other of others) {
				other.close()
				if (active.has(other._title)) tuneGroup.$children.append(other.domElement)
				else other.hide()
			}
			root.$children.prepend(folder.domElement)
			root.open()
			folder.open()
			restorePanel = () => {
				for (const other of others) {
					root.$children.append(other.domElement)
					other.show()
				}
				tuneGroup.destroy()
				root.title(oldTitle)
			}
		})
	})
	return controls
}
