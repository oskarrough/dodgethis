import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { PALETTE } from '../../core/style.js'
import { FORWARD_LAYER } from '../../core/stylepass.js'
import { bake } from './lobby-floor.js'
import { mapLayout } from './maps/index.js'
import { tune } from './tune.js'

// The weather bowl: a small glazed bowl on the saucer holding the next map in miniature, built from
// that map's own layout (court, lanes, cover, structures) over a cloud bed, under a painted sky cap.
// Only the miniature, the sky cap and the label change between maps; the bowl is the same.

function bowlGeometry(b) {
	const r = b.radius,
		h = b.height,
		wall = b.wall
	// Outside up from the foot, over the rim, down the inside to the floor.
	const outside = [
		[0, 0],
		[r * 0.5, 0],
		[r * 0.56, h * 0.06],
		[r * 0.6, h * 0.1],
		[r * 0.82, h * 0.42],
		[r * 0.96, h * 0.8],
		[r, h * 0.97],
	]
	const inside = [
		[r - wall * 0.5, h],
		[r - wall, h * 0.95],
		[r * 0.86 - wall, h * 0.58],
		[r * 0.66 - wall, h * 0.32],
		[0, b.floor],
	]
	const points = [...outside, ...inside].map(([x, y]) => new THREE.Vector2(x, y))
	const foot = new THREE.Color(b.colors.foot),
		glaze = new THREE.Color(b.colors.glaze),
		well = new THREE.Color(b.colors.inside)
	const lathe = new THREE.LatheGeometry(points, b.segments)
	const ring = points.length
	return bake(
		lathe,
		(i) => {
			const k = i % ring
			return k < 3 ? foot : k < outside.length ? glaze : well
		},
		{ gloss: tune.lobby.floor.gloss },
	)
}

// Map metres in, one flat-shaded geometry out: slab and rock, lane inlays, cover and structures.
function miniature(layout, look) {
	const b = layout.bounds
	const parts = []
	const court = new THREE.Color(look.court),
		stone = new THREE.Color(look.stone),
		under = new THREE.Color(look.under),
		lane = new THREE.Color(look.court).multiplyScalar(0.9),
		hedge = new THREE.Color(look.hedge),
		cap = new THREE.Color(look.cap)
	const team = { A: new THREE.Color(PALETTE.teamA), B: new THREE.Color(PALETTE.teamB) }
	const add = (geometry, color, x = 0, y = 0, z = 0) => {
		geometry.translate(x, y, z)
		parts.push(bake(geometry, typeof color === 'function' ? color : () => color, { flat: true }))
	}
	const margin = look.margin
	const slab = look.slab
	add(
		new THREE.BoxGeometry(b.halfX * 2 + margin * 2, slab, b.halfZ * 2 + margin * 2),
		(_, n) => (n.y > 0.5 ? court : stone),
		0,
		-slab / 2,
	)
	const rock = new THREE.ConeGeometry(b.halfZ + margin, look.rock, 7, 1)
	rock.rotateX(Math.PI)
	rock.scale((b.halfX + margin) / (b.halfZ + margin), 1, 1)
	add(rock, under, 0, -slab - look.rock / 2)
	for (const l of layout.lanes) {
		const [a, c] = [l.path[0], l.path.at(-1)]
		const length = Math.hypot(c.x - a.x, c.z - a.z)
		const strip = new THREE.BoxGeometry(length, 0.2, (l.halfWidth ?? look.laneWidth) * 2)
		strip.rotateY(-Math.atan2(c.z - a.z, c.x - a.x))
		add(strip, lane, (a.x + c.x) / 2, 0.1, (a.z + c.z) / 2)
	}
	for (const o of layout.boxes) {
		const tall = o.kind === 'hedge' ? look.hedgeHeight : look.wallHeight
		add(
			new THREE.BoxGeometry(o.halfX * 2, tall, o.halfZ * 2),
			o.kind === 'hedge' ? hedge : stone,
			o.x,
			tall / 2,
			o.z,
		)
	}
	for (const p of layout.pillars)
		add(
			new THREE.CylinderGeometry(p.r, p.r * 1.15, look.pillarHeight, 7),
			stone,
			p.x,
			look.pillarHeight / 2,
			p.z,
		)
	for (const s of layout.structures) {
		if (s.kind === 'core') {
			add(new THREE.BoxGeometry(4, 1.2, 4), stone, s.x, 0.6, s.z)
			add(new THREE.OctahedronGeometry(2.2).scale(1, 1.5, 1), team[s.team], s.x, 4.4, s.z)
		} else if (s.kind === 'fort') {
			add(new THREE.BoxGeometry(3.4, 2.6, 3.4), stone, s.x, 1.3, s.z)
			add(new THREE.BoxGeometry(3.6, 0.6, 3.6), team[s.team], s.x, 2.9, s.z)
		} else {
			add(new THREE.CylinderGeometry(1, 1.4, 3.4, 7), stone, s.x, 1.7, s.z)
			add(new THREE.ConeGeometry(1.1, 2, 6), team[s.team], s.x, 4.4, s.z)
		}
	}
	// A pale cap on every wall top, the way the isles carry moss.
	for (const o of layout.boxes)
		if (o.kind !== 'hedge')
			add(
				new THREE.BoxGeometry(o.halfX * 2 + 0.3, 0.4, o.halfZ * 2 + 0.3),
				cap,
				o.x,
				look.wallHeight + 0.2,
				o.z,
			)
	const geometry = mergeGeometries(parts)
	for (const part of parts) part.dispose()
	return geometry
}

// The back half of a cylinder whose top edge arches from nothing at the sides to `capHeight`
// behind the middle: from the camera, a semicircle of sky behind the miniature.
function skyArch(b) {
	const across = 32,
		up = 8
	const positions = [],
		uvs = [],
		index = [],
		edge = []
	for (let i = 0; i <= across; i++) {
		const a = (i / across) * Math.PI
		const top = b.capHeight * Math.sin(a) ** 0.55
		const x = Math.cos(a) * b.capRadius,
			z = -Math.sin(a) * b.capRadius
		for (let j = 0; j <= up; j++) {
			positions.push(x, (top * j) / up, z)
			uvs.push(1 - i / across, j / up)
		}
		edge.push(new THREE.Vector3(x, top, z))
	}
	for (let i = 0; i < across; i++)
		for (let j = 0; j < up; j++) {
			const a = i * (up + 1) + j,
				c = a + up + 1
			index.push(a, c, a + 1, a + 1, c, c + 1)
		}
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
	geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
	geometry.setIndex(index)
	return { geometry, edge }
}

function drawSky(look, size) {
	const canvas = document.createElement('canvas')
	canvas.width = size * 2
	canvas.height = size
	const g = canvas.getContext('2d')
	// Canvas top is the zenith, bottom the horizon behind the miniature.
	const sky = g.createLinearGradient(0, 0, 0, size)
	sky.addColorStop(0, look.sky[0])
	sky.addColorStop(1, look.sky[1])
	g.fillStyle = sky
	g.fillRect(0, 0, size * 2, size)
	let seed = 11
	const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
	g.fillStyle = look.star
	for (let i = 0; i < look.stars; i++) {
		g.globalAlpha = 0.4 + rand() * 0.6
		const r = 1 + rand() * 1.5
		g.fillRect(rand() * size * 2, rand() * size * 0.7, r, r)
	}
	g.globalAlpha = 1
	const [mx, my, mr] = look.moon.map((v) => v * size)
	g.fillStyle = look.moonColor
	g.beginPath()
	g.arc(mx, my, mr, 0, Math.PI * 2)
	g.fill()
	if (look.crescent) {
		g.globalCompositeOperation = 'destination-out'
		g.beginPath()
		g.arc(mx + mr * 0.45, my - mr * 0.2, mr * 0.85, 0, Math.PI * 2)
		g.fill()
		g.globalCompositeOperation = 'destination-over'
		g.fillStyle = sky
		g.fillRect(0, 0, size * 2, size)
		g.globalCompositeOperation = 'source-over'
	}
	// A low band of cloud along the horizon.
	g.fillStyle = look.cloud
	for (let i = 0; i < 18; i++) {
		g.globalAlpha = 0.5 + rand() * 0.4
		g.beginPath()
		g.ellipse(
			rand() * size * 2,
			size * (0.92 + rand() * 0.08),
			size * (0.08 + rand() * 0.1),
			size * (0.04 + rand() * 0.05),
			0,
			0,
			Math.PI * 2,
		)
		g.fill()
	}
	g.globalAlpha = 1
	return canvas
}

export function createWeatherBowl(scene, el, mapId, renderer) {
	const b = tune.lobby.bowl
	const layout = mapLayout(mapId)
	const look = b.maps[layout.bounds.id] ?? b.maps.overthrow
	const owned = []
	const group = new THREE.Group()
	group.name = 'lobby-weather-bowl'
	group.position.set(b.x, tune.map.printLayers.lobby, b.z)
	// Face the lobby camera, so the sky cap stands behind the miniature.
	const c = tune.lobby.camera
	group.rotation.y = Math.atan2(c.x - b.x, c.z + c.back - b.z)
	const forward = (object) => {
		object.layers.set(FORWARD_LAYER)
		object.frustumCulled = false
		owned.push(object.geometry, object.material)
		return object
	}
	const vertex = () => new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })
	const ink = () => new THREE.LineBasicMaterial({ color: PALETTE.ink })
	const bowl = forward(new THREE.Mesh(bowlGeometry(b), vertex()))
	const rim = []
	for (let i = 0; i <= b.segments; i++) {
		const a = (i / b.segments) * Math.PI * 2
		rim.push(new THREE.Vector3(Math.sin(a) * b.radius, b.height * 0.97, Math.cos(a) * b.radius))
	}
	const rimLine = forward(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rim), ink()))
	// The cloud bed the miniature floats over, set inside the wall where it flares out.
	const bed = forward(
		new THREE.Mesh(
			new THREE.CircleGeometry(b.radius * 0.86 - b.wall - 0.03, b.segments).rotateX(-Math.PI / 2),
			new THREE.MeshBasicMaterial({ color: look.cloud }),
		),
	)
	bed.position.y = b.height * 0.58
	// Sky cap: an arched panel curving round the back of the rim, painted on its inside.
	const texture = new THREE.CanvasTexture(drawSky(look, b.skyPixels))
	texture.colorSpace = THREE.SRGBColorSpace
	texture.anisotropy = renderer?.capabilities.getMaxAnisotropy() ?? 1
	owned.push(texture)
	const arch = skyArch(b)
	const cap = forward(
		new THREE.Mesh(
			arch.geometry,
			new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
		),
	)
	cap.position.y = b.height * 0.97
	const capLine = forward(
		new THREE.Line(new THREE.BufferGeometry().setFromPoints(arch.edge), ink()),
	)
	capLine.position.y = cap.position.y
	// The miniature, scaled so its corners turn clear of the bowl's wall.
	const island = new THREE.Group()
	const reach = Math.hypot(layout.bounds.halfX + look.margin, layout.bounds.halfZ + look.margin)
	const k = b.island / reach
	island.scale.set(k, k * b.relief, k)
	island.position.y = bed.position.y + b.lift
	const model = miniature(layout, look)
	const mini = forward(new THREE.Mesh(model, vertex()))
	const lines = forward(new THREE.LineSegments(new THREE.EdgesGeometry(model, 35), ink()))
	island.add(mini, lines)
	group.add(bowl, rimLine, bed, cap, capLine, island)
	scene.add(group)
	const label = document.createElement('div')
	label.className = 'lobby-label lobby-bowl-label'
	label.dataset.picked = 'true'
	label.textContent = b.label.replace('{map}', layout.name)
	el.append(label)
	const still = matchMedia('(prefers-reduced-motion: reduce)')
	const point = new THREE.Vector3()
	return {
		group,
		label,
		update(time, camera) {
			island.rotation.y = still.matches ? b.rest : b.rest + time * b.turn
			island.position.y =
				bed.position.y + b.lift + (still.matches ? 0 : Math.sin(time * b.bobRate) * b.bob)
			// The label prints on the bowl's front, toward the camera.
			point.set(0, 0, b.radius).applyMatrix4(group.matrixWorld).project(camera)
			label.hidden = point.z < -1 || point.z > 1
			label.style.left = `${((point.x + 1) * innerWidth) / 2}px`
			label.style.top = `${((1 - point.y) * innerHeight) / 2}px`
		},
		dispose() {
			group.removeFromParent()
			label.remove()
			for (const item of owned) item.dispose()
		},
	}
}
