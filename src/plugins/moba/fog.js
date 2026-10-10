import * as THREE from 'three'
import { FORWARD_LAYER } from '../../core/stylepass.js'
import { tune } from './tune.js'

// Fog of war behind `?fog`: your team's heroes, minions and structures see a circle each.
// Enemy units outside every circle vanish and the ground outside dims. Presentation only:
// the sim and the bots stay omniscient.
export function createFog(scene, bounds, brush = []) {
	const f = tune.fog
	const canvas = document.createElement('canvas')
	canvas.width = Math.ceil(bounds.halfX * 2 * f.resolution)
	canvas.height = Math.ceil(bounds.halfZ * 2 * f.resolution)
	const ctx = canvas.getContext('2d')
	const texture = new THREE.CanvasTexture(canvas)
	const material = new THREE.MeshBasicMaterial({
		map: texture,
		transparent: true,
		depthWrite: false,
	})
	const plane = new THREE.Mesh(
		new THREE.PlaneGeometry(bounds.halfX * 2, bounds.halfZ * 2).rotateX(-Math.PI / 2),
		material,
	)
	plane.position.y = f.height
	plane.renderOrder = 1
	plane.layers.set(FORWARD_LAYER)
	scene.add(plane)
	const seen = new Set()
	const at = (unit) => unit.body.mesh?.position ?? unit.body.position
	const fill = `rgba(${f.color}, ${f.dim})`
	const s = f.resolution
	// Reused per frame: viewer units, their sight radii, and the circles last drawn (x, y, r in px).
	const viewers = []
	const radii = []
	let drawn = new Float64Array(192)
	let circles = new Float64Array(192)
	let count = -1
	const hidden = (p) =>
		brush.some((b) => Math.abs(p.x - b.x) <= b.halfX && Math.abs(p.z - b.z) <= b.halfZ)
	const sees = (p) => {
		const reach = hidden(p) ? f.brush * f.brush : Infinity
		for (let i = 0; i < viewers.length; i++) {
			const q = at(viewers[i])
			const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2
			if (d <= radii[i] * radii[i] && d <= reach) return true
		}
		return false
	}
	const look = (unit, team, r) => {
		if (unit.team !== team || unit.dead) return
		viewers.push(unit)
		radii.push(r)
	}
	const show = (unit, team) => {
		const visible = unit.team === team || sees(at(unit))
		if (visible) seen.add(unit.id)
		unit.body.mesh.visible = visible
	}

	return {
		seen,
		update(sim, team) {
			const lane = sim.lane
			viewers.length = radii.length = 0
			for (const u of sim.heroes) look(u, team, f.sight.hero)
			for (const u of sim.dummies) look(u, team, f.sight.hero)
			for (const u of lane?.minions ?? []) look(u, team, f.sight.minion)
			for (const u of lane?.structures ?? []) look(u, team, f.sight.structure)
			seen.clear()
			// Structures stay drawn, as remembered landmarks; heroes and minions hide.
			for (const unit of lane?.structures ?? []) seen.add(unit.id)
			for (const unit of sim.heroes) show(unit, team)
			for (const unit of sim.dummies) show(unit, team)
			for (const unit of lane?.minions ?? []) if (!unit.dead) show(unit, team)

			// Redraw and reupload the dim only when a circle moved, appeared or vanished.
			const n = viewers.length * 3
			if (circles.length < n)
				[circles, drawn, count] = [new Float64Array(n * 2), new Float64Array(n * 2), -1]
			let same = n === count
			for (let i = 0; i < viewers.length; i++) {
				const q = at(viewers[i])
				const x = (q.x + bounds.halfX) * s
				const y = (q.z + bounds.halfZ) * s
				const r = radii[i] * s
				circles[i * 3] = x
				circles[i * 3 + 1] = y
				circles[i * 3 + 2] = r
				if (same) same = drawn[i * 3] === x && drawn[i * 3 + 1] === y && drawn[i * 3 + 2] === r
			}
			if (same) return
			;[drawn, circles, count] = [circles, drawn, n]
			ctx.globalCompositeOperation = 'source-over'
			ctx.clearRect(0, 0, canvas.width, canvas.height)
			ctx.fillStyle = fill
			ctx.fillRect(0, 0, canvas.width, canvas.height)
			ctx.globalCompositeOperation = 'destination-out'
			ctx.fillStyle = '#000'
			ctx.beginPath()
			for (let i = 0; i < n; i += 3) {
				const x = drawn[i]
				const y = drawn[i + 1]
				const r = drawn[i + 2]
				ctx.moveTo(x + r, y)
				ctx.arc(x, y, r, 0, Math.PI * 2)
			}
			ctx.fill()
			texture.needsUpdate = true
		},
		dispose() {
			scene.remove(plane)
			plane.geometry.dispose()
			material.dispose()
			texture.dispose()
		},
	}
}
