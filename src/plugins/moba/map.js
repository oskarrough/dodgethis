import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { FORWARD_LAYER, makeStyleMaterial } from '../../core/stylepass.js'
import { tune as coreTune } from '../../core/tune.js'
import { tune } from './tune.js'
import { saucerShape } from './lobby-floor.js'
import { BOLLARD_ROLES, bollardGeometries } from './bollard.js'
import { WINDBREAK_ROLES, windbreakGeometries } from './windbreak.js'
import { createMatchTerrain } from './match-terrain.js'
import { glowTexture } from './isle.js'
import { loadFlagfallTile } from './flagfall-water.js'
import { FLOOR, buildColliders } from './obstacles.js'
import { DEFAULT_MAP, mapLayout } from './maps/index.js'
export { FLOOR, PILLARS, SPAWN, walkable, clampWalkable } from './obstacles.js'

// Selection, loading and gameplay share this owner, not the browser's dodgeball world.
// The kernel aborts the previous run before starting its successor.
export function createMapScope(scene, RAPIER, step) {
	let world = null
	let unbuild = null
	let live = null
	let built = null
	return {
		// `kind` picks the terrain: lane, Flagfall walkabout, or the lobby pick screen.
		// Switching rebuilds the terrain on the same world; the previous run is already aborted.
		start(run, create, kind = DEFAULT_MAP) {
			if (live) throw new Error('MOBA already has a live sim')
			if (!world) {
				world = new RAPIER.World({ x: 0, y: coreTune.physics.gravity, z: 0 })
				world.timestep = step
			}
			// Authored layouts read tune on restart; rebuild visuals and colliders together.
			if (built !== kind || kind === 'lobby' || mapLayout(kind).settings) {
				unbuild?.()
				unbuild = buildMap(scene, world, RAPIER, kind)
				built = kind
			}
			const releaseWorld = run.debug.world(world)
			live = create(world)
			const owned = live
			run.signal.addEventListener(
				'abort',
				() => {
					live = null
					try {
						owned.dispose()
					} finally {
						releaseWorld?.()
						if (kind !== 'lobby') {
							unbuild?.()
							unbuild = null
							built = null
						}
					}
				},
				{ once: true },
			)
			return owned
		},
		update(dt) {
			unbuild?.update?.(dt)
		},
		dispose() {
			if (live) throw new Error('Dispose the MOBA sim before its map')
			unbuild?.()
			unbuild = null
			built = null
			world?.free()
			world = null
		},
	}
}

// Ground prints and cover share the active layout's collision descriptors.
// The 'lobby' kind draws only the lobby floor's cream ground: no walls, no pillars.
export function buildMap(scene, world, RAPIER, kind = DEFAULT_MAP) {
	const layout = mapLayout(kind)
	const scale = layout.settings?.scale ?? 1
	const m = { ...tune.map }
	if (layout.settings)
		for (const key of [
			'hedgeHeight',
			'wallHeight',
			'scallopRadius',
			'scallopSpacing',
			'pillarHeight',
			'capHeight',
			'dashSpacing',
			'dashLength',
		])
			m[key] *= scale
	const group = new THREE.Group()
	group.name = 'moba-map'
	const owned = []
	const material = (role, options) => {
		const mat = makeStyleMaterial(role, options)
		owned.push(mat)
		return mat
	}
	const finish = layout.settings?.finish ?? null
	const shade = material('courtShade')
	const cream = material('cream', { flat: true })
	const scenery = material('scenery')
	// Flagfall's cover keeps the exact opaque depth/collision shape; its colour sheets
	// give hedges a quiet organic top, and walls and pillars coursed sandstone, without
	// changing shared roles.
	const coverTile = finish
		? loadFlagfallTile(finish.hedgeAsset, finish.anisotropy, (resource) => {
				owned.push(resource)
				return resource
			})
		: null
	// One program for every sheet; the face pattern is uniforms only.
	const sheetMaterial = (color, { texture = 0, block = [0, 0], flutes = 0 } = {}) => {
		const mat = new THREE.MeshBasicMaterial({
			color,
			depthWrite: false,
			polygonOffset: true,
			polygonOffsetFactor: -1,
			polygonOffsetUnits: -4,
		})
		owned.push(mat)
		mat.onBeforeCompile = (shader) => {
			Object.assign(shader.uniforms, {
				coverTile: { value: coverTile },
				coverMetres: { value: finish.hedgeMetres * scale },
				coverTexture: { value: texture },
				coverShade: { value: finish.coverShade },
				coverBlock: { value: new THREE.Vector2(block[0] * scale, block[1] * scale) },
				coverFlag: { value: finish.wallFlag * scale },
				coverFlutes: { value: flutes },
				coverFlute: { value: finish.fluteDepth },
				coverMortar: { value: finish.mortar },
				coverMortarWidth: { value: finish.mortarWidth * scale },
				coverMottle: { value: finish.mottle },
				coverFoot: { value: new THREE.Vector2(finish.footHeight * scale, finish.footShade) },
			})
			shader.vertexShader =
				'varying vec3 coverPoint;\nvarying vec3 coverLocal;\nvarying vec3 coverNormal;\n' +
				shader.vertexShader.replace(
					'#include <begin_vertex>',
					'#include <begin_vertex>\ncoverPoint = (modelMatrix * vec4(position,1.0)).xyz;\ncoverLocal = position;\ncoverNormal = mat3(modelMatrix) * normal;',
				)
			shader.fragmentShader =
				`varying vec3 coverPoint, coverLocal, coverNormal;
uniform sampler2D coverTile;
uniform float coverMetres, coverTexture, coverShade, coverFlutes, coverFlute, coverMortar, coverMortarWidth, coverMottle, coverFlag;
uniform vec2 coverBlock, coverFoot;
` +
				shader.fragmentShader.replace(
					'#include <color_fragment>',
					`#include <color_fragment>
vec3 n = normalize(coverNormal);
float top = smoothstep(0.45, 0.9, n.y);
diffuseColor.rgb *= mix(vec3(1.0), texture2D(coverTile, coverPoint.xz / coverMetres).rgb, top * coverTexture);
if (coverBlock.y > 0.0) {
	// Running-bond courses on the sides, broad fainter flags on top; joints are a soft
	// darkening at least a pixel wide, never ink.
	vec2 size = max(top > 0.5 ? vec2(coverFlag) : coverBlock, vec2(0.001));
	vec2 face = (top > 0.5 ? coverPoint.xz : vec2(abs(n.x) > abs(n.z) ? coverPoint.z : coverPoint.x, coverPoint.y)) / size;
	face.x += 0.5 * floor(face.y);
	vec2 edge = min(fract(face), 1.0 - fract(face)) / max(coverMortarWidth / size, fwidth(face));
	if (coverBlock.x <= 0.0) edge.x = 1e4; // drums: bed joints only
	diffuseColor.rgb *= 1.0 - coverMortar * (1.0 - 0.5 * top) * (1.0 - smoothstep(0.5, 1.5, min(edge.x, edge.y)));
	diffuseColor.rgb *= 1.0 + coverMottle * (fract(sin(dot(floor(face), vec2(12.9898, 78.233))) * 43758.5453) - 0.5);
	diffuseColor.rgb *= 1.0 - coverFoot.y * (1.0 - smoothstep(0.0, coverFoot.x, coverPoint.y));
}
diffuseColor.rgb *= 1.0 - coverFlute * (1.0 - top) * step(0.5, coverFlutes) * (0.5 + 0.5 * cos(atan(coverLocal.z, coverLocal.x) * coverFlutes));
diffuseColor.rgb *= 1.0 - coverShade * (1.0 - max(0.0, dot(n, normalize(vec3(0.4,0.85,0.35)))));`,
				)
		}
		return mat
	}
	const hedgeColor = finish && sheetMaterial(finish.cover, { texture: finish.hedgeTexture })
	const wallColor = finish && sheetMaterial(finish.wall, { block: finish.wallBlock })
	const pillarColor =
		finish &&
		sheetMaterial(finish.pillar, { block: [0, finish.pillarCourse], flutes: finish.pillarFlutes })
	const add = (geometry, mat, x, y, z, sheetColor = null) => {
		owned.push(geometry)
		const mesh = new THREE.Mesh(geometry, mat)
		mesh.position.set(x, y, z)
		group.add(mesh)
		if (finish && sheetColor) {
			const sheet = new THREE.Mesh(geometry, sheetColor)
			sheet.position.copy(mesh.position)
			sheet.layers.set(FORWARD_LAYER)
			group.add(sheet)
		}
		return mesh
	}
	const print = (geometries, mat, name) => {
		if (!geometries.length) return
		add(mergeGeometries(geometries), mat, 0, 0, 0).name = name
		for (const g of geometries) g.dispose()
	}
	const buildLobby = () => {
		// The saucer's glaze, not an endless plane: nothing is drawn beyond it, so the sky shows through.
		add(saucerShape(), cream, 0, m.printLayers.lobby, 0)
	}
	let unterrain = null
	const kerbStones = []
	const lanterns = []
	const terrain = { ...tune.overthrowTerrain }
	if (layout.settings) {
		for (const key of [
			'margin',
			'jag',
			'step',
			'rockFlare',
			'courtInset',
			'chalkWidth',
			'patchScale',
		])
			terrain[key] *= scale
		terrain.rockDepth = layout.settings.rockDepth * scale
		// Flagfall by night swaps the isle's light and air; cliff, spires and stone stay shared.
		for (const key of [
			'colors',
			'light',
			'pool',
			'haze',
			'clouds',
			'falls',
			'moon',
			'garden',
			'specks',
		])
			if (layout.settings[key]) terrain[key] = layout.settings[key]
	}
	const bounds = layout.bounds
	const chalkLayout = { lines: [], circles: [] }
	const chalkLine = (width, length, x, z) => chalkLayout.lines.push({ width, length, x, z })
	for (const side of [-1, 1]) {
		chalkLine(
			(bounds.halfX - terrain.courtInset) * 2,
			terrain.chalkWidth,
			0,
			side * (bounds.halfZ - terrain.courtInset),
		)
		chalkLine(
			terrain.chalkWidth,
			(bounds.halfZ - terrain.courtInset) * 2,
			side * (bounds.halfX - terrain.courtInset),
			0,
		)
	}
	const buildLane = () => {
		for (const side of [-1, 1])
			chalkLine(terrain.chalkWidth, m.hedgeInnerZ * 2, side * m.hedgeInnerX, 0)
		chalkLine(terrain.chalkWidth, (bounds.halfZ - terrain.courtInset) * 2, 0, 0)
		chalkLayout.circles.push({ radius: m.plazaRadius, x: 0, z: 0 })
		unterrain = createMatchTerrain(group, layout, terrain, chalkLayout, {
			casts: { hedge: m.hedgeHeight, wall: m.wallHeight, pillar: m.pillarHeight + m.capHeight },
		})
		// Ownership remains a small semantic print; it is not scenery.
		for (const side of [-1, 1]) {
			const team = material(side < 0 ? 'teamA' : 'teamB', { flat: true })
			const kerbs = []
			for (let x = m.dashSpacing; x < FLOOR.halfX; x += m.dashSpacing)
				for (const flank of [-1, 1])
					kerbs.push(
						new THREE.PlaneGeometry(m.dashLength, m.lineWidth * 2)
							.rotateX(-Math.PI / 2)
							.translate(side * x, m.printLayers.marks, flank * (m.hedgeInnerZ - m.lineWidth)),
					)
			print(kerbs, team, `moba-kerbs-${side}`)
		}
	}
	const buildFlagfall = () => {
		const s = layout.settings
		const layers = s.print.layers
		for (const flank of [-1, 1]) {
			chalkLine(
				s.baseBlock.outerX * 2,
				terrain.chalkWidth,
				0,
				flank * (s.lane.innerZ + terrain.courtInset),
			)
			for (const side of [-1, 1])
				chalkLine(
					terrain.chalkWidth,
					s.lane.outerZ - s.lane.innerZ - terrain.courtInset * 2,
					side * s.baseBlock.outerX,
					flank * s.lane.centreZ,
				)
		}
		// A low coursed-stone kerb on the safe rim, never a collider. The long shores' runs are
		// what the dunk gaps leave, so the drawn gaps are exactly the sim's.
		const k = s.kerb
		const kerbHalf = (k.depth * scale) / 2
		const kerbZ = bounds.halfZ + k.offset * terrain.margin
		const kerbX = bounds.halfX + k.offset * terrain.margin
		const kerb = (x0, x1, z0, z1) =>
			kerbStones.push({
				kind: 'kerb',
				x: (x0 + x1) / 2,
				z: (z0 + z1) / 2,
				halfX: (x1 - x0) / 2,
				halfZ: (z1 - z0) / 2,
			})
		for (const flank of [-1, 1]) {
			const cuts = layout.gaps
				.filter((gap) => gap.flank === flank)
				.map((gap) => [gap.x0, gap.x1])
				.sort((a, b) => a[0] - b[0])
			let from = -kerbX
			for (const [x0, x1] of [...cuts, [kerbX, kerbX]]) {
				if (x0 > from) kerb(from, x0, flank * kerbZ - kerbHalf, flank * kerbZ + kerbHalf)
				from = Math.max(from, x1)
			}
			// The ends behind the bases.
			kerb(
				flank * kerbX - kerbHalf,
				flank * kerbX + kerbHalf,
				-k.ends * bounds.halfZ,
				k.ends * bounds.halfZ,
			)
		}
		// The slick inside each gap: a wet print with hazard stripes, so you can see where you can be dunked.
		const wet = new THREE.MeshBasicMaterial({
			color: s.dunk.wet,
			transparent: true,
			opacity: s.dunk.wetOpacity,
			depthWrite: false,
			polygonOffset: true,
			polygonOffsetFactor: -1,
		})
		owned.push(wet)
		const slick = Math.min(s.dunk.slick, bounds.halfZ)
		const wetPrints = layout.gaps.flatMap((gap) => {
			const z = gap.flank * (bounds.halfZ - slick / 2)
			const width = gap.x1 - gap.x0
			const stripes = []
			for (let x = gap.x0 + s.dunk.wetStripe / 2; x < gap.x1; x += s.dunk.wetStripe * 2)
				stripes.push(
					new THREE.PlaneGeometry(Math.min(s.dunk.wetStripe, gap.x1 - x), slick)
						.rotateX(-Math.PI / 2)
						.translate(x + Math.min(s.dunk.wetStripe, gap.x1 - x) / 2, layers.wet, z),
				)
			return [
				new THREE.PlaneGeometry(width, slick)
					.rotateX(-Math.PI / 2)
					.translate((gap.x0 + gap.x1) / 2, layers.wet, z),
				...stripes,
			]
		})
		if (wetPrints.length) {
			const mesh = add(mergeGeometries(wetPrints), wet, 0, 0, 0)
			mesh.name = 'flagfall-slick'
			mesh.layers.set(FORWARD_LAYER)
			mesh.renderOrder = -3
			for (const g of wetPrints) g.dispose()
		}
		unterrain = createMatchTerrain(group, layout, terrain, chalkLayout, {
			footprints: s.print,
			casts: { hedge: m.hedgeHeight, wall: m.wallHeight, pillar: m.pillarHeight + m.capHeight },
		})
		for (const side of [-1, 1]) {
			const team = material(side < 0 ? 'teamA' : 'teamB', { flat: true })
			const kerbs = []
			for (let x = m.dashSpacing; x < s.baseBlock.outerX; x += m.dashSpacing)
				for (const flank of [-1, 1])
					kerbs.push(
						new THREE.PlaneGeometry(m.dashLength, s.print.kerbWidth)
							.rotateX(-Math.PI / 2)
							.translate(side * x, layers.marks, flank * (s.lane.innerZ + s.print.kerbWidth)),
					)
			print(kerbs, team, `flagfall-kerbs-${side}`)
			for (const flank of [-1, 1])
				add(
					new THREE.PlaneGeometry(s.bounds.halfX - s.baseX, s.print.kerbWidth).rotateX(
						-Math.PI / 2,
					),
					team,
					(side * (s.bounds.halfX + s.baseX)) / 2,
					layers.marks,
					flank * s.lane.innerZ,
				)
		}
		// Lantern posts: a squat stone post with a small cream glow, the only light on the court.
		const g = s.glow
		for (const post of layout.posts) {
			add(
				new THREE.CylinderGeometry(
					g.postRadius * scale,
					g.postRadius * 1.5 * scale,
					g.post * scale,
					6,
				),
				scenery,
				post.x,
				(g.post * scale) / 2,
				post.z,
			)
			lanterns.push({ x: post.x, y: (g.post + g.lantern) * scale, z: post.z })
		}
	}
	if (kind === 'lobby') buildLobby()
	else if (layout.settings?.lane) buildFlagfall()
	else buildLane()
	const windbreak = { sand: [], wood: [], stripes: [[], [], []] }
	// Overthrow by day: cover and base walls are coursed, chipped stone blocks on the same
	// collision boxes, moss on the low cover's tops; pillars are stacked faceted drums.
	const stoneCover = !finish && kind !== 'lobby'
	const stones = { blocks: [], moss: [], drums: [], caps: [] }
	const chance = (i) => {
		const v = Math.sin(i * 12.9898 + 4.1) * 43758.5453
		return v - Math.floor(v)
	}
	let chip = 0
	const coursed = (b) => {
		const c = tune.overthrowTerrain.stone
		const hedge = b.kind === 'hedge'
		const low = hedge || b.kind === 'kerb'
		const h =
			b.kind === 'kerb' ? layout.settings.kerb.height * scale : hedge ? m.hedgeHeight : m.wallHeight
		const courses = low ? 1 : c.wallCourses
		const alongX = b.halfX >= b.halfZ
		const length = (alongX ? b.halfX : b.halfZ) * 2
		const depth = (alongX ? b.halfZ : b.halfX) * 2
		const course = h / courses
		for (let k = 0; k < courses; k++) {
			let from = -length / 2 - (k % 2 ? c.blockMin / 2 : 0)
			while (from < length / 2) {
				const size = c.blockMin + chance(chip++) * (c.blockMax - c.blockMin)
				const a = Math.max(-length / 2, from),
					z = Math.min(length / 2, from + size)
				from += size
				if (z - a < 0.3) continue
				const top = k === courses - 1
				const tall = course - (top ? chance(chip++) * c.sag : 0)
				const inset = chance(chip++) * c.inset
				const block = new RoundedBoxGeometry(
					z - a - c.joint,
					tall - c.joint,
					depth - inset * 2,
					1,
					c.bevel,
				).translate((a + z) / 2, k * course + tall / 2, 0)
				if (!alongX) block.rotateY(Math.PI / 2)
				stones.blocks.push(block.translate(b.x, 0, b.z))
				if (hedge && chance(chip++) < c.mossChance) {
					const moss = new RoundedBoxGeometry(
						(z - a) * 0.86,
						c.mossHeight,
						(depth - inset * 2) * 0.82,
						1,
						c.mossHeight / 2,
					).translate((a + z) / 2, tall - c.joint / 2, 0)
					if (!alongX) moss.rotateY(Math.PI / 2)
					stones.moss.push(moss.translate(b.x, 0, b.z))
				}
			}
		}
	}
	// Flagfall by night keeps its hedges green: dark-teal leaf banks on the hedge boxes.
	const flagfall = kind !== 'lobby' && Boolean(layout.settings?.lane)
	const leaf = flagfall ? material('court') : shade
	for (const b of [...layout.boxes, ...kerbStones]) {
		if (stoneCover && !(flagfall && b.kind === 'hedge')) {
			coursed(b)
			continue
		}
		if (finish && b.kind === 'hedge') {
			const parts = windbreakGeometries(b, m.hedgeHeight, scale)
			windbreak.sand.push(...parts.sand)
			windbreak.wood.push(...parts.wood)
			parts.stripes.forEach((list, i) => windbreak.stripes[i].push(...list))
			continue
		}
		const h = b.kind === 'hedge' ? m.hedgeHeight : m.wallHeight
		const trunk = b.kind === 'hedge' ? h - m.scallopRadius : h
		add(
			new RoundedBoxGeometry(
				b.halfX * 2,
				trunk,
				b.halfZ * 2,
				1,
				Math.min(m.scallopRadius, trunk / 2),
			),
			b.kind === 'hedge' ? leaf : shade,
			b.x,
			trunk / 2,
			b.z,
			b.kind === 'hedge' ? hedgeColor : wallColor,
		)
		if (b.kind !== 'hedge') continue
		for (let x = b.x - b.halfX + m.scallopRadius; x < b.x + b.halfX; x += m.scallopSpacing)
			add(
				new THREE.SphereGeometry(m.scallopRadius, m.pillarSegments, m.pillarSegments / 2),
				leaf,
				x,
				h - m.scallopRadius,
				b.z,
				hedgeColor,
			)
	}
	print(windbreak.sand, material(WINDBREAK_ROLES.sand), 'windbreak-berms')
	print(windbreak.wood, material(WINDBREAK_ROLES.wood), 'windbreak-poles')
	windbreak.stripes.forEach((list, i) =>
		print(list, material(WINDBREAK_ROLES.stripes[i]), `windbreak-canvas-${i}`),
	)

	const bollards = layout.settings?.lane
	const bollard = Object.fromEntries(Object.keys(BOLLARD_ROLES).map((key) => [key, []]))
	for (const p of layout.pillars) {
		if (stoneCover) {
			const c = tune.overthrowTerrain.stone
			let y = 0
			c.drums.forEach(([share, shrink], i) => {
				const tall = m.pillarHeight * share
				stones.drums.push(
					new THREE.CylinderGeometry(p.r * shrink * 0.97, p.r * shrink, tall - 0.03, c.sides)
						.rotateY(i * 0.45 + p.x)
						.translate(p.x, y + tall / 2, p.z),
				)
				y += tall
			})
			stones.caps.push(
				new THREE.CylinderGeometry(p.r * c.capScale, p.r * c.capScale, c.capHeight, c.sides)
					.rotateY(p.z)
					.translate(p.x, m.pillarHeight + c.capHeight / 2 - 0.02, p.z),
			)
			continue
		}
		if (bollards) {
			const parts = bollardGeometries(p, m.pillarHeight)
			for (const key of Object.keys(bollard)) bollard[key].push(...parts[key])
			continue
		}
		add(
			new THREE.CylinderGeometry(p.r, p.r, m.pillarHeight, m.pillarSegments),
			scenery,
			p.x,
			m.pillarHeight / 2,
			p.z,
			pillarColor,
		)
		add(
			new THREE.CylinderGeometry(p.r * m.capScale, p.r * m.capScale, m.capHeight, m.pillarSegments),
			cream,
			p.x,
			m.pillarHeight + m.capHeight / 2,
			p.z,
		)
	}
	const stoneName = layout.name.toLowerCase()
	print(stones.blocks, shade, `${stoneName}-stone-blocks`)
	print(stones.moss, material('court'), `${stoneName}-stone-moss`)
	print(stones.drums, scenery, `${stoneName}-pillar-drums`)
	print(stones.caps, scenery, `${stoneName}-pillar-caps`)
	// Lanterns glow cream: a small lit bulb and a soft halo, never larger than the bulb's reach.
	if (lanterns.length) {
		const g = tune.flagfall.glow
		const bulb = new THREE.MeshBasicMaterial({ color: g.color })
		const map = glowTexture(0)
		const halo = new THREE.SpriteMaterial({
			map,
			color: g.color,
			transparent: true,
			opacity: g.haloOpacity,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
		})
		owned.push(bulb, map, halo)
		for (const p of lanterns) {
			const core = add(new THREE.SphereGeometry(g.lantern * scale, 12, 8), bulb, p.x, p.y, p.z)
			core.layers.set(FORWARD_LAYER)
			const ring = new THREE.Sprite(halo)
			ring.scale.setScalar(g.lantern * g.halo * scale * 2)
			ring.position.copy(core.position)
			ring.layers.set(FORWARD_LAYER)
			group.add(ring)
		}
	}
	for (const [key, list] of Object.entries(bollard))
		print(list, material(BOLLARD_ROLES[key]), `bollard-${key}`)
	const uncollide = buildColliders(
		world,
		RAPIER,
		layout.obstacles,
		kind === 'lobby' ? undefined : layout.bounds,
		scale,
		kind === 'lobby'
			? {
					halfX: tune.lobby.floor.halfX + tune.lobby.floor.rim.width,
					halfZ: tune.lobby.floor.halfZ + tune.lobby.floor.rim.width,
					round: true,
				}
			: null,
	)
	scene.add(group)
	const dispose = () => {
		scene.remove(group)
		unterrain?.()
		for (const resource of owned) resource.dispose()
		uncollide()
	}
	dispose.update = (dt) => {
		unterrain?.update?.(dt)
	}
	return dispose
}
