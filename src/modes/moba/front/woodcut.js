// A map's splash picture cut like a Vallotton woodcut, from its real layout: the court as one flat
// colour, its walls and towers as ink masses, the cliff under it and the sky around it gouged in
// strokes. A handful of flat colours from the map's own `look`; its layout decides every shape, a
// seed only the gouges.
import { tune } from './tune.js'

const W = 400
const H = 300

export function woodcut(id, layout, look) {
	const cut = tune.tile.cut
	const rand = seeded(id)
	const { halfX, halfZ, radius } = layout.bounds
	// Seen like the match camera sees it: turned a little, then tipped away so z shortens.
	const turn = radius ? 0 : cut.turn
	const a = (turn * Math.PI) / 180
	const see = ([x, z]) => [
		x * Math.cos(a) - z * Math.sin(a),
		(x * Math.sin(a) + z * Math.cos(a)) * cut.tip,
	]
	const rim = (
		radius
			? Array.from({ length: 48 }, (_, i) => [
					Math.cos((i / 48) * Math.PI * 2) * radius,
					Math.sin((i / 48) * Math.PI * 2) * radius,
				])
			: [
					[-halfX, -halfZ],
					[halfX, -halfZ],
					[halfX, halfZ],
					[-halfX, halfZ],
				]
	).map(see)
	const xs = rim.map((p) => p[0])
	const ys = rim.map((p) => p[1])
	const spanX = Math.max(...xs) - Math.min(...xs)
	const spanY = Math.max(...ys) - Math.min(...ys)
	// Under the cliff the rock tapers to a jagged root, `root` of the card deep.
	const root = H * cut.root
	const scale = Math.min(
		(W * (1 - cut.margin)) / spanX,
		(H * (1 - cut.margin) - root) / (spanY + cut.cliff),
	)
	const drop = cut.cliff * scale
	const top = H / 2 - (Math.max(...ys) + Math.min(...ys)) * scale * 0.5 - (drop + root) / 2
	const place = `translate(${W / 2} ${top}) scale(${scale} ${scale * cut.tip}) rotate(${turn})`
	// The rim's lower edge on screen, slid down by the cliff: where the root hangs from.
	const edge = lowerHull(rim.map(([x, y]) => [W / 2 + x * scale, top + y * scale + drop]))
	const left = edge[0][0]
	const right = edge.at(-1)[0]
	const teeth = Array.from({ length: cut.teeth + 1 }, (_, i) => {
		const t = 1 - i / cut.teeth
		const x =
			left +
			t * (right - left) +
			(i % cut.teeth ? (rand() - 0.5) * ((right - left) / cut.teeth) : 0)
		const deep =
			root * Math.sin(Math.PI * t) ** 1.3 * (i % 2 ? 0.3 + rand() * 0.4 : 0.6 + rand() * 0.4)
		return [x, along(edge, x) + deep]
	})
	const hang = `<path d="M${[...edge, ...teeth].map((p) => p.join(',')).join(' L')} Z"/>`
	const floor = radius ? `<circle r="${radius}"/>` : `<path d="${floorPath(layout)}"/>`
	const rect = (b) =>
		`<rect x="${b.x - b.halfX}" y="${b.z - b.halfZ}" width="${b.halfX * 2}" height="${b.halfZ * 2}"/>`
	const disc = (x, z, r) => `<circle cx="${x}" cy="${z}" r="${r}"/>`

	// The sky: a few long ink strokes on the paper, thicker toward the island's horizon.
	const sky = Array.from({ length: cut.gouges }, () => {
		const y = rand() * H
		const near = 1 - Math.abs(y - top) / H
		return sliver(
			rand() * W * 1.2 - W * 0.1,
			y,
			20 + rand() * 110 * near,
			0.4 + rand() * 1.8 * near,
		)
	}).join('')
	// The cliff: the island's shape slid down under it, a solid ink mass gouged in vertical strokes.
	const slide = Array.from({ length: 12 }, (_, i) =>
		floor.replace('/>', ` transform="translate(0 ${(drop * (i + 1)) / 12}) ${place}"/>`),
	).join('')
	const cliff = Array.from({ length: cut.strokes }, () => {
		const x = left + rand() * (right - left)
		const y = along(edge, x) - drop * (0.2 + rand() * 0.9)
		const t = (x - left) / (right - left)
		return `<rect x="${x}" y="${y}" width="${0.5 + rand() * 1.6}" height="${drop * 0.4 + root * Math.sin(Math.PI * t) * rand()}"/>`
	}).join('')
	// Brush: grass blades standing in a low mass.
	const brush = (layout.brush ?? [])
		.map((b) => {
			const n = Math.round(b.halfX * 2.5)
			const blades = Array.from({ length: n }, (_, i) => {
				const x = b.x - b.halfX + ((i + 0.5) / n) * b.halfX * 2
				return `<path d="M${x},${b.z + b.halfZ * 0.9} L${x + (rand() - 0.5) * 0.6},${b.z - b.halfZ * (0.3 + rand() * 0.6)}"/>`
			}).join('')
			return `<g class="cut-blades">${blades}</g>`
		})
		.join('')
	const walls = layout.boxes.map(rect).join('')
	const pillars = layout.pillars.map((p) => disc(p.x, p.z, p.r * 1.3)).join('')
	const structures = layout.structures
		.map((s) =>
			s.kind === 'core'
				? `${disc(s.x, s.z, 3.4)}<circle class="cut-court" cx="${s.x}" cy="${s.z}" r="2.2"/>${disc(s.x, s.z, 1.2)}`
				: s.kind === 'tower'
					? `${disc(s.x, s.z, 1.8)}<circle class="cut-court" cx="${s.x}" cy="${s.z}" r="0.7"/>`
					: s.kind === 'fort'
						? `<rect x="${s.x - 1.5}" y="${s.z - 1.5}" width="3" height="3"/>`
						: '',
		)
		.join('')
	// The mid lane's chalk, where a map has one road between the bases.
	const road = (layout.lanes ?? [])
		.filter((lane) => lane.id === 'mid')
		.map(
			(lane) => `<path class="cut-road" d="M${lane.path.map((p) => `${p.x},${p.z}`).join(' L')}"/>`,
		)
		.join('')
	const flag = layout.settings?.flag
		? `<circle class="cut-ring" r="${layout.settings.flag.radius}"/>${disc(0, 0, 0.7)}`
		: ''
	const camps = (layout.camps ?? [])
		.map(
			(c) => `<rect class="cut-camp" x="${c.x - 1.2}" y="${c.z - 1.2}" width="2.4" height="2.4"/>`,
		)
		.join('')
	// A boss waits in the middle of an arena with no structures; the party walks in at its spawn.
	const { boss, A } = layout.spawns
	const lair = boss
		? `<circle class="cut-ring" cx="${boss.x}" cy="${boss.z}" r="${radius * 0.62}"/>${disc(boss.x, boss.z, radius * 0.3)}${[-1, 0, 1].map((k) => disc(A.x, A.z + k * 1.8, 0.6)).join('')}`
		: ''

	// The sun or moon, low on the side the world's light comes from.
	const orb = look.orb
		? `<circle fill="${look.orb}" cx="${W * 0.13}" cy="${H * 0.17}" r="${H * 0.15}"/>`
		: ''
	// A moss lip along the top of the cliff.
	const lip = Array.from({ length: 3 }, (_, i) =>
		floor.replace('/>', ` transform="translate(0 ${(drop * (i + 1)) / 10}) ${place}"/>`),
	).join('')

	const f = `cut-${id}`
	return `<svg class="cut" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" style="color: ${look.ink}" aria-hidden="true">
		<defs>
			<filter id="${f}-wood" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="${cut.grain}" numOctaves="2" seed="${Math.floor(rand() * 99)}"/><feDisplacementMap in="SourceGraphic" scale="${cut.wobble}"/></filter>
			<clipPath id="${f}-cliff">${slide}${hang}</clipPath>
		</defs>
		<rect fill="${look.sky}" x="-50" y="-50" width="${W + 100}" height="${H + 100}"/>
		<g filter="url(#${f}-wood)">${orb}<g fill="${look.cloud}">${sky}</g></g>
		<g filter="url(#${f}-wood)">
			<g clip-path="url(#${f}-cliff)"><rect fill="${look.cliff}" width="${W}" height="${H}"/><g fill="${look.gouge}">${cliff}</g><g fill="${look.moss}">${lip}</g></g>
			<g transform="${place}" style="--cut-court: ${look.court}; --cut-moss: ${look.moss}">
				<g fill="${look.court}" class="cut-floor">${floor}</g>
				<g fill="currentColor">${road}${walls}${pillars}${brush}${camps}${flag}${structures}${lair}</g>
			</g>
		</g>
	</svg>`
}

// The lower edge of a convex outline on screen (y grows down), left to right.
function lowerHull(points) {
	const hull = []
	for (const p of points.toSorted((a, b) => a[0] - b[0] || b[1] - a[1])) {
		while (hull.length > 1) {
			const [o, q] = hull.slice(-2)
			if ((q[0] - o[0]) * (p[1] - o[1]) - (q[1] - o[1]) * (p[0] - o[0]) < 0) break
			hull.pop()
		}
		hull.push(p)
	}
	return hull
}

// The edge's height at screen `x`.
function along(edge, x) {
	const i = Math.max(
		1,
		edge.findIndex((p) => p[0] >= x),
	)
	const [a, b] = [edge[i - 1], edge[i] ?? edge.at(-1)]
	return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0] || 1)
}

// The court's outline, with any dunk gaps notched out of its long shores.
function floorPath(layout) {
	const { halfX: x, halfZ: z } = layout.bounds
	const notch = 1.6
	const shore = (flank) => {
		const gaps = (layout.gaps ?? [])
			.filter((g) => g.flank === flank)
			.toSorted((a, b) => (a.x0 - b.x0) * -flank)
		const edge = flank * z
		const into = edge - flank * notch
		return gaps
			.map((g) => (flank === -1 ? [g.x0, g.x1] : [g.x1, g.x0]))
			.map(([a, b]) => `L${a},${edge} L${a},${into} L${b},${into} L${b},${edge}`)
			.join(' ')
	}
	return `M${-x},${-z} ${shore(-1)} L${x},${-z} L${x},${z} ${shore(1)} L${-x},${z} Z`
}

// A gouge: a long sliver, pointed at both ends.
function sliver(x, y, length, width) {
	const lean = width * 0.3
	return `<path d="M${x},${y} Q${x + length / 2},${y - width - lean} ${x + length},${y + lean} Q${x + length / 2},${y + width} ${x},${y} Z"/>`
}

function seeded(text) {
	let a = [...text].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761), 7)
	return () => {
		a = (a + 0x6d2b79f5) | 0
		let t = Math.imul(a ^ (a >>> 15), 1 | a)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}
