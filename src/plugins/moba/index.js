import { createJuice } from '../../core/juice.js'
import { createShadows } from '../../core/shadows.js'
import { tune as coreTune } from '../../core/tune.js'
import { tune } from './tune.js'
import { buildMap, FLOOR } from './map.js'
import { createSim } from './sim.js'
import { createFollow } from './follow.js'
import { createView } from './view.js'
import { createHud } from './hud.js'
import { createFeedback } from './feedback.js'

const FACTS = ['order', 'cast', 'projectile', 'hit', 'nearMiss', 'death', 'spawn', 'denied']

// Moba, milestone 1 (docs/moba-plan.md): one hero on an empty floor with pillars and two strafing dummies, to get the feel right.
// Boots with ?mode=moba. Everything lives as long as a run of the mode.
export default function moba(app) {
	const { scene, world, RAPIER, input, audio } = app
	const { sfx } = audio
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
				onGround: (x, z) => Math.abs(x) <= FLOOR.half && Math.abs(z) <= FLOOR.half,
			})
			const view = createView(scene, run.smooth)
			const hud = createHud()
			const follow = createFollow()
			const sim = createSim({
				scene,
				world,
				RAPIER,
				intents: run.intents,
				heroes: [{ id: local, team: 'A' }],
				smooth: run.smooth,
				present: run.present,
			})
			const hero = sim.heroes[0]
			const feedback = createFeedback({
				juice,
				sfx,
				camera: app.camera,
				input,
				view,
				hud,
				sim,
				local,
			})
			app.clock.reset()

			let paused = false
			let centred = false
			run.clock.pause(() => paused)
			run.clock.scale(feedback.beat)
			run.intents.suspend(() => paused || coreTune.physics.paused)
			run.input.stickAim((dir, magnitude, slot) => sim.stickAim(local, dir, magnitude, slot))

			// Look ahead toward the cursor, or on a pad toward a held aim only: a resting stick aims at the nearest enemy, which is no place to look.
			const onPad = () => input.activeDevice() === 'gamepad'
			const lookAt = () => {
				const frame = app.intents.get(local)
				if (centred) return null
				if (onPad()) return Object.keys(frame.held).length ? frame.aim : null
				return frame.aim
			}
			run.camera.frame((dt) => follow.frame(dt, hero.body.mesh.position, lookAt()))

			run.system('simulate', (dt) => sim.step(dt))
			run.on('present', feedback.present)

			const locate = (id) => {
				const unit = id === hero.id ? hero : sim.dummies.find((d) => d.id === id && !d.dead)
				return unit?.body.mesh.position ?? null
			}
			run.system('present', ({ dt, gameDt }) => {
				const frozen = paused || coreTune.physics.paused
				const step = frozen ? 0 : gameDt
				const frame = app.intents.get(local)
				const p = hero.body.mesh.position
				audio.setAudioListener(p)
				if (hero.body.animate(step, hero.cast ? 1 : 0)) sfx.step(p)
				for (const d of sim.dummies) if (!d.dead) d.body.animate(step)
				const target = !onPad() && frame.aim ? sim.pick(hero.team, frame.aim) : null
				const hovered = target && locate(target.id)
				const gone = view.update(step, {
					live: new Set(sim.shots.map((s) => s.id)),
					hero: p,
					aim: frame.aim,
					held: frame.held.slot1,
					hovered,
					locate,
				})
				feedback.fizzle(gone)
				juice.update(step)
				shadows.update((cast) => {
					cast(p.x, p.y - hero.body.radius - hero.body.halfHeight, p.z, 0.5)
					for (const d of sim.dummies) {
						if (d.dead) continue
						const q = d.body.mesh.position
						cast(q.x, q.y - d.body.radius - d.body.halfHeight, q.z, 0.5)
					}
				})
				hud.update(dt, {
					cooldown: hero.cd[0] * app.clock.step,
					total: tune.loose.cooldown,
					device: input.activeDevice(),
					pausedNow: paused,
				})
				app.camera.update(frozen ? 0 : dt)
			})

			function togglePause() {
				if (!app.session.actions.includes('pause')) return
				paused = !paused
				sfx[paused ? 'menuOpen' : 'menuClose']()
			}
			run.on('menu', togglePause)
			run.on('blur', () => app.intents.cancel(local))
			const onKey = (e) => {
				if (e.defaultPrevented || e.code === 'Backquote') return
				if (e.type === 'keydown' && !e.repeat && e.code === 'Escape') togglePause()
				if (e.code === 'Space') {
					e.preventDefault()
					centred = e.type === 'keydown'
					if (centred && !e.repeat) follow.snap()
				}
			}
			window.addEventListener('keydown', onKey, { signal: run.signal })
			window.addEventListener('keyup', onKey, { signal: run.signal })

			// --- Tune GUI: moba's sections come and go with the run; the values live in tune.js and survive restarts. ---
			run.debug.tune('hero', tune.hero, (f, t) => {
				f.add(t, 'speed', 1, 12, 0.1)
				f.add(t, 'accel', 1, 80, 1)
				f.add(t, 'friction', 0, 40, 0.5)
				f.add(t, 'stopFriction', 0, 60, 0.5).name('stop friction')
				f.add(t, 'stopSpeed', 0, 6, 0.1).name('stop speed')
				f.add(t, 'turnRate', 90, 3600, 30).name('turn rate (°/s)')
			})
			run.debug.tune('orders', tune.orders, (f, t) => {
				f.add(t, 'pick', 0, 2, 0.05).name('attack pick (m)')
				f.add(t, 'carrot', 0.1, 3, 0.05).name('carrot (m)')
				f.add(t, 'arrival', 0.01, 0.5, 0.01).name('arrival (m)')
				f.add(t, 'stallProgress', 0, 1, 0.05).name('repath below ×')
				f.add(t, 'stallTime', 0.05, 1, 0.05).name('repath after (s)')
				f.add(t, 'clearance', 0, 0.5, 0.01).name('pillar clearance')
				f.add(t, 'attackRange', 1, 10, 0.25).name('attack range')
			})
			run.debug.tune('loose', tune.loose, (f, t) => {
				f.add(t, 'speed', 6, 60, 0.5).name('speed (m/s)')
				f.add(t, 'range', 3, 30, 0.5)
				f.add(t, 'radius', 0.05, 1.5, 0.05)
				f.add(t, 'castPoint', 0, 0.5, 0.01).name('cast point (s)')
				f.add(t, 'cooldown', 0.2, 10, 0.1).name('cooldown (s)')
				f.add(t, 'nearMiss', 0, 2, 0.05).name('near miss (m)')
			})
			run.debug.tune('stickAim', tune.stickAim, (f, t) => {
				f.add(t, 'inMin', 0, 1, 0.01).name('stick from')
				f.add(t, 'inMax', 0, 1, 0.01).name('stick to')
				f.add(t, 'outMin', 0, 1, 0.01).name('reach from ×')
				f.add(t, 'assistAngle', 0, 30, 0.5).name('assist (°)')
				f.add(t, 'assistBend', 0, 1, 0.05).name('assist bend')
			})
			run.debug.tune('follow', tune.follow, (f, t) => {
				f.add(t, 'height', 5, 40, 0.5)
				f.add(t, 'back', 0, 30, 0.5)
				f.add(t, 'fov', 20, 70, 1)
				f.add(t, 'response', 0.02, 0.6, 0.01).name('response (s)')
				f.add(t, 'lookAhead', 0, 0.6, 0.01).name('look ahead ×')
				f.add(t, 'lookCap', 0, 8, 0.25).name('look cap (m)')
			})
			run.debug.tune('dummies', tune.dummies, (f, t) => {
				f.add(t, 'speed', 0, 8, 0.25)
				f.add(t, 'flipMin', 0.1, 3, 0.05).name('flip min (s)')
				f.add(t, 'flipMax', 0.1, 4, 0.05).name('flip max (s)')
				f.add(t, 'span', 0.5, 10, 0.5).name('span (m)')
				f.add(t, 'hits', 1, 10, 1)
				f.add(t, 'respawn', 0.2, 10, 0.1).name('respawn (s)')
			})
			run.debug.tune('juice', tune.juice, (f, t) => {
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
				feedback.reset()
				view.dispose()
				hud.dispose()
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
