import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { FORWARD_LAYER, makeStyleMaterial } from '../../core/stylepass.js'
import { floorShape } from './lobby-floor.js'
import { createIsle } from './isle.js'

// A presentation skin, never a source of walking bounds or colliders. The torn edge sits
// outside the entire playable rectangle even at the extremes of the restart controls.
// Both maps top a stone isle over cloud (isle.js): Overthrow by day, Flagfall by night.
export function createMatchTerrain(
	parent,
	layout,
	s,
	chalkLayout,
	{ footprints, casts = null, shadows = null, scenery = null } = {},
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
	// The renderer survives map switches; closure contents aren't in Three's default
	// program key, so never reuse Flagfall's shader for Overthrow (or vice versa).
	ground.customProgramCacheKey = () => (s.pool ? 'night-court' : 'overthrow-court')
	const shadowPrint = shadows?.({ layout, s, extent, casts, own }) ?? null
	// Broad, barely-visible tarmac patches, not texture detail or busy cracks.
	ground.onBeforeCompile = (shader) => {
		shader.uniforms.courtScale = { value: s.patchScale }
		shader.uniforms.courtContrast = { value: s.patchContrast }
		Object.assign(shader.uniforms, {
			courtEdge: { value: new THREE.Vector2(extent.halfX, extent.halfZ) },
			courtMoss: { value: new THREE.Color(s.colors.moss) },
			courtLip: { value: new THREE.Vector2(s.cliff.lipMin, Math.min(s.cliff.lipMax, s.margin)) },
			courtShadow: { value: new THREE.Color(s.light.shadow) },
			courtShadowPrint: { value: shadowPrint },
			courtShadowOn: { value: shadowPrint ? 1 : 0 },
			courtShadowStrength: { value: s.light.shadowStrength },
			courtPool: { value: new THREE.Vector2(s.pool?.strength ?? 0, s.pool?.spread ?? 1) },
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
// A broken moss lip inside the torn rim, never past the margin into the walkable court.
vec2 edge = courtEdge - abs(courtPoint);
float rim = min(edge.x, edge.y);
float along = courtPoint.x + courtPoint.y * 1.37;
float lip = mix(courtLip.x, courtLip.y, 0.6 * courtPatch(vec2(along * 1.9, 3.0)) + 0.4 * courtPatch(vec2(along * 5.3, 9.0)));
diffuseColor.rgb = mix(diffuseColor.rgb, courtMoss, step(rim, lip));
if (courtShadowOn > 0.5) {
	float shaded = 1.0 - texture2D(courtShadowPrint, vec2(0.5) + vec2(courtPoint.x, -courtPoint.y) / (courtEdge * 2.0)).r;
	diffuseColor.rgb = mix(diffuseColor.rgb, courtShadow.rgb, shaded * courtShadowStrength);
}${
					s.pool
						? `
// A soft pool of moonlight: full in the middle, falling off toward the rim.
vec2 poolAt = courtPoint / (courtEdge * courtPool.y);
diffuseColor.rgb *= 1.0 - courtPool.x * (1.0 - exp(-dot(poolAt, poolAt) * 1.6));`
						: ''
				}
`,
			)
		shader.fragmentShader =
			'uniform vec2 courtEdge, courtLip, courtPool;\nuniform vec3 courtMoss, courtShadow;\nuniform sampler2D courtShadowPrint;\nuniform float courtShadowOn, courtShadowStrength;\n' +
			shader.fragmentShader
	}
	const chalk = flat(s.colors.chalk)
	ground.polygonOffset = true
	ground.polygonOffsetFactor = -1
	ground.polygonOffsetUnits = -4
	// Visible and opaque depth meshes share the exact geometry and transform. Pull only
	// the forward colour a fraction toward the camera; never replace unit/effect depth.
	const geometry = own(floorShape(extent))
	const opaque = new THREE.Mesh(geometry, own(makeStyleMaterial('cream', { flat: true })))
	opaque.position.y = s.groundY
	const sheet = new THREE.Mesh(geometry, ground)
	sheet.name = `${name}-tarmac`
	sheet.position.y = s.groundY
	sheet.layers.set(FORWARD_LAYER)
	sheet.renderOrder = -4
	meshes.push(opaque, sheet)
	const skin = createIsle(parent, s, extent, s.light.dir, scenery)
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
