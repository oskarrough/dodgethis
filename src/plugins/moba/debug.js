import { tune } from './tune.js'
import { tune as coreTune } from '../../core/tune.js'
import { matchLink } from './setup.js'

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
	let paused = false
	let speed = tune.testing.speed
	const canPause = () => ready() && !app.session.shared && app.session.actions.includes('pause')
	const allowed = () =>
		canPause() && !sim.lane.match.winner && app.session.actions.includes('cheat')
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
		},
		get speed() {
			return speed
		},
		set speed(value) {
			if (
				!Number.isFinite(value) ||
				value < tune.testing.speedMin ||
				value > tune.testing.speedMax
			) {
				console.warn('MOBA: invalid debug speed; keeping', speed)
				return
			}
			speed = value
		},
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
			if (!allowed()) return false
			const hero = sim.heroes.find((h) => h.id === local)
			if (hero.dead) return false
			hero.cd.fill(0)
			return true
		},
		linkStatus: '',
		async copyLink() {
			try {
				await navigator.clipboard.writeText(matchLink(location.href, setup, botsOnly))
				controls.linkStatus = 'Copied'
				return true
			} catch (error) {
				controls.linkStatus = 'Copy failed — see console'
				console.warn('MOBA: could not copy match link', error)
				return false
			}
		},
	}
	run.clock.pause(() => paused)
	run.clock.scale(() => speed)
	run.intents.suspend(() => paused)
	run.debug.tune('match controls', controls, (folder, values) => {
		// Put the cheap controls first; detailed tuning stays available below them.
		for (const other of folder.parent.folders) other.close()
		folder.parent.$children.prepend(folder.domElement)
		folder.parent.open()
		folder.open()
		folder.add(values, 'paused').name('pause / resume').listen()
		folder.add(values, 'step').name('step one tick')
		folder
			.add(values, 'speed', tune.testing.speedMin, tune.testing.speedMax, tune.testing.speedStep)
			.name('speed ×')
			.listen()
		folder.add(values, 'copyLink').name('copy link')
		folder.add(values, 'linkStatus').name('clipboard').disable().listen()
		folder.add(values, 'respawn').name('respawn now')
		folder.add(values, 'resetCooldowns').name('reset cooldowns')
	})
	return controls
}
