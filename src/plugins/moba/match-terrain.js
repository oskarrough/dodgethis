import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { FORWARD_LAYER, makeStyleMaterial } from '../../core/stylepass.js'
import { createFences, floorOutline, floorShape } from './lobby-floor.js'

// A presentation skin, never a source of walking bounds or colliders. The torn edge sits
// outside the entire playable rectangle even at the extremes of the restart controls.
export function createMatchTerrain(
	parent,
	layout,
	s,
	chalkLayout,
	{ background, fence, footprints } = {},
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
	const owned = new Set()
	const own = (resource) => {
		owned.add(resource)
		return resource
	}
	const flat = (color) =>
		own(new THREE.MeshBasicMaterial({ color, depthWrite: false, side: THREE.DoubleSide }))
	const ground = flat(s.colors.tarmac)
	// Broad, barely-visible tarmac patches, not texture detail or busy cracks.
	ground.onBeforeCompile = (shader) => {
		shader.uniforms.courtScale = { value: s.patchScale }
		shader.uniforms.courtContrast = { value: s.patchContrast }
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
				'#include <color_fragment>\ndiffuseColor.rgb *= 1.0 - courtContrast * courtPatch(courtPoint / courtScale);',
			)
	}
	const chalk = flat(s.colors.chalk)
	const rock = own(
		new THREE.MeshBasicMaterial({ vertexColors: true, depthWrite: false, side: THREE.DoubleSide }),
	)
	const surround = flat(background?.colors.surround ?? s.colors.surround)
	const mesa = flat(s.colors.mesa)
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
	for (const material of [ground, rock, surround, mesa]) {
		material.polygonOffset = true
		material.polygonOffsetFactor = -1
		material.polygonOffsetUnits = -4
	}
	surface(floorShape(extent), ground, `${name}-tarmac`, 0, s.groundY, 0, depth)
	const outline = floorOutline(extent)
	const positions = [],
		colors = []
	const light = new THREE.Color(s.colors.rock)
	const dark = new THREE.Color(s.colors.rockDark)
	const tint = new THREE.Color()
	const vertex = (p, y, color) => {
		positions.push(p.x, y, p.z)
		colors.push(color.r, color.g, color.b)
	}
	for (let band = 0; band < s.rockBands; band++) {
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
			])
				vertex(p, y, tint)
		}
	}
	const rim = new THREE.BufferGeometry()
	rim.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
	rim.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
	rim.computeVertexNormals()
	surface(rim, rock, `${name}-rock`, 0, 0, 0)
	surface(
		new THREE.PlaneGeometry(s.surroundSize, s.surroundSize).rotateX(-Math.PI / 2),
		surround,
		`${name}-surround`,
		0,
		-s.surroundDrop,
		0,
	)
	// The setting changes, never the stage. Quiet dunes or mesas below the same torn edge.
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
	} else {
		const mesas = []
		for (let row = 1; row <= s.mesaRows; row++) {
			for (
				let x = -bounds.halfX - s.mesaSpacing;
				x <= bounds.halfX + s.mesaSpacing;
				x += s.mesaSpacing
			) {
				for (const side of [-1, 1]) {
					const height = s.mesaHeight * (1 + Math.sin(x + row) * s.mesaVariation)
					mesas.push(
						new THREE.CylinderGeometry(
							s.mesaRadius,
							s.mesaRadius * s.mesaTaper,
							height,
							s.mesaSegments,
						).translate(
							x + Math.sin(row) * s.mesaRadius,
							-s.surroundDrop + height / 2,
							side * (extent.halfZ + row * s.mesaSpacing),
						),
					)
				}
			}
		}
		surface(mergeGeometries(mesas), mesa, `${name}-mesas`, 0, 0, 0)
		for (const geometry of mesas) geometry.dispose()
	}
	const strokes = []
	const line = (width, length, x, z) =>
		strokes.push(
			new THREE.PlaneGeometry(width, length).rotateX(-Math.PI / 2).translate(x, s.chalkY, z),
		)
	// Every map authors court marks, not a second ground renderer.
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
	return () => {
		for (const mesh of meshes) mesh.removeFromParent()
		for (const resource of owned) resource.dispose()
	}
}
