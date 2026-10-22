import * as THREE from 'three'
import { hex } from '../../core/style.js'
import { el } from '../../core/dom.js'
import { look } from './look.js'

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
	if (!extent) return { x: 0, y: -look.pips.inset }
	return { x: (x / extent) * look.pips.inset, y: (y / extent) * look.pips.inset }
}

export function createPips() {
	const root = el('div', 'moba-pips')
	root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:3'
	root.setAttribute('aria-hidden', 'true')
	document.body.append(root)
	const pips = new Map()
	const point = new THREE.Vector3()
	const local = new THREE.Vector3()
	return {
		update(camera, units, team, { hero = null, ball = null, carrying = false } = {}) {
			const live = new Set()
			const targets = units.filter((unit) => !unit.dead && unit.team !== team)
			if (hero && !hero.dead)
				targets.push({
					id: 'marker:hero',
					label: carrying ? 'You + Ball' : 'You',
					point: hero.body.mesh.position,
				})
			if (ball) targets.push({ id: 'marker:ball', label: 'Ball', point: ball })
			for (const unit of targets) {
				live.add(unit.id)
				let pip = pips.get(unit.id)
				if (!pip) {
					pip = el('span', null, root)
					pip.style.cssText = `position:absolute;border:2px solid ${hex('ink')};border-radius:50%;background:${hex(unit.label ? 'cream' : unit.team === 'A' ? 'teamA' : 'teamB')};transform:translate(-50%,-50%)`
					if (unit.label) {
						pip.dataset.marker = unit.label
						pip.style.cssText += `;border-width:${look.pips.markerBorder}px;border-radius:${look.pips.markerCorner}px;padding:${look.pips.markerPadding}px ${look.pips.markerPadding * 2}px;white-space:nowrap;box-shadow:${look.pips.markerBorder}px ${look.pips.markerBorder}px 0 ${hex('ink')};font:${look.pips.markerFont}px/1 var(--ui-font);color:${hex('ink')}`
					}
					pips.set(unit.id, pip)
				}
				// Mesh positions already contain render interpolation, never read sim positions here.
				point.copy(unit.point ?? unit.body.mesh.position)
				point.y = look.pips.height
				local.copy(point).applyMatrix4(camera.matrixWorldInverse)
				const at = edgePip(point.project(camera), local.z >= 0)
				pip.hidden = !at
				if (!at) continue
				if (unit.label) {
					const angle = Math.atan2(-at.y, at.x)
					const direction = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'][
						((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8
					]
					const text = `${direction} ${unit.label}`
					if (pip.textContent !== text) pip.textContent = text
				} else pip.style.width = pip.style.height = `${look.pips.size}px`
				const margin = unit.label ? look.pips.markerMargin : 0
				pip.style.left = `clamp(${margin}px, ${(at.x + 1) * 50}%, calc(100% - ${margin}px))`
				pip.style.top = `clamp(${margin}px, ${(1 - at.y) * 50}%, calc(100% - ${margin}px))`
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
