import * as THREE from 'three'
import { makeStyleMaterial } from '../../core/stylepass.js'
import { STEP } from '../../core/app.js'
import { tune } from './tune.js'

// The centre flag, plain: a pole whose pennant climbs during the warning and takes the holder's
// colour, a ring on the ground, and one line of HUD text. Oskar owns the look.
export function createFlagView(scene) {
	const f = () => tune.flagfall.flag
	const owned = []
	const root = new THREE.Group()
	scene.add(root)
	const material = (role) => {
		const m = makeStyleMaterial(role, { flat: true, side: THREE.DoubleSide })
		owned.push(m)
		return m
	}
	const roles = { none: material('cream'), A: material('teamA'), B: material('teamB') }
	const mesh = (geometry, mat) => {
		owned.push(geometry)
		const m = new THREE.Mesh(geometry, mat)
		root.add(m)
		return m
	}
	const pole = mesh(new THREE.CylinderGeometry(0.06, 0.08, 1, 8), material('ink'))
	const pennant = mesh(new THREE.PlaneGeometry(0.9, 0.55), roles.none)
	const ring = mesh(new THREE.RingGeometry(0.94, 1, 48), roles.none)
	ring.rotation.x = -Math.PI / 2
	const arcOf = (share) =>
		new THREE.RingGeometry(0.8, 0.93, 48, 1, Math.PI / 2, Math.max(0.001, share) * Math.PI * 2)
	const bar = new THREE.Mesh(arcOf(0), roles.none) // the fill: its geometry is swapped as it grows
	root.add(bar)
	bar.rotation.x = -Math.PI / 2
	const banner = document.createElement('div')
	banner.className = 'moba-flag-banner'
	Object.assign(banner.style, {
		position: 'fixed',
		top: '3.2rem',
		left: '50%',
		transform: 'translateX(-50%)',
		pointerEvents: 'none',
		font: '600 15px/1.2 system-ui, sans-serif',
		color: '#f4ead2',
		textShadow: '0 1px 2px #000a',
	})
	document.body.append(banner)
	let barArc = -1
	const clock = (s) => `${Math.floor(s / 60)}:${String(Math.ceil(s) % 60).padStart(2, '0')}`

	return {
		get markerPosition() {
			return null
		},
		present() {},
		update(sim, blend, local) {
			const flag = sim.flag
			if (!flag) return
			const s = flag.state
			const r = flag.radius()
			const mine = sim.heroes.find((h) => h.id === local)?.team
			const height = f().pole
			pole.scale.y = height
			pole.position.set(s.x, height / 2, s.z)
			const climb =
				s.phase === 'up'
					? 1
					: s.phase === 'rising'
						? 1 - Math.max(0, s.nextHoist - sim.tick - blend) / (f().warn / STEP)
						: 0
			pennant.position.set(s.x + 0.47, 0.4 + climb * (height - 0.7), s.z)
			pennant.material = roles[s.owner ?? 'none']
			ring.visible = bar.visible = s.phase === 'up'
			ring.scale.setScalar(r)
			ring.position.set(s.x, 0.04, s.z)
			ring.material = roles[s.owner ?? 'none']
			bar.position.set(s.x, 0.05, s.z)
			bar.scale.setScalar(r)
			bar.material = roles[s.owner ?? 'none']
			const arc = Math.round(s.progress * 48) / 48
			if (arc !== barArc) {
				barArc = arc
				bar.geometry.dispose()
				bar.geometry = arcOf(arc)
			}
			const left = (tick) => Math.max(0, (tick - sim.tick - blend) * STEP)
			const whose = (team) => (team === mine ? 'us' : 'them')
			banner.textContent =
				s.phase === 'rising'
					? `Flag up in ${clock(left(s.nextHoist))}`
					: s.phase === 'up'
						? s.contested
							? 'Flag contested'
							: s.owner
								? `Flag: ${whose(s.owner)} ${Math.round(s.progress * 100)}% · ${clock(left(s.upUntil))}`
								: `Flag is up · take the centre · ${clock(left(s.upUntil))}`
						: ''
		},
		dispose() {
			root.removeFromParent()
			banner.remove()
			bar.geometry.dispose()
			for (const item of owned) item.dispose()
		},
	}
}
