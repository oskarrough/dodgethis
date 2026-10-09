import { mapLayout } from './obstacles.js'
import { tune } from './tune.js'

// A presentation-only map: the same rendered positions as the world, no input or snapshots.
// The layout (court, lanes, cover, footprints) is drawn once; only unit markers move.
export function createMinimap(icons, layout = mapLayout(), name = layout.name) {
	const bounds = layout.bounds
	const ns = 'http://www.w3.org/2000/svg'
	const make = (tag, attributes, parent) => {
		const node = document.createElementNS(ns, tag)
		for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value)
		parent?.append(node)
		return node
	}
	const scale = 100 / (bounds.halfX * 2)
	const height = bounds.halfZ * 2 * scale
	const root = make('svg', {
		class: 'moba-minimap',
		viewBox: `0 0 100 ${height}`,
		width: 100,
		height,
		role: 'img',
		'aria-label': `${name} minimap: heroes and buildings. Your hero has a cream ring.`,
	})
	drawLayout(layout, scale, height, make('g', { class: 'minimap-layout' }, root), make)
	const buildings = make('g', {}, root)
	const heroes = make('g', {}, root)
	const markers = new Map()
	const put = (node, key, value) => {
		if (node.getAttribute(key) !== value) node.setAttribute(key, value)
	}
	document.body.append(root)
	return {
		update({ sim, hero, lobby }) {
			const hidden = lobby || !sim
			if (root.style.display !== (hidden ? 'none' : '')) root.style.display = hidden ? 'none' : ''
			if (hidden) return
			const units = [...(sim.lane?.structures ?? []), ...sim.heroes, ...sim.dummies]
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

// Static ink-on-cream plan of the active layout, in the same descriptors the world builds from.
function drawLayout(layout, scale, height, parent, make) {
	const { bounds, settings: s } = layout
	const X = (x) => 50 + x * scale
	const Y = (z) => height / 2 + z * scale
	const box = (cls, x, z, halfX, halfZ, extra = {}) =>
		make(
			'rect',
			{
				class: cls,
				x: X(x - halfX),
				y: Y(z - halfZ),
				width: halfX * 2 * scale,
				height: halfZ * 2 * scale,
				...extra,
			},
			parent,
		)
	const line = (cls, x1, z1, x2, z2) =>
		make('line', { class: cls, x1: X(x1), y1: Y(z1), x2: X(x2), y2: Y(z2) }, parent)
	const terrain = tune.overthrowTerrain
	const inset = terrain.courtInset * (s?.scale ?? 1)
	// Flagfall's court stands in the shallows; a band of its water frames the floor.
	if (s?.water) {
		const shore = 3 / scale
		box('minimap-water', 0, 0, bounds.halfX + shore, bounds.halfZ + shore, {
			rx: 2,
			style: `--water: ${s.water.color}`,
		})
	}
	// The floating footprint keeps the lane's real proportions, with no enclosing disc.
	box('minimap-floor', 0, 0, bounds.halfX, bounds.halfZ, { rx: 1 })
	if (s?.lane) {
		// Two flank lanes and the yard between the base blocks.
		for (const flank of [-1, 1])
			box(
				'minimap-lane',
				0,
				flank * s.lane.centreZ,
				bounds.halfX,
				(s.lane.outerZ - s.lane.innerZ) / 2,
			)
		box('minimap-lane', 0, 0, s.yard.halfX, s.yard.halfZ)
	} else {
		const m = tune.map
		box('minimap-lane', 0, 0, bounds.halfX, m.hedgeInnerZ)
		make('circle', { class: 'minimap-chalk', cx: X(0), cy: Y(0), r: m.plazaRadius * scale }, parent)
		line('minimap-chalk', 0, -(bounds.halfZ - inset), 0, bounds.halfZ - inset)
	}
	box('minimap-chalk', 0, 0, bounds.halfX - inset, bounds.halfZ - inset)
	for (const b of layout.boxes) box(`minimap-${b.kind}`, b.x, b.z, b.halfX, b.halfZ, { rx: 0.4 })
	for (const p of layout.pillars)
		make(
			'circle',
			{ class: 'minimap-pillar', cx: X(p.x), cy: Y(p.z), r: Math.max(1.1, p.r * scale) },
			parent,
		)
	// Flagfall has no live lane: its towers, forts and cores are ground footprints, drawn as such.
	for (const f of layout.structures ?? [])
		make(
			'circle',
			{
				class: 'minimap-footprint',
				'data-team': f.x < 0 ? 'A' : 'B',
				cx: X(f.x),
				cy: Y(f.z),
				r: Math.max(1.6, s.print.radii[f.kind] * scale),
			},
			parent,
		)
}
