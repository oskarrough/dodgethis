import { createJuice } from '../../core/juice.js'
import { createShadows } from '../../core/shadows.js'
import { tune as coreTune } from '../../core/tune.js'
import { tune } from './tune.js'
import { buildMap, FLOOR } from './map.js'
import { createSim } from './sim.js'
import { createFollow } from './follow.js'
import { createCameraControls } from './camera-controls.js'
import { createCursor } from './cursor.js'
import { createView } from './view.js'
import { createSkillsView } from './skills-view.js'
import { createHud } from './hud.js'
import { createPips } from './pips.js'
import { createSounds } from './sounds.js'
import { createFeedback } from './feedback.js'

const FACTS = [
	'order',
	'cast',
	'projectile',
	'blocked',
	'hit',
	'nearMiss',
	'death',
	'spawn',
	'denied',
	'impact',
	'aggro',
	'expired',
	'xp',
	'structureDown',
]

// Lane slice: one hero, two towers and opposing minion waves.
// Boots with ?mode=moba. Everything lives as long as a run of the mode.
export default function moba(app) {
	const { scene, world, RAPIER, input, audio } = app
	const sfx = createSounds(audio)
	let runs = 0

	app.modes.define('moba', {
		scheme: 'pointClick',
		start(run) {
			const local = app.session.local[0]
			app.setPalette({})
			document.documentElement.style.removeProperty('--page-bg')
			audio.setMusicScene('play')
			const unbuild = buildMap(scene, world, RAPIER)
			const juice = createJuice(scene)
			const shadows = createShadows(scene, {
				onGround: (x, z) => Math.abs(x) <= FLOOR.halfX && Math.abs(z) <= FLOOR.halfZ,
			})
			const view = createView(scene, run.smooth)
			const skillsView = createSkillsView(scene)
			const hud = createHud()
			const pips = createPips()
			const follow = createFollow()
			const cameraControls = createCameraControls(window, run.signal, follow)
			const cursor = createCursor(app.renderer.domElement)
			const sim = createSim({
				scene,
				world,
				RAPIER,
				intents: run.intents,
				heroes: [{ id: local, team: 'A' }],
				smooth: run.smooth,
				present: run.present,
				lane: true,
			})
			const hero = sim.heroes[0]
			const feedback = createFeedback({
				juice,
				sfx,
				camera: app.camera,
				input,
				view,
				skillsView,
				hud,
				sim,
				local,
			})
			app.clock.reset()

			let paused = false
			run.clock.pause(() => paused)
			run.clock.scale(feedback.beat)
			run.intents.suspend(() => paused || coreTune.physics.paused)
			run.input.stickAim((dir, magnitude, slot) => sim.stickAim(local, dir, magnitude, slot))

			const onPad = () => input.activeDevice() === 'gamepad'
			run.camera.frame((dt) => {
				const frame = app.intents.get(local)
				const pad = onPad()
				const aim = pad && Object.keys(frame.held).length ? frame.aim : null
				return follow.frame(dt, hero.body.mesh.position, aim, { ...cameraControls.read(), pad })
			})

			run.system('simulate', (dt) => sim.step(dt))
			run.on('present', feedback.present)

			const locate = (id) => {
				const unit = sim.find(id)
				return unit?.body.mesh.position ?? null
			}
			run.system('present', ({ dt, gameDt, alpha }) => {
				const frozen = paused || coreTune.physics.paused
				const step = frozen ? 0 : gameDt
				const frame = app.intents.get(local)
				const p = hero.body.mesh.position
				audio.setAudioListener(p)
				if (!hero.dead && hero.body.animate(step, hero.cast || hero.attack ? 1 : 0)) sfx.step(p)
				for (const d of sim.dummies) if (!d.dead) d.body.animate(step)
				const target = !onPad() && frame.aim ? sim.pick(hero.team, frame.aim) : null
				const hovered = target && locate(target.id)
				cursor.update({
					enemy: !!target,
					aiming: ['slot1', 'slot2', 'slot3', 'slot4'].some((s) => frame.held[s]),
					pad: onPad(),
					paused: frozen,
				})
				sim.laneView.update(sim.lane, sim.heroes, frozen ? 0 : alpha, locate, step)
				const gone = view.update(step, {
					live: new Set(sim.shots.map((s) => s.id)),
					hero: p,
					aim: hero.cast?.slot === 'slot1' ? hero.cast.target : frame.aim,
					held: !hero.dead && (frame.held.slot1 || hero.cast?.slot === 'slot1'),
					units: [...sim.heroes, ...sim.lane.minions, ...sim.lane.structures],
					hovered,
					locate,
				})
				skillsView.update(step, {
					hero: p,
					aim: frame.aim,
					held: hero.dead ? {} : frame.held,
					zones: sim.zones,
					casters: [...sim.heroes, ...sim.dummies].filter((unit) => unit.team !== hero.team),
					alpha: frozen ? 0 : alpha,
				})
				feedback.fizzle(gone)
				juice.update(step)
				shadows.update((cast) => {
					if (!hero.dead) cast(p.x, p.y - hero.body.radius - hero.body.halfHeight, p.z, 0.5)
					for (const d of sim.dummies) {
						if (d.dead) continue
						const q = d.body.mesh.position
						cast(q.x, q.y - d.body.radius - d.body.halfHeight, q.z, 0.5)
					}
				})
				hud.update(dt, {
					cooldowns: hero.cd
						.slice(0, 3)
						.map((cd) => Math.max(0, cd - (frozen ? 0 : alpha)) * app.clock.step),
					totals: [tune.loose.cooldown, tune.vault.cooldown, tune.rain.cooldown],
					device: input.activeDevice(),
					pausedNow: paused,
					hp: hero.hp,
					maxHp: hero.maxHp,
					respawn: hero.dead
						? Math.max(0, hero.respawnTick - sim.tick - (frozen ? 0 : alpha)) * app.clock.step
						: null,
				})
				app.camera.update(frozen ? 0 : dt)
				pips.update(app.camera.view, [...sim.heroes, ...sim.dummies], hero.team)
			})

			function togglePause() {
				if (!app.session.actions.includes('pause')) return
				paused = !paused
				cameraControls.clear()
				sfx[paused ? 'menuOpen' : 'menuClose']()
			}
			run.on('menu', togglePause)
			run.on('blur', () => app.intents.cancel(local))
			const onKey = (e) => {
				if (e.defaultPrevented || e.code === 'Backquote') return
				if (e.type === 'keydown' && !e.repeat && e.code === 'Escape') togglePause()
			}
			window.addEventListener('keydown', onKey, { signal: run.signal })
			window.addEventListener('keyup', onKey, { signal: run.signal })

			run.debug.tune('tower', tune.tower, (f, t) => {
				f.add(t, 'hp', 100, 6000, 100).name('HP (applies on restart)')
				f.add(t, 'x', 10, 25, 1).name('position (applies on restart)')
				f.add(t, 'radius', 0.5, 2, 0.1).name('radius (applies on restart)')
				f.add(t, 'damage', 1, 300, 1)
				f.add(t, 'rate', 0.25, 3, 0.05)
				f.add(t, 'range', 1, 12, 0.25)
				f.add(t, 'speed', 1, 40, 1)
				f.add(t, 'tell', 0.3, 1, app.clock.step)
			})
			run.debug.tune('waves', tune.waves, (f, t) => {
				f.add(t, 'first', app.clock.step, 30, app.clock.step).name(
					'first wave (applies on restart)',
				)
				f.add(t, 'interval', app.clock.step, 60, app.clock.step).name('interval (next scheduling)')
				f.add(t, 'aggro', 1, 10, 0.25)
				f.add(t, 'helpHold', app.clock.step, 5, app.clock.step)
				f.add(t, 'leash', 1, 12, 0.25)
				f.add(t, 'soak', 1, 20, 0.5)
			})
			for (const kind of ['melee', 'ranged', 'wizard'])
				run.debug.tune(kind, tune.minions[kind], (f, t) => {
					f.add(t, 'hp', 1, 1000, 1).name('HP (next spawn)')
					f.add(t, 'damage', 1, 100, 1)
					f.add(t, 'rate', 0.1, 3, 0.05)
					f.add(t, 'range', 0.1, 8, 0.1)
					f.add(t, 'speed', 0, 8, 0.1)
					f.add(t, 'tell', 0.3, 1, app.clock.step)
					f.add(t, 'xp', 0, 200, 1)
				})
			// --- Tune GUI: moba's sections come and go with the run; the values live in tune.js and survive restarts. ---
			run.debug.tune('hero', tune.hero, (f, t) => {
				f.add(t, 'hp', 200, 3000, 100).name('HP (applies on restart)')
				f.add(t, 'speed', 1, 12, 0.1)
				f.add(t, 'accel', 1, 80, 1)
				f.add(t, 'friction', 0, 40, 0.5)
				f.add(t, 'stopFriction', 0, 60, 0.5).name('stop friction')
				f.add(t, 'stopSpeed', 0, 6, 0.1).name('stop speed')
				f.add(t, 'turnRate', 90, 3600, 30).name('turn rate (°/s)')
			})
			run.debug.tune('attack', tune.attack, (f, t) => {
				f.add(t, 'damage', 10, 300, 5)
				f.add(t, 'rate', 0.25, 3, 0.05)
				f.add(t, 'windup', app.clock.step, 0.5, app.clock.step)
				f.add(t, 'backswing', app.clock.step, 0.5, app.clock.step)
				f.add(t, 'speed', 8, 60, 1)
				f.add(t, 'radius', 0.05, 0.5, 0.01)
				f.add(t, 'visualScale', 0.1, 1, 0.05)
			})
			run.debug.tune('respawn', tune.respawn, (f, t) => {
				f.add(t, 'base', app.clock.step, 20, app.clock.step)
				f.add(t, 'perLevel', app.clock.step, 5, app.clock.step)
			})
			run.debug.tune('momentum', tune.momentum, (f, t) => {
				f.add(t, 'reduction', 0, 4, 0.25).name('Vault recharge (s)')
			})
			run.debug.tune('orders', tune.orders, (f, t) => {
				f.add(t, 'pick', 0, 2, 0.05).name('attack pick (m)')
				f.add(t, 'carrot', 0.1, 3, 0.05).name('carrot (m)')
				f.add(t, 'arrival', 0.01, 0.5, 0.01).name('arrival (m)')
				f.add(t, 'rejoinDistance', 0.05, 1, 0.05).name('rejoin after displacement (m)')
				f.add(t, 'stallProgress', 0, 1, 0.05).name('repath below ×')
				f.add(t, 'stallTime', 0.05, 1, 0.05).name('repath after (s)')
				f.add(t, 'clearance', 0, 0.5, 0.01).name('obstacle clearance')
				f.add(t, 'attackRange', 1, 10, 0.25).name('attack range')
			})
			run.debug.tune('loose', tune.loose, (f, t) => {
				f.add(t, 'damage', 10, 500, 10)
				f.add(t, 'speed', 6, 60, 0.5).name('speed (m/s)')
				f.add(t, 'range', 3, 30, 0.5)
				f.add(t, 'radius', 0.05, 1.5, 0.05)
				f.add(t, 'castPoint', app.clock.step, 0.5, app.clock.step).name('cast point (s)')
				f.add(t, 'cooldown', 0.2, 10, 0.1).name('cooldown (s)')
				f.add(t, 'nearMiss', 0, 2, 0.05).name('near miss (m)')
			})
			run.debug.tune('rain', tune.rain, (f, t) => {
				f.add(t, 'damage', 10, 500, 10)
				f.add(t, 'castPoint', app.clock.step, 1, app.clock.step)
				f.add(t, 'range', 1, 20, 0.25)
				f.add(t, 'radius', 0.1, 6, 0.1)
				f.add(t, 'delay', app.clock.step, 3, app.clock.step)
				f.add(t, 'slow', 0, 1, 0.01)
				f.add(t, 'duration', 0.1, 5, 0.1)
				f.add(t, 'cooldown', 0.2, 15, 0.1)
			})
			run.debug.tune('vault', tune.vault, (f, t) => {
				f.add(t, 'castPoint', app.clock.step, 1, app.clock.step)
				f.add(t, 'range', 0.5, 10, 0.25)
				f.add(t, 'time', app.clock.step, 1, app.clock.step)
				f.add(t, 'cooldown', 0.2, 10, 0.1)
			})
			run.debug.tune('stickAim', tune.stickAim, (f, t) => {
				f.add(t, 'inMin', 0, 1, 0.01).name('stick from')
				f.add(t, 'inMax', 0, 1, 0.01).name('stick to')
				f.add(t, 'outMin', 0, 1, 0.01).name('reach from ×')
				f.add(t, 'assistAngle', 0, 30, 0.5).name('assist (°)')
				f.add(t, 'assistBend', 0, 1, 0.05).name('assist bend')
			})
			run.debug.tune('follow', tune.follow, (f, t) => {
				f.add(t, 'pan', 5, 40, 0.5).name('pan (m/s)')
				f.add(t, 'height', 5, 40, 0.5)
				f.add(t, 'back', 0, 30, 0.5)
				f.add(t, 'fov', 20, 70, 1)
				f.add(t, 'response', 0.02, 0.6, 0.01).name('response (s)')
				f.add(t, 'lookAhead', 0, 0.6, 0.01).name('pad look ahead ×')
				f.add(t, 'lookCap', 0, 8, 0.25).name('pad look cap (m)')
			})
			run.debug.tune('dummies', tune.dummies, (f, t) => {
				f.add(t, 'speed', 0, 8, 0.25)
				f.add(t, 'flipMin', 0.1, 3, 0.05).name('flip min (s)')
				f.add(t, 'flipMax', 0.1, 4, 0.05).name('flip max (s)')
				f.add(t, 'span', 0.5, 10, 0.5).name('span (m)')
				f.add(t, 'hp', 200, 3000, 100).name('HP on respawn')
				f.add(t, 'tell', 0.3, 1, app.clock.step).name('Q warning (s)')
				f.add(t, 'castEvery', 1, 10, 0.25).name('cast interval')
				f.add(t, 'respawn', 0.2, 10, 0.1).name('respawn (s)')
			})
			for (const [name, sound] of Object.entries(tune.sounds)) {
				run.debug.tune(`sound ${name}`, sound, (f, t) => {
					f.add(t, 'freq', 20, 2400, 10)
					f.add(t, 'slideTo', 20, 2400, 10)
					f.add(t, 'dur', app.clock.step, 0.6, app.clock.step)
					f.add(t, 'gain', 0, 1, 0.01)
				})
			}
			run.debug.tune('juice', tune.juice, (f, t) => {
				f.add(t, 'attackSquash', -0.3, 0.3, 0.01)
				f.add(t, 'castSquash', -0.3, 0.3, 0.01)
				f.add(t, 'vaultSquash', -0.3, 0.3, 0.01)
				f.add(t, 'rainSquash', -0.3, 0.3, 0.01)
				f.add(t, 'flash', 0, 0.3, 0.01).name('hit flash (s)')
				f.add(t, 'hitstop', 0, 0.3, 0.005).name('hitstop (s)')
				f.add(t, 'shakeTaken', 0, 1, 0.05).name('shake on you')
				f.add(t, 'shakeTakedown', 0, 1, 0.05).name('shake takedown')
			})
			run.debug.expose({
				moba: {
					sim,
					snapshot: () => sim.snapshot(),
				},
			})

			run.signal.addEventListener('abort', () => {
				cursor.dispose()
				feedback.reset()
				view.dispose()
				skillsView.dispose()
				hud.dispose()
				pips.dispose()
				juice.dispose()
				shadows.dispose()
				sim.dispose()
				unbuild()
			})

			return {
				epoch: ++runs,
				snapshot: sim.snapshot,
				apply: () => false, // no replica until M6
				validFact,
			}
		},
	})
}

// A fact is a known type carrying plain data: finite numbers, strings, booleans and nulls, shallowly nested.
export function validFact(fact) {
	if (!fact || typeof fact !== 'object' || !FACTS.includes(fact.type)) return false
	const plain = (v, depth) => {
		if (v === null || typeof v === 'string' || typeof v === 'boolean') return true
		if (typeof v === 'number') return Number.isFinite(v)
		if (depth > 2 || typeof v !== 'object' || Array.isArray(v)) return false
		return Object.values(v).every((x) => plain(x, depth + 1))
	}
	return plain(fact, 0)
}
