import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { FORWARD_LAYER, makeStyleMaterial } from '../../core/stylepass.js'
import { createFences, floorOutline, floorShape } from './lobby-floor.js'
import { loadFlagfallTile } from './flagfall-water.js'
import { createIsle } from './isle.js'

// A presentation skin, never a source of walking bounds or colliders. The torn edge sits
// outside the entire playable rectangle even at the extremes of the restart controls.
export function createMatchTerrain(
	parent,
	layout,
	s,
	chalkLayout,
	{ background, fence, footprints, water = false, casts = null } = {},
) {
	const bounds = layout.bounds
	const name = layout.name.toLowerCase()
	const extent = {
		halfX: bounds.halfX + s.margin + s.jag,
		halfZ: bounds.halfZ + s.margin + s.jag,
		jag: s.jag,
		step: s.step,
		seed: s.seed,
	}
	const meshes = []
	let skin = null
	const owned = new Set()
	const own = (resource) => {
		owned.add(resource)
		return resource
	}
	const flat = (color) =>
		own(new THREE.MeshBasicMaterial({ color, depthWrite: false, side: THREE.DoubleSide }))
	const finish = water ? layout.settings.finish : null
	// Overthrow by day: the court tops a stone isle over cloud (isle.js).
	const isle = !water && !background && s.cliff
	const scale = layout.settings?.scale ?? 1
	const ground = flat(s.colors.tarmac)
	// The renderer survives map switches; closure contents aren't in Three's default
	// program key, so never reuse Flagfall's shader for Overthrow (or vice versa).
	ground.customProgramCacheKey = () =>
		finish ? 'flagfall-court-finish' : isle ? 'overthrow-court' : 'quiet-court'
	const courtTile = finish
		? loadFlagfallTile(finish.courtAsset, finish.anisotropy, own, finish.courtMean)
		: null
	// Mirror createFences' safe rim exactly; the shadows sit under its real feet.
	const fenceClearance = fence
		? extent.jag +
			fence.edgeMargin +
			Math.max(fence.capRadius, fence.bollardRadius) +
			Math.abs(fence.bow)
		: 0
	const fenceHalfX = extent.halfX - fenceClearance
	const fenceHalfZ = extent.halfZ - fenceClearance
	// Contact is printed into the ground colour, not a black outline or a shadow map.
	const contacts = finish
		? [
				...layout.boxes.map((b) => new THREE.Vector4(b.x, b.z, b.halfX, b.halfZ)),
				...(fence?.runs ?? []).map(({ from, to }) => {
					const ax = from[0] * fenceHalfX,
						az = from[1] * fenceHalfZ
					const bx = to[0] * fenceHalfX,
						bz = to[1] * fenceHalfZ
					return new THREE.Vector4(
						(ax + bx) / 2,
						(az + bz) / 2,
						Math.abs(ax - bx) / 2,
						Math.abs(az - bz) / 2,
					)
				}),
			]
		: []
	const feet = finish
		? [
				...layout.pillars.map((p) => new THREE.Vector3(p.x, p.z, p.r)),
				...layout.posts.map((p) => new THREE.Vector3(p.x, p.z, layout.settings.print.poleRadius)),
				...(fence?.bollards ?? []).map(
					([x, z]) => new THREE.Vector3(x * fenceHalfX, z * fenceHalfZ, fence.bollardRadius),
				),
			]
		: []
	// Bake static contact once. A single quiet multiply costs much less than a
	// per-fragment nearest-obstacle search, especially on the software proof host.
	let contactPrint = null
	if (finish) {
		const ppm = finish.contactPixelsPerMetre * devicePixelRatio
		const canvas = document.createElement('canvas')
		canvas.width = Math.ceil(extent.halfX * 2 * ppm)
		canvas.height = Math.ceil(extent.halfZ * 2 * ppm)
		const ctx = canvas.getContext('2d')
		ctx.fillStyle = '#fff'
		ctx.fillRect(0, 0, canvas.width, canvas.height)
		const px = (x) => ((x + extent.halfX) / (2 * extent.halfX)) * canvas.width
		const pz = (z) => ((z + extent.halfZ) / (2 * extent.halfZ)) * canvas.height
		const ink = `rgba(0,0,0,${finish.contactStrength})`
		ctx.fillStyle = ctx.strokeStyle = ctx.shadowColor = ink
		ctx.shadowBlur = finish.contactWidth * scale * ppm
		for (const b of contacts) {
			ctx.lineWidth = Math.max(fence?.postRadius ?? 0, 1 / ppm) * 2 * ppm
			ctx.beginPath()
			ctx.rect(px(b.x - b.z), pz(b.y - b.w), b.z * 2 * ppm, b.w * 2 * ppm)
			ctx.fill()
			ctx.stroke()
		}
		for (const p of feet) {
			ctx.beginPath()
			ctx.arc(px(p.x), pz(p.y), p.z * ppm, 0, Math.PI * 2)
			ctx.fill()
		}
		ctx.strokeStyle = ctx.shadowColor = `rgba(0,0,0,${finish.edgeStrength})`
		ctx.shadowBlur = finish.edgeWidth * scale * ppm
		ctx.lineWidth = finish.edgeWidth * scale * ppm
		ctx.beginPath()
		const rim = floorOutline(extent)
		for (let i = 0; i < rim.length; i++) ctx[i ? 'lineTo' : 'moveTo'](px(rim[i].x), pz(rim[i].z))
		ctx.closePath()
		ctx.stroke()
		contactPrint = own(new THREE.CanvasTexture(canvas))
		contactPrint.colorSpace = THREE.SRGBColorSpace
		contactPrint.anisotropy = finish.anisotropy
	}
	// One low sun prints long violet shadows from cover onto the court, baked once like the
	// contact above: the swept footprint of each box and pillar, never a shadow map.
	let shadowPrint = null
	// Headless builds (tests, the bot harness) have no canvas; the print is presentation only.
	if (isle && casts && typeof document !== 'undefined') {
		const ppm = s.light.shadowPixelsPerMetre * devicePixelRatio
		const canvas = document.createElement('canvas')
		canvas.width = Math.ceil(extent.halfX * 2 * ppm)
		canvas.height = Math.ceil(extent.halfZ * 2 * ppm)
		const ctx = canvas.getContext('2d')
		ctx.fillStyle = '#fff'
		ctx.fillRect(0, 0, canvas.width, canvas.height)
		const px = (x) => ((x + extent.halfX) / (2 * extent.halfX)) * canvas.width
		const pz = (z) => ((z + extent.halfZ) / (2 * extent.halfZ)) * canvas.height
		const [lx, ly, lz] = s.light.dir
		const reach = s.light.shadowLength / Math.max(0.05, ly)
		const offset = (h) => ({ x: -lx * reach * h, z: -lz * reach * h })
		ctx.fillStyle = ctx.strokeStyle = '#000'
		ctx.lineCap = 'round'
		for (const b of layout.boxes) {
			const o = offset(b.kind === 'hedge' ? casts.hedge : casts.wall)
			const corners = []
			for (const [sx, sz] of [
				[-1, -1],
				[1, -1],
				[1, 1],
				[-1, 1],
			])
				for (const d of [0, 1])
					corners.push({ x: b.x + sx * b.halfX + o.x * d, z: b.z + sz * b.halfZ + o.z * d })
			const hull = convexHull(corners)
			ctx.beginPath()
			hull.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](px(p.x), pz(p.z)))
			ctx.fill()
		}
		for (const p of layout.pillars) {
			const o = offset(casts.pillar)
			ctx.lineWidth = p.r * 2 * ppm
			ctx.beginPath()
			ctx.moveTo(px(p.x), pz(p.z))
			ctx.lineTo(px(p.x + o.x), pz(p.z + o.z))
			ctx.stroke()
		}
		shadowPrint = own(new THREE.CanvasTexture(canvas))
		shadowPrint.anisotropy = 4
	}
	// Broad, barely-visible tarmac patches, not texture detail or busy cracks.
	ground.onBeforeCompile = (shader) => {
		shader.uniforms.courtScale = { value: s.patchScale }
		shader.uniforms.courtContrast = { value: s.patchContrast }
		if (isle)
			Object.assign(shader.uniforms, {
				courtEdge: { value: new THREE.Vector2(extent.halfX, extent.halfZ) },
				courtMoss: { value: new THREE.Color(s.colors.moss) },
				courtLip: { value: new THREE.Vector2(s.cliff.lipMin, Math.min(s.cliff.lipMax, s.margin)) },
				courtShadow: { value: new THREE.Color(s.light.shadow) },
				courtShadowPrint: { value: shadowPrint },
				courtShadowOn: { value: shadowPrint ? 1 : 0 },
				courtShadowStrength: { value: s.light.shadowStrength },
			})
		if (finish)
			Object.assign(shader.uniforms, {
				courtTile: { value: courtTile },
				courtMetres: { value: finish.courtMetres * scale },
				courtTexture: { value: finish.courtTexture },
				courtRange: { value: finish.courtRange },
				courtMean: { value: finish.courtMean },
				courtWarm: { value: new THREE.Color(finish.warm) },
				courtCool: { value: new THREE.Color(finish.cool) },
				courtLight: { value: finish.lightStrength },
				courtSpread: { value: finish.lightSpread },
				courtBounds: { value: new THREE.Vector2(extent.halfX, extent.halfZ) },
				contactPrint: { value: contactPrint },
			})
		shader.vertexShader =
			'varying vec2 courtPoint;\n' +
			shader.vertexShader.replace(
				'#include <begin_vertex>',
				'#include <begin_vertex>\ncourtPoint = position.xz;',
			)
		shader.fragmentShader =
			`varying vec2 courtPoint;
uniform float courtScale;
uniform float courtContrast;
float courtHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float courtPatch(vec2 p) {
	vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(courtHash(i), courtHash(i + vec2(1, 0)), f.x),
		mix(courtHash(i + vec2(0, 1)), courtHash(i + vec2(1, 1)), f.x), f.y);
}
` +
			shader.fragmentShader.replace(
				'#include <color_fragment>',
				`#include <color_fragment>
 diffuseColor.rgb *= 1.0 - courtContrast * courtPatch(courtPoint / courtScale);
${
	isle
		? `
// A broken moss lip inside the torn rim, never past the margin into the walkable court.
vec2 edge = courtEdge - abs(courtPoint);
float rim = min(edge.x, edge.y);
float along = courtPoint.x + courtPoint.y * 1.37;
float lip = mix(courtLip.x, courtLip.y, 0.6 * courtPatch(vec2(along * 1.9, 3.0)) + 0.4 * courtPatch(vec2(along * 5.3, 9.0)));
diffuseColor.rgb = mix(diffuseColor.rgb, courtMoss, step(rim, lip));
if (courtShadowOn > 0.5) {
	float shaded = 1.0 - texture2D(courtShadowPrint, vec2(0.5) + vec2(courtPoint.x, -courtPoint.y) / (courtEdge * 2.0)).r;
	diffuseColor.rgb = mix(diffuseColor.rgb, courtShadow.rgb, shaded * courtShadowStrength);
}
`
		: ''
}${
					finish
						? `
// Luminance only: the tile's warmth must not tint the floor.
float grain = dot(texture2D(courtTile, courtPoint / courtMetres).rgb, vec3(0.2126, 0.7152, 0.0722)) / courtMean;
diffuseColor.rgb *= clamp(1.0 + (grain - 1.0) * courtTexture, 1.0 - courtRange, 1.0 + courtRange);
float pool = exp(-dot(courtPoint / (courtBounds * courtSpread), courtPoint / (courtBounds * courtSpread)));
diffuseColor.rgb = mix(diffuseColor.rgb, mix(courtCool, courtWarm, pool), courtLight);
diffuseColor.rgb *= texture2D(contactPrint, vec2(0.5) + vec2(courtPoint.x, -courtPoint.y) / (courtBounds * 2.0)).rgb;
`
						: ''
				}`,
			)
		if (isle)
			shader.fragmentShader =
				'uniform vec2 courtEdge, courtLip;\nuniform vec3 courtMoss, courtShadow;\nuniform sampler2D courtShadowPrint;\nuniform float courtShadowOn, courtShadowStrength;\n' +
				shader.fragmentShader
		if (finish)
			shader.fragmentShader =
				`
uniform sampler2D courtTile;
uniform float courtMetres, courtTexture, courtRange, courtMean, courtLight, courtSpread;
uniform vec3 courtWarm, courtCool;
uniform vec2 courtBounds;
uniform sampler2D contactPrint;
` + shader.fragmentShader
	}
	const chalk = flat(s.colors.chalk)
	const rock = own(
		new THREE.MeshBasicMaterial({ vertexColors: true, depthWrite: false, side: THREE.DoubleSide }),
	)
	const surround = background ? flat(background.colors.surround) : null
	const depth = own(makeStyleMaterial('cream', { flat: true }))
	const rockDepth = own(makeStyleMaterial('scenery', { flat: true }))
	// Visible and opaque depth meshes share the exact geometry and transform. Pull only
	// the forward colour a fraction toward the camera; never replace unit/effect depth.
	function surface(geometry, material, name, x, y, z, proxy = rockDepth) {
		own(geometry)
		const opaque = new THREE.Mesh(geometry, proxy)
		opaque.position.set(x, y, z)
		const sheet = new THREE.Mesh(geometry, material)
		sheet.name = name
		sheet.position.copy(opaque.position)
		sheet.layers.set(FORWARD_LAYER)
		sheet.renderOrder = -4
		meshes.push(opaque, sheet)
	}
	for (const material of [ground, rock, surround].filter(Boolean)) {
		material.polygonOffset = true
		material.polygonOffsetFactor = -1
		material.polygonOffsetUnits = -4
	}
	surface(floorShape(extent), ground, `${name}-tarmac`, 0, s.groundY, 0, depth)
	const outline = floorOutline(extent)
	const positions = [],
		colors = []
	const light = new THREE.Color(finish?.rock ?? s.colors.rock)
	const dark = new THREE.Color(finish?.rockDark ?? s.colors.rockDark)
	if (finish)
		rock.onBeforeCompile = (shader) => {
			Object.assign(shader.uniforms, {
				stoneGrain: { value: finish.rockGrain },
				stoneGrainMetres: { value: finish.rockGrainMetres * scale },
				stoneStrata: { value: finish.rockStrata * scale },
				stoneWaterY: { value: -layout.settings.water.drop * scale },
				stoneWetHeight: { value: finish.wetHeight * scale },
				stoneWetStrength: { value: finish.wetStrength },
			})
			shader.vertexShader =
				'varying vec3 stonePoint;\n' +
				shader.vertexShader.replace(
					'#include <begin_vertex>',
					'#include <begin_vertex>\nstonePoint = position;',
				)
			shader.fragmentShader =
				`varying vec3 stonePoint;
uniform float stoneGrain, stoneGrainMetres, stoneStrata, stoneWaterY, stoneWetHeight, stoneWetStrength;
` +
				shader.fragmentShader.replace(
					'#include <color_fragment>',
					`#include <color_fragment>
float strata = sin(stonePoint.y / stoneStrata + 0.3 * sin(stonePoint.x + stonePoint.z));
float grain = fract(sin(dot(floor(stonePoint / stoneGrainMetres), vec3(12.9898, 78.233, 39.425))) * 43758.5453);
float wet = 1.0 - smoothstep(stoneWaterY, stoneWaterY + stoneWetHeight, stonePoint.y);
diffuseColor.rgb *= (1.0 + stoneGrain * (strata + grain - 0.5)) * (1.0 - wet * stoneWetStrength);`,
				)
		}
	const tint = new THREE.Color()
	const vertex = (p, y, color) => {
		positions.push(p.x, y, p.z)
		colors.push(color.r, color.g, color.b)
	}
	for (let band = 0; band < (isle ? 0 : s.rockBands); band++) {
		const top = s.groundY - (band / s.rockBands) * s.rockDepth
		const bottom = s.groundY - ((band + 1) / s.rockBands) * s.rockDepth
		const ring = (p, level) => ({
			x: p.x + Math.sign(p.x) * (level / s.rockBands) * s.rockFlare,
			z: p.z + Math.sign(p.z) * (level / s.rockBands) * s.rockFlare,
		})
		for (let i = 0; i < outline.length; i++) {
			const a = ring(outline[i], band),
				b = ring(outline[(i + 1) % outline.length], band)
			const c = ring(outline[(i + 1) % outline.length], band + 1),
				d = ring(outline[i], band + 1)
			// Broad facets and a colder foot, not inked cracks or a repeating texture.
			tint.copy(light).lerp(dark, (band + 1) / (s.rockBands + 1))
			for (const [p, y] of [
				[a, top],
				[b, top],
				[c, bottom],
				[a, top],
				[c, bottom],
				[d, bottom],
			]) {
				if (finish)
					tint
						.copy(light)
						.lerp(dark, (s.groundY - y) / s.rockDepth)
						.multiplyScalar(1 - finish.rockGrain * (0.5 + 0.5 * Math.sin(i * 2.4)))
				vertex(p, y, tint)
			}
		}
	}
	if (isle) skin = createIsle(parent, s, extent, s.light.dir)
	else {
		const rim = new THREE.BufferGeometry()
		rim.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
		rim.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
		rim.computeVertexNormals()
		surface(rim, rock, `${name}-rock`, 0, 0, 0)
	}
	if (surround)
		surface(
			new THREE.PlaneGeometry(s.surroundSize, s.surroundSize).rotateX(-Math.PI / 2),
			surround,
			`${name}-surround`,
			0,
			-s.surroundDrop,
			0,
		)
	// The setting changes, never the stage. Quiet dunes below the same torn edge.
	if (background) {
		const geometry = new THREE.PlaneGeometry(
			s.surroundSize,
			s.surroundSize,
			background.segments,
			background.segments,
		).rotateX(-Math.PI / 2)
		const points = geometry.attributes.position
		const duneColors = []
		const low = new THREE.Color(background.colors.low)
		const high = new THREE.Color(background.colors.high)
		for (let i = 0; i < points.count; i++) {
			const x = points.getX(i),
				z = points.getZ(i)
			const phase = z / background.wavelength + background.bend * Math.sin(x / background.sweep)
			const wave = (1 + Math.sin(phase)) / 2
			const height = background.height * wave * wave
			points.setY(i, -s.surroundDrop + height)
			tint.copy(low).lerp(high, wave * background.contrast)
			duneColors.push(tint.r, tint.g, tint.b)
		}
		geometry.setAttribute('color', new THREE.Float32BufferAttribute(duneColors, 3))
		geometry.computeVertexNormals()
		surface(geometry, rock, `${name}-dunes`, 0, 0, 0)
	}
	const strokes = []
	const line = (width, length, x, z) =>
		strokes.push(
			new THREE.PlaneGeometry(width, length).rotateX(-Math.PI / 2).translate(x, s.chalkY, z),
		)
	for (const { width, length, x, z } of chalkLayout.lines) line(width, length, x, z)
	for (const { radius, x, z } of chalkLayout.circles)
		strokes.push(
			new THREE.RingGeometry(radius - s.chalkWidth, radius, s.chalkSegments)
				.rotateX(-Math.PI / 2)
				.translate(x, s.chalkY, z),
		)
	if (footprints)
		for (const point of [
			...layout.structures,
			...layout.posts.map((p) => ({ ...p, kind: 'post' })),
		]) {
			const radius = footprints.radii[point.kind]
			const geometry = own(
				new THREE.RingGeometry(radius - footprints.footprintWidth, radius, s.chalkSegments).rotateX(
					-Math.PI / 2,
				),
			)
			const footprint = new THREE.Mesh(geometry, chalk)
			footprint.name = `${name}-${point.kind}-footprint`
			footprint.position.set(point.x, footprints.layers.chalk, point.z)
			footprint.layers.set(FORWARD_LAYER)
			footprint.renderOrder = -3
			meshes.push(footprint)
		}
	if (fence) {
		const fences = createFences(extent, fence, s.groundY, `${name}-fences`, rockDepth)
		fences.traverse((object) => {
			if (object.geometry) own(object.geometry)
			if (object.material) own(object.material)
		})
		meshes.push(fences)
	}
	const marks = new THREE.Mesh(own(mergeGeometries(strokes)), chalk)
	for (const geometry of strokes) geometry.dispose()
	marks.name = `${name}-chalk`
	marks.layers.set(FORWARD_LAYER)
	marks.renderOrder = -3
	meshes.push(marks)
	parent.add(...meshes)
	const dispose = () => {
		for (const mesh of meshes) mesh.removeFromParent()
		for (const resource of owned) resource.dispose()
		skin?.dispose()
	}
	dispose.update = (dt) => skin?.update(dt)
	return dispose
}

// Andrew's monotone chain; the swept footprint of a box under a sun is their hull.
export function convexHull(points) {
	const sorted = [...points].sort((a, b) => a.x - b.x || a.z - b.z)
	const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x)
	const half = (list) => {
		const out = []
		for (const p of list) {
			while (out.length >= 2 && cross(out.at(-2), out.at(-1), p) <= 0) out.pop()
			out.push(p)
		}
		out.pop()
		return out
	}
	return [...half(sorted), ...half(sorted.reverse())]
}
