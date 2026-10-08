import { FLOOR } from './obstacles.js'

// A presentation-only map: the same rendered positions as the world, no input or snapshots.
export function createMinimap(icons) {
	const ns = 'http://www.w3.org/2000/svg'
	const make = (tag, attributes, parent) => {
		const node = document.createElementNS(ns, tag)
		for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value)
		parent?.append(node)
		return node
	}
	const scale = 100 / (FLOOR.halfX * 2)
	const height = FLOOR.halfZ * 2 * scale
	const root = make('svg', {
		class: 'moba-minimap',
		viewBox: `0 0 100 ${height}`,
		width: 100,
		height,
		role: 'img',
		'aria-label': 'Lane minimap: heroes and buildings. Your hero has a cream ring.',
	})
	// The floating footprint keeps the lane's real proportions, with no enclosing disc.
	make(
		'rect',
		{
			class: 'minimap-floor',
			x: 0,
			y: 0,
			width: FLOOR.halfX * 2 * scale,
			height: FLOOR.halfZ * 2 * scale,
			rx: 1,
		},
		root,
	)
	const buildings = make('g', {}, root)
	const heroes = make('g', {}, root)
	const markers = new Map()
	const put = (node, key, value) => {
		if (node.getAttribute(key) !== value) node.setAttribute(key, value)
	}
	document.body.append(root)
	return {
		update({ sim, hero, lobby }) {
			root.style.display = lobby || !sim?.lane ? 'none' : ''
			if (lobby || !sim?.lane) return
			const units = [...sim.lane.structures, ...sim.heroes]
			const ids = new Set(units.map((unit) => unit.id))
			for (const [id, marker] of markers) {
				if (ids.has(id)) continue
				marker.remove()
				markers.delete(id)
			}
			for (const unit of units) {
				const building = unit.kind === 'tower' || unit.kind === 'core'
				let marker = markers.get(unit.id)
				if (!marker) {
					marker = make('g', { 'data-unit': unit.id }, building ? buildings : heroes)
					if (building) {
						marker.innerHTML = icons[unit.kind]
						const icon = marker.firstChild
						for (const [key, value] of Object.entries({ x: -5, y: -5, width: 10, height: 10 }))
							icon.setAttribute(key, value)
						make('path', { class: 'minimap-destroyed', d: 'M-4 4 L4 -4' }, marker)
					} else {
						make('circle', { class: 'minimap-local', r: 4 }, marker)
						make('circle', { class: 'tone', r: 2.3 }, marker)
					}
					markers.set(unit.id, marker)
				}
				put(marker, 'data-team', unit.team)
				put(marker, 'data-local', String(unit.id === hero?.id))
				put(marker, 'data-dead', String(!!unit.dead))
				put(marker, 'data-kind', building ? unit.kind : 'hero')
				const p = unit.body.mesh?.position ?? unit.body.position
				put(marker, 'transform', `translate(${50 + p.x * scale} ${height / 2 + p.z * scale})`)
			}
		},
		dispose() {
			markers.clear()
			root.remove()
		},
	}
}
