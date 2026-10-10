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

	return {
		seen,
		update(sim, team) {
			const lane = sim.lane
			const viewers = [
				...[...sim.heroes, ...sim.dummies].map((u) => [u, f.sight.hero]),
				...(lane?.minions ?? []).map((u) => [u, f.sight.minion]),
				...(lane?.structures ?? []).map((u) => [u, f.sight.structure]),
			].filter(([u]) => u.team === team && !u.dead)
			const hidden = (p) =>
				brush.some((b) => Math.abs(p.x - b.x) <= b.halfX && Math.abs(p.z - b.z) <= b.halfZ)
			const sees = (p) => {
				const reach = hidden(p) ? f.brush : Infinity
				return viewers.some(([u, r]) => {
					const q = at(u)
					const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2
					return d <= r * r && d <= reach * reach
				})
			}
			seen.clear()
			// Structures stay drawn, as remembered landmarks; heroes and minions hide.
			for (const unit of lane?.structures ?? []) seen.add(unit.id)
			const minions = (lane?.minions ?? []).filter((u) => !u.dead)
			for (const unit of [...sim.heroes, ...sim.dummies, ...minions]) {
				const visible = unit.team === team || sees(at(unit))
				if (visible) seen.add(unit.id)
				unit.body.mesh.visible = visible
			}

			const s = f.resolution
			ctx.globalCompositeOperation = 'source-over'
			ctx.clearRect(0, 0, canvas.width, canvas.height)
			ctx.fillStyle = `rgba(${f.color}, ${f.dim})`
			ctx.fillRect(0, 0, canvas.width, canvas.height)
			ctx.globalCompositeOperation = 'destination-out'
			ctx.fillStyle = '#000'
			ctx.beginPath()
			for (const [u, r] of viewers) {
				const q = at(u)
				const x = (q.x + bounds.halfX) * s
				const y = (q.z + bounds.halfZ) * s
				ctx.moveTo(x + r * s, y)
				ctx.arc(x, y, r * s, 0, Math.PI * 2)
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
