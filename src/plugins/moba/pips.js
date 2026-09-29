import * as THREE from 'three'
import { hex } from '../../core/style.js'
import { tune } from './tune.js'

// NDC → inset screen edge. Points behind the eye need their projected direction reversed.
export function edgePip(point, behind = false) {
	let { x, y } = point
	if (!behind && point.z >= -1 && point.z <= 1 && Math.abs(x) <= 1 && Math.abs(y) <= 1) return null
	if (behind) {
		x = -x
		y = -y
	}
	const extent = Math.max(Math.abs(x), Math.abs(y))
	if (!Number.isFinite(extent)) return null
	if (!extent) return { x: 0, y: -tune.pips.inset }
	return { x: (x / extent) * tune.pips.inset, y: (y / extent) * tune.pips.inset }
}

export function createPips() {
	const root = document.createElement('div')
	root.className = 'moba-pips'
	root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:3'
	root.setAttribute('aria-hidden', 'true')
	document.body.append(root)
	const pips = new Map()
	const point = new THREE.Vector3()
	const local = new THREE.Vector3()
	return {
		update(camera, units, team) {
			const live = new Set()
			for (const unit of units) {
				if (unit.dead || unit.team === team) continue
				live.add(unit.id)
				let pip = pips.get(unit.id)
				if (!pip) {
					pip = document.createElement('span')
					pip.style.cssText = `position:absolute;border:2px solid ${hex('ink')};border-radius:50%;background:${hex(unit.team === 'A' ? 'teamA' : 'teamB')};transform:translate(-50%,-50%)`
					root.append(pip)
					pips.set(unit.id, pip)
				}
				// Mesh positions already contain render interpolation, never read sim positions here.
				point.copy(unit.body.mesh.position)
				point.y = tune.pips.height
				local.copy(point).applyMatrix4(camera.matrixWorldInverse)
				const at = edgePip(point.project(camera), local.z >= 0)
				pip.hidden = !at
				if (!at) continue
				pip.style.width = pip.style.height = `${tune.pips.size}px`
				pip.style.left = `${(at.x + 1) * 50}%`
				pip.style.top = `${(1 - at.y) * 50}%`
			}
			for (const [id, pip] of pips)
				if (!live.has(id)) {
					pip.remove()
					pips.delete(id)
				}
		},
		dispose() {
			root.remove()
			pips.clear()
		},
	}
}
