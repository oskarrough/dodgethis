import * as THREE from 'three'
import { makeStyleMaterial } from '../../core/stylepass.js'
import { HEROES } from './heroes.js'
import { tune } from './tune.js'

// Handmade cutouts, not combatants. All animation reads the interpolated sim clock.
export function createLobbyStands(scene, el) {
	const v = tune.lobby.stands
	const root = new THREE.Group()
	root.name = 'lobby-stands'
	scene.add(root)
	const owned = []
	const material = (role) => {
		const m = makeStyleMaterial(role, { flat: true, side: THREE.DoubleSide })
		owned.push(m)
		return m
	}
	const ink = material('ink'),
		cream = material('cream'),
		cardboard = material('ammoShaft')
	const colors = { circle: material('teamA'), square: material('bowl') }
	const picked = material('ammo')
	function mesh(geometry, mat, parent) {
		owned.push(geometry)
		const m = new THREE.Mesh(geometry, mat)
		parent.add(m)
		return m
	}
	function shape(kind, width, height) {
		const s = new THREE.Shape()
		if (kind === 'circle') s.absellipse(0, height / 2, width / 2, height / 2, 0, Math.PI * 2)
		else {
			const points =
				kind === 'triangle'
					? [
							[-width / 2, 0],
							[width / 2, 0],
							[0, height],
						]
					: [
							[-width / 2, 0],
							[width / 2, 0],
							[width / 2, height],
							[-width / 2, height],
						]
			s.moveTo(...points[0])
			for (const p of points.slice(1)) s.lineTo(...p)
			s.closePath()
		}
		return s
	}
	const definitions = Object.values(HEROES)
	const stands = definitions.map((definition, i) => {
		const x = (i - (definitions.length - 1) / 2) * v.spacing
		const group = new THREE.Group()
		group.position.set(x, 0, v.z)
		root.add(group)
		const card = new THREE.Group()
		group.add(card)
		const width = v.width * (definition.silhouette === 'bar' ? v.barWidth : 1)
		const height = v.height * (definition.silhouette === 'bar' ? v.barHeight : 1)
		const outline = shape(definition.silhouette, width, height)
		const board = mesh(
			new THREE.ExtrudeGeometry(outline, {
				depth: v.thickness,
				bevelEnabled: false,
				curveSegments: v.segments,
			}),
			cardboard,
			card,
		)
		board.position.y = v.legHeight
		const face = mesh(
			new THREE.ShapeGeometry(outline, v.segments),
			definition.playable ? (colors[definition.silhouette] ?? cream) : ink,
			card,
		)
		face.position.set(0, v.legHeight, v.thickness + v.printGap)
		for (const side of [-1, 1]) {
			const leg = mesh(new THREE.BoxGeometry(v.legWidth, v.legHeight, v.thickness), cardboard, card)
			leg.position.set(side * width * v.legSpread, v.legHeight / 2, v.thickness / 2)
			const foot = mesh(new THREE.BoxGeometry(v.footWidth, v.footHeight, v.footDepth), cream, group)
			foot.position.set(side * width * v.legSpread, v.footHeight / 2, 0)
		}
		const head = mesh(
			new THREE.CircleGeometry(v.headRadius, v.segments),
			definition.playable ? cream : ink,
			card,
		)
		head.position.set(0, v.legHeight + height + v.headRadius, v.thickness + v.printGap)
		const pad = mesh(new THREE.CircleGeometry(v.radius, v.segments), cream, root)
		pad.rotation.x = -Math.PI / 2
		pad.position.set(x, v.padY, v.z + v.padForward)
		const ring = mesh(
			new THREE.RingGeometry(v.radius - v.ringWidth, v.radius, v.segments),
			ink,
			root,
		)
		ring.rotation.x = -Math.PI / 2
		ring.position.set(x, v.ringY, pad.position.z)
		const selected = mesh(
			new THREE.RingGeometry(v.radius - v.selectedWidth, v.radius, v.segments),
			picked,
			root,
		)
		selected.rotation.x = -Math.PI / 2
		selected.position.set(x, v.selectedY, pad.position.z)
		selected.visible = false
		const label = document.createElement('div')
		label.className = 'lobby-stand-label'
		label.dataset.hero = definition.id
		label.dataset.playable = String(definition.playable)
		label.innerHTML = `<span>${definition.id.replace(/^./, (c) => c.toUpperCase())}</span><small>${definition.playable ? 'Walk here' : 'soon'}</small>`
		el.append(label)
		return {
			id: definition.id,
			playable: definition.playable,
			x,
			z: pad.position.z,
			card,
			selected,
			label,
			deniedAt: -Infinity,
		}
	})
	// The six recovery marks are real ground prints, so their camera fit is visible too.
	const mark = tune.lobby.mark
	for (const position of tune.lobby.marks) {
		const fill = mesh(new THREE.CircleGeometry(mark.radius, v.segments), cream, root)
		fill.rotation.x = -Math.PI / 2
		fill.position.set(position.x, mark.y, position.z)
		const border = mesh(
			new THREE.RingGeometry(mark.radius - mark.lineWidth, mark.radius, v.segments),
			ink,
			root,
		)
		border.rotation.x = -Math.PI / 2
		border.position.set(position.x, mark.ringY, position.z)
	}
	const point = new THREE.Vector3()
	let device = 'keyboard'
	function labels() {
		for (const stand of stands) {
			const text = stand.selected.visible
				? `${device === 'gamepad' ? '✛↑' : 'H'} next`
				: stand.playable
					? 'Walk here'
					: 'soon'
			const small = stand.label.querySelector('small')
			if (small.textContent !== text) small.textContent = text
		}
	}
	return {
		stands,
		select(id) {
			for (const stand of stands) {
				stand.selected.visible = stand.id === id
				stand.label.dataset.picked = String(stand.id === id)
			}
			labels()
		},
		setDevice(next) {
			device = next
			labels()
		},
		deny(id, tick) {
			stands.find((stand) => stand.id === id).deniedAt = tick
		},
		update(tick, camera, step) {
			for (const stand of stands) {
				const age = (tick - stand.deniedAt) * step
				const f = Math.max(0, 1 - age / v.wobbleTime)
				stand.card.rotation.z =
					f > 0
						? Math.sin((age / v.wobbleTime) * v.wobbleTurns * Math.PI * 2) * v.wobbleAngle * f
						: 0
				point.set(stand.x, v.labelY, v.z + v.labelForward).project(camera)
				stand.label.hidden = point.z < -1 || point.z > 1
				stand.label.style.transform = `translate(${((point.x + 1) * innerWidth) / 2}px, ${((1 - point.y) * innerHeight) / 2}px) translate(-50%, -50%)`
			}
		},
		dispose() {
			root.removeFromParent()
			for (const stand of stands) stand.label.remove()
			for (const item of owned) item.dispose()
		},
	}
}
