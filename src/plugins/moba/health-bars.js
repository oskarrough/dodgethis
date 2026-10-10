import * as THREE from 'three'
import { structureName } from './gates.js'
import './health-bars.css'
import { tune } from './tune.js'
import { look } from './look.js'

// Screen-sized labels projected from the same interpolated meshes the scene renders.
export function createHealthBars() {
	const root = document.createElement('div')
	root.className = 'moba-health-bars'
	root.setAttribute('aria-hidden', 'true')
	document.body.append(root)
	const bars = new Map()
	const point = new THREE.Vector3()
	const eye = new THREE.Vector3()

	function reset() {
		for (const bar of bars.values()) bar.element.remove()
		bars.clear()
	}

	return {
		update(units, camera, viewport, local, localTeam, names = new Map()) {
			const t = look.healthBars
			const live = new Set(units.map((unit) => unit.id))
			for (const [id, bar] of bars)
				if (!live.has(id)) {
					bar.element.remove()
					bars.delete(id)
				}
			root.style.left = `${viewport.left}px`
			root.style.top = `${viewport.top}px`
			root.style.width = `${viewport.width}px`
			root.style.height = `${viewport.height}px`
			camera.updateMatrixWorld()
			for (const unit of units) {
				let bar = bars.get(unit.id)
				if (!bar) {
					const element = document.createElement('div')
					element.className = 'moba-unit-health'
					element.dataset.unit = unit.id
					const label = document.createElement('span')
					label.className = 'moba-health-label'
					const track = document.createElement('div')
					track.className = 'moba-health-track'
					const fill = document.createElement('div')
					fill.className = 'moba-health-fill'
					const ticks = document.createElement('div')
					ticks.className = 'moba-health-ticks'
					track.append(fill, ticks)
					element.append(label, track)
					root.append(element)
					bars.set(unit.id, (bar = { element, label, fill }))
				}
				if (unit.dead || unit.hp <= 0 || !(unit.maxHp > 0)) {
					bar.element.hidden = true
					continue
				}
				const minor = !unit.structure && !unit.heroId
				const width = unit.structure ? t.structureWidth : minor ? t.minorWidth : t.heroWidth
				const border = t.border
				const height = minor ? t.minorHeight : t.height
				const tickHp =
					tune.hud.hpTick *
					Math.max(
						1,
						Math.ceil((unit.maxHp * t.tickMinGap) / ((width - border * 2) * tune.hud.hpTick)),
					)
				bar.element.dataset.team = unit.team
				bar.element.dataset.local = String(unit.id === local)
				bar.element.dataset.minor = String(minor)
				bar.element.style.setProperty('--width', `${width}px`)
				bar.element.style.setProperty('--height', `${height}px`)
				bar.element.style.setProperty('--border', `${border}px`)
				bar.element.style.setProperty('--gap', `${t.gap}px`)
				bar.element.style.setProperty('--font', `${t.font}px`)
				bar.element.style.setProperty('--tick-spacing', `${(tickHp / unit.maxHp) * 100}%`)
				bar.fill.style.width = `${Math.max(0, Math.min(1, unit.hp / unit.maxHp)) * 100}%`
				const text = unit.structure
					? `${unit.team === localTeam ? 'Your' : 'Enemy'} ${structureName(unit.kind)}`
					: names.has(unit.id)
						? names.get(unit.id)
						: unit.heroId
							? unit.heroId[0].toUpperCase() + unit.heroId.slice(1)
							: ''
				if (bar.label.textContent !== text) bar.label.textContent = text
				bar.label.hidden = !text
				bar.element.dataset.hero = String(!unit.structure && !!unit.heroId)
				point.copy(unit.body.mesh.position)
				point.y += unit.body.halfHeight + (unit.structure ? 0 : unit.body.radius) + t.lift
				eye.copy(point).applyMatrix4(camera.matrixWorldInverse)
				point.project(camera)
				const x = ((point.x + 1) / 2) * viewport.width
				const y = ((1 - point.y) / 2) * viewport.height - t.gap
				bar.element.hidden =
					!Number.isFinite(x + y) ||
					eye.z >= 0 ||
					point.z < -1 ||
					point.z > 1 ||
					x - width / 2 < 0 ||
					x + width / 2 > viewport.width ||
					y < height ||
					y > viewport.height
				if (!bar.element.hidden)
					bar.element.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`
			}
		},
		reset,
		dispose() {
			reset()
			root.remove()
		},
	}
}
