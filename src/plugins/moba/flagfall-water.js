import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { FORWARD_LAYER, makeStyleMaterial } from '../../core/stylepass.js'
import { floorOutline } from './lobby-floor.js'

// A neutral placeholder avoids a black flash; failed tiles leave the existing colour intact.
export function loadFlagfallTile(asset, anisotropy, own, mean = 1) {
	const white = document.createElement('canvas')
	white.width = white.height = Math.ceil(devicePixelRatio)
	const ctx = white.getContext('2d')
	ctx.fillStyle = new THREE.Color().setRGB(mean, mean, mean).getStyle()
	ctx.fillRect(0, 0, white.width, white.height)
	const texture = own(
		new THREE.TextureLoader().load(
			asset,
			// The placeholder fixed the GPU storage at its own size; free it so the full
			// tile allocates on next use (or stays freed if the map is already gone).
			(loaded) => loaded.dispose(),
			undefined,
			() => {
				/* The neutral placeholder is the fallback. */
			},
		),
	)
	texture.image = white
	texture.wrapS = texture.wrapT = THREE.RepeatWrapping
	texture.colorSpace = THREE.SRGBColorSpace
	texture.minFilter = THREE.LinearMipmapLinearFilter
	texture.magFilter = THREE.LinearFilter
	texture.generateMipmaps = true
	texture.anisotropy = anisotropy
	texture.needsUpdate = true
	return texture
}

// Fixed pools, created with the map and advanced by the interpolated presentation clock.
// No physics, timers, rAF loop or frame allocations; abort owns every GPU resource.
export function createFlagfallWater(parent, layout, terrain) {
	const s = layout.settings.water
	const scale = layout.settings.scale
	const group = new THREE.Group()
	group.name = 'flagfall-shallows'
	parent.add(group)
	const owned = new Set()
	const own = (resource) => {
		owned.add(resource)
		return resource
	}
	const y = -s.drop * scale
	const gap = s.layerGap * scale
	let time = 0
	let disposed = false
	const clock = { value: 0 }
	const detail = loadFlagfallTile(
		s.detailAsset,
		layout.settings.finish.anisotropy,
		own,
		s.detailMean,
	)
	const flat = (color, opacity = 1) =>
		own(
			new THREE.MeshBasicMaterial({
				color,
				transparent: opacity < 1,
				opacity,
				depthWrite: false,
				side: THREE.DoubleSide,
			}),
		)
	const add = (geometry, material, x, height, z, order = -5) => {
		const mesh = new THREE.Mesh(own(geometry), material)
		mesh.position.set(x, height, z)
		mesh.layers.set(FORWARD_LAYER)
		mesh.renderOrder = order
		group.add(mesh)
		return mesh
	}
	const ripple = (material) => {
		material.onBeforeCompile = (shader) => {
			shader.uniforms.waterTime = clock
			shader.uniforms.waterShimmer = { value: s.shimmer }
			shader.uniforms.waterLength = { value: s.rippleLength * scale }
			shader.uniforms.waterPeriod = { value: s.rippleTime }
			shader.uniforms.waterFeather = { value: s.feather }
			Object.assign(shader.uniforms, {
				waterDetail: { value: detail },
				waterDetailMetres: { value: s.detailMetres * scale },
				waterDetailStrength: { value: s.detailStrength },
				waterDetailMean: { value: s.detailMean },
				waterDetailSpeed: { value: s.detailSpeed },
				waterBounds: { value: new THREE.Vector2(layout.bounds.halfX, layout.bounds.halfZ) },
				waterHazeDistance: { value: s.hazeDistance * scale },
				waterHazeStrength: { value: s.hazeStrength },
			})
			shader.vertexShader =
				'varying vec2 waterPoint;\nvarying vec2 waterUV;\n' +
				shader.vertexShader.replace(
					'#include <begin_vertex>',
					'#include <begin_vertex>\nwaterPoint = (modelMatrix * vec4(position, 1.0)).xz;\nwaterUV = uv;',
				)
			shader.fragmentShader =
				`varying vec2 waterPoint;
varying vec2 waterUV;
uniform float waterTime, waterShimmer, waterLength, waterPeriod, waterFeather;
uniform sampler2D waterDetail;
uniform float waterDetailMetres, waterDetailStrength, waterDetailMean, waterDetailSpeed, waterHazeDistance, waterHazeStrength;
uniform vec2 waterBounds;
` +
				shader.fragmentShader.replace(
					'#include <color_fragment>',
					`#include <color_fragment>
float wave = sin(waterPoint.x / waterLength + sin(waterPoint.y / waterLength) + waterTime * 6.283185 / waterPeriod);
float glint = pow(0.5 + 0.5 * wave, 6.0);
diffuseColor.rgb *= 1.0 + waterShimmer * (glint - 0.3);
vec2 drift = vec2(waterTime * waterDetailSpeed, waterTime * waterDetailSpeed * 0.4);
float detail = dot(texture2D(waterDetail, (waterPoint + drift) / waterDetailMetres).rgb, vec3(0.2126, 0.7152, 0.0722)) / waterDetailMean;
diffuseColor.rgb *= clamp(1.0 + (detail - 1.0) * waterDetailStrength, 0.7, 1.0 + waterDetailStrength);
float distanceFromCourt = length(max(abs(waterPoint) - waterBounds, 0.0));
diffuseColor.rgb *= 1.0 - waterHazeStrength * smoothstep(0.0, waterHazeDistance, distanceFromCourt);
diffuseColor.a *= smoothstep(0.0, waterFeather, min(min(waterUV.x, 1.0-waterUV.x), min(waterUV.y, 1.0-waterUV.y)));`,
				)
		}
	}
	// The opaque plate already covers the inner sea. Don't run its detail shader
	// again underneath it; the distant fallback is a still, haze-darkened colour.
	const waterMaterial = flat(new THREE.Color(s.color).multiplyScalar(1 - s.hazeStrength))
	const waterGeometry = own(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2))
	const sea = add(waterGeometry, waterMaterial, 0, y, 0)
	sea.name = 'flagfall-water'
	sea.scale.set(s.fallbackSize * scale, 1, s.fallbackSize * scale)
	const depthMaterial = own(makeStyleMaterial('scenery', { flat: true }))
	const seaDepth = new THREE.Mesh(waterGeometry, depthMaterial)
	seaDepth.position.copy(sea.position)
	seaDepth.scale.copy(sea.scale)
	group.add(seaDepth)
	// A finite image sits over the fallback. Its native aspect controls height, never
	// the court's aspect. Matching ID depth keeps the court/units in front of the sea.
	if (s.asset) {
		const plateMaterial = flat('#ffffff')
		plateMaterial.transparent = true
		ripple(plateMaterial)
		const plate = add(waterGeometry, plateMaterial, 0, y + gap, 0)
		plate.name = 'flagfall-water-plate'
		plate.visible = false
		const texture = own(
			new THREE.TextureLoader().load(
				s.asset,
				(loaded) => {
					if (disposed) {
						loaded.dispose()
						return
					}
					plate.scale.set(
						s.width * scale,
						1,
						(s.width * scale * loaded.image.height) / loaded.image.width,
					)
					plateMaterial.map = loaded
					plateMaterial.needsUpdate = true
					plate.visible = true
				},
				undefined,
				() => {
					/* The flat sea remains visible if the plate cannot load. */
				},
			),
		)
		texture.colorSpace = THREE.SRGBColorSpace
		texture.anisotropy = layout.settings.finish.anisotropy
		texture.minFilter = THREE.LinearMipmapLinearFilter
	}
	const extent = {
		halfX: layout.bounds.halfX + terrain.margin + terrain.jag,
		halfZ: layout.bounds.halfZ + terrain.margin + terrain.jag,
		jag: terrain.jag,
		step: terrain.step,
		seed: terrain.seed,
	}
	const foam = []
	const strip = own(
		new THREE.PlaneGeometry(s.foamLength * scale, s.foamWidth * scale, s.segments, 1).rotateX(
			-Math.PI / 2,
		),
	)
	const positions = strip.attributes.position
	for (let i = 0; i < positions.count; i++)
		positions.setZ(i, positions.getZ(i) + Math.sin(positions.getX(i) / scale) * s.foamWidth * scale)
	for (let i = 0; i < s.foamCount; i++) {
		const side = i % 2 ? -1 : 1
		const x = (((i + 0.5) / s.foamCount) * 2 - 1) * extent.halfX
		const mesh = add(
			strip,
			flat(s.foamColor, s.foamOpacity),
			x,
			y + gap * 2,
			side * (extent.halfZ + s.foamOffset * scale),
			-4,
		)
		foam.push({ mesh, side, phase: i / s.foamCount, z: mesh.position.z })
	}
	const rings = []
	const outline = floorOutline(extent)
	const waterline = outline.map((p) => ({
		x: p.x + Math.sign(p.x) * terrain.rockFlare * Math.min(1, -y / terrain.rockDepth),
		z: p.z + Math.sign(p.z) * terrain.rockFlare * Math.min(1, -y / terrain.rockDepth),
	}))
	const perimeter = (width) => {
		const count = waterline.length
		// Mitred vertex normals, so neighbouring quads share an edge: no wedge gaps or
		// double-alpha overlaps fanning out from each bend of the rock.
		const normals = waterline.map((p, i) => {
			const a = waterline[(i + count - 1) % count],
				b = waterline[(i + 1) % count]
			const la = Math.hypot(p.x - a.x, p.z - a.z) || 1,
				lb = Math.hypot(b.x - p.x, b.z - p.z) || 1
			// Outward edge normals: the first edge runs east along the north shore.
			const nx = (p.z - a.z) / la + (b.z - p.z) / lb,
				nz = (a.x - p.x) / la + (p.x - b.x) / lb
			const length = Math.hypot(nx, nz) || 1
			const mitre = Math.min(2, 2 / length)
			return { x: (nx / length) * mitre * width, z: (nz / length) * mitre * width }
		})
		const vertices = [],
			uv = []
		for (let i = 0; i < count; i++) {
			const j = (i + 1) % count
			for (const [k, out] of [
				[i, 0],
				[j, 0],
				[j, 1],
				[i, 0],
				[j, 1],
				[i, 1],
			]) {
				const p = waterline[k]
				vertices.push(p.x + normals[k].x * out, 0, p.z + normals[k].z * out)
				uv.push(out, (k === i ? i : i + 1) / count)
			}
		}
		const geometry = new THREE.BufferGeometry()
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
		geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
		return geometry
	}
	for (const [width, opacity, height, reflection] of [
		[s.reflectionWidth, s.reflectionOpacity, gap * 2, true],
		[s.shoreWidth, s.shoreOpacity, gap * 3, false],
	]) {
		const material = flat(s.foamColor, opacity)
		material.onBeforeCompile = (shader) => {
			shader.uniforms.shoreTime = clock
			shader.uniforms.shorePeriod = { value: s.rippleTime }
			shader.uniforms.shoreBreak = { value: reflection ? 0 : s.shoreBreak }
			shader.vertexShader =
				'varying vec2 shoreUV;\n' +
				shader.vertexShader.replace(
					'#include <begin_vertex>',
					'#include <begin_vertex>\nshoreUV = uv;',
				)
			shader.fragmentShader =
				'varying vec2 shoreUV;\nuniform float shoreTime, shorePeriod, shoreBreak;\n' +
				shader.fragmentShader.replace(
					'#include <color_fragment>',
					`#include <color_fragment>
float drift = sin(shoreUV.y * 180.0 + shoreTime * 6.283185 / shorePeriod);
float glow = pow(1.0 - shoreUV.x, 2.0) * (0.8 + 0.2 * drift);
float wave = 0.5 + 0.5 * sin(shoreUV.y * 1700.0 + 4.0 * sin(shoreUV.y * 230.0) - shoreTime * 6.283185 / shorePeriod);
float foam = (1.0 - smoothstep(0.08, 0.4, shoreUV.x)) * (0.55 + 0.45 * wave) + 0.35 * glow;
diffuseColor.a *= mix(glow, foam, shoreBreak);`,
				)
		}
		add(perimeter(width * scale), material, 0, y + height, 0, -4).name = reflection
			? 'flagfall-court-reflection'
			: 'flagfall-shore-foam'
	}
	const ring = own(
		new THREE.RingGeometry(
			s.ringRadius - s.ringWidth,
			s.ringRadius,
			s.segments,
			1,
			0,
			Math.PI * 1.5,
		).rotateX(-Math.PI / 2),
	)
	for (let i = 0; i < s.ringCount; i++) {
		const point = outline[Math.floor((i / s.ringCount) * outline.length)]
		const mesh = add(
			ring,
			flat(s.foamColor, s.ringOpacity),
			point.x + Math.sign(point.x) * terrain.rockFlare,
			y + gap * 3,
			point.z + Math.sign(point.z) * terrain.rockFlare,
			-3,
		)
		mesh.rotation.y = (i * Math.PI) / 2
		rings.push({ mesh, phase: i / s.ringCount })
	}
	const pads = []
	const leafShape = new THREE.Shape()
	const radius = s.padRadius * scale
	leafShape.moveTo(0, 0)
	// A small botanical slit, not the missing quarter of a disc.
	for (let i = 0; i <= s.segments; i++) {
		const angle = s.padNotch / 2 + (i / s.segments) * (Math.PI * 2 - s.padNotch)
		leafShape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius * s.padAspect)
	}
	leafShape.closePath()
	const pad = own(new THREE.ShapeGeometry(leafShape).rotateX(-Math.PI / 2))
	const rim = own(
		new THREE.RingGeometry(
			radius - s.padRim * scale,
			radius,
			s.segments,
			1,
			s.padNotch / 2,
			Math.PI * 2 - s.padNotch,
		).rotateX(-Math.PI / 2),
	)
	const padMaterial = flat('#ffffff')
	padMaterial.vertexColors = true
	const paint = (geometry, color) => {
		const tint = new THREE.Color(color)
		const colors = new Float32Array(geometry.attributes.position.count * 3)
		for (let i = 0; i < colors.length; i += 3) tint.toArray(colors, i)
		geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
		return geometry
	}
	paint(pad, s.padColor)
	paint(rim, s.padRimColor).scale(1, 1, s.padAspect).translate(0, gap, 0)
	const veins = s.padVeinAngles.map((angle) =>
		own(
			new THREE.PlaneGeometry(s.padVeinWidth * scale, radius * s.padVeinReach)
				.rotateX(-Math.PI / 2)
				.translate(0, gap, (-radius * s.padVeinReach) / 2)
				.rotateY(angle),
		),
	)
	const petal = own(
		new THREE.CircleGeometry(s.flowerRadius * scale, s.segments).rotateX(-Math.PI / 2),
	)
	for (const vein of veins) paint(vein, s.padVeinColor)
	const flowers = []
	for (let j = 0; j < s.flowerPetals; j++) {
		const a = (j / s.flowerPetals) * Math.PI * 2
		flowers.push(
			own(
				paint(
					petal
						.clone()
						.scale(1, 1, s.padAspect)
						.translate(
							Math.cos(a) * s.flowerRadius * scale,
							gap * 2,
							Math.sin(a) * s.flowerRadius * scale,
						),
					s.flowerColor,
				),
			),
		)
	}
	const leaf = own(mergeGeometries([pad, rim, ...veins]))
	const floweringLeaf = own(mergeGeometries([pad, rim, ...veins, ...flowers]))
	for (let i = 0; i < s.padCount; i++) {
		const side = i % 2 ? -1 : 1
		const x = Math.sin(i * 2.4) * extent.halfX
		const z =
			side * (extent.halfZ + (s.padOffset + (0.5 + 0.5 * Math.sin(i * 1.7)) * s.padSpread) * scale)
		const mesh = add(
			i % s.flowerEvery === 0 ? floweringLeaf : leaf,
			padMaterial,
			x,
			y + gap * 4,
			z,
			-2,
		)
		mesh.rotation.y = i * 2.4
		pads.push(mesh)
	}
	// Small pooled clumps frame the plate. Every root and light is outside the court.
	const reedVertices = []
	for (let i = 0; i < s.reedCount; i++) {
		const side = i % 2 ? -1 : 1
		const rootX = Math.sin(i * 2.4) * extent.halfX
		const rootZ = side * (extent.halfZ + s.reedOffset * scale)
		for (let j = 0; j < s.reedBlades; j++) {
			const a = j * 2.4,
				spread = s.reedSpread * scale
			const x = rootX + Math.cos(a) * spread,
				z = rootZ + Math.sin(a) * spread
			const width = s.reedWidth * scale
			const height = s.reedHeight * scale * (0.6 + 0.4 * Math.sin(j + i) ** 2)
			reedVertices.push(
				x - width,
				y,
				z,
				x + width,
				y,
				z,
				x + Math.cos(a) * spread,
				y + height,
				z + Math.sin(a) * spread,
			)
		}
	}
	const reeds = new THREE.BufferGeometry()
	reeds.setAttribute('position', new THREE.Float32BufferAttribute(reedVertices, 3))
	add(reeds, flat(s.reedColor), 0, 0, 0, -1).name = 'flagfall-reeds'
	const lights = []
	const lightGeometry = own(new THREE.SphereGeometry(s.lightRadius * scale, 8, 4))
	const haloGeometry = own(
		new THREE.PlaneGeometry(s.lightHalo * scale, s.lightHalo * scale).rotateX(-Math.PI / 2),
	)
	const haloMaterial = flat(s.lightColor, s.lightOpacity)
	haloMaterial.onBeforeCompile = (shader) => {
		shader.vertexShader =
			'varying vec2 glowUV;\n' +
			shader.vertexShader.replace(
				'#include <begin_vertex>',
				'#include <begin_vertex>\nglowUV = uv;',
			)
		shader.fragmentShader =
			'varying vec2 glowUV;\n' +
			shader.fragmentShader.replace(
				'#include <color_fragment>',
				'#include <color_fragment>\ndiffuseColor.a *= exp(-20.0 * dot(glowUV-0.5, glowUV-0.5));',
			)
	}
	for (let i = 0; i < s.lightCount; i++) {
		const x = Math.sin(i * 2.4) * extent.halfX
		const z = (i % 2 ? -1 : 1) * (extent.halfZ + s.cloudOffset * scale)
		const mesh = add(
			lightGeometry,
			flat(s.lightColor, s.lightOpacity),
			x,
			y + s.lightHeight * scale,
			z,
			-1,
		)
		const halo = new THREE.Mesh(haloGeometry, haloMaterial)
		halo.layers.set(FORWARD_LAYER)
		halo.renderOrder = -1
		mesh.add(halo)
		lights.push({ mesh, x, z })
	}
	const clouds = []
	if (s.clouds) {
		const cloudMaterial = flat(s.cloudColor, s.cloudOpacity)
		cloudMaterial.onBeforeCompile = (shader) => {
			shader.vertexShader =
				'varying vec2 cloudUV;\n' +
				shader.vertexShader.replace(
					'#include <begin_vertex>',
					'#include <begin_vertex>\ncloudUV = uv;',
				)
			shader.fragmentShader =
				'varying vec2 cloudUV;\n' +
				shader.fragmentShader.replace(
					'#include <color_fragment>',
					`#include <color_fragment>
vec2 p = cloudUV * 2.0 - 1.0;
float wisp = exp(-5.0 * p.x * p.x - 12.0 * pow(p.y + 0.2 * sin(p.x * 4.0), 2.0));
diffuseColor.a *= wisp;`,
				)
		}
		const cloudGeometry = own(
			new THREE.PlaneGeometry(s.cloudLength * scale, s.cloudWidth * scale).rotateX(-Math.PI / 2),
		)
		for (let i = 0; i < s.cloudCount; i++) {
			const mesh = add(
				cloudGeometry,
				cloudMaterial,
				Math.cos(i * 2.4) * extent.halfX,
				y + gap * 5,
				(i % 2 ? -1 : 1) * (extent.halfZ + s.cloudOffset * scale),
				-1,
			)
			clouds.push({ mesh, x: mesh.position.x, phase: i / s.cloudCount })
		}
	}
	const update = (dt) => {
		time += dt
		const t = time
		clock.value = t
		for (let i = 0; i < foam.length; i++) {
			const slot = foam[i]
			const phase = (t / s.foamTime + slot.phase) % 1
			slot.mesh.position.z = slot.z + slot.side * phase * s.foamTravel * scale
			slot.mesh.material.opacity = s.foamOpacity * Math.sin(phase * Math.PI) ** 2
		}
		for (let i = 0; i < rings.length; i++) {
			const slot = rings[i]
			const phase = (t / s.ringTime + slot.phase) % 1
			slot.mesh.scale.setScalar(scale * (1 + phase * s.ringGrow))
			slot.mesh.material.opacity = s.ringOpacity * Math.sin(phase * Math.PI) ** 2
		}
		for (let i = 0; i < pads.length; i++)
			pads[i].position.y =
				y + gap * 4 + Math.sin((t * Math.PI * 2) / s.padTime + i) * s.padBob * scale
		for (let i = 0; i < lights.length; i++) {
			const slot = lights[i]
			const phase = (t * Math.PI * 2) / s.lightTime + i
			slot.mesh.position.x = slot.x + Math.sin(phase) * s.lightTravel * scale
			slot.mesh.position.z = slot.z + Math.cos(phase) * s.lightTravel * scale
			slot.mesh.material.opacity = s.lightOpacity * (0.7 + 0.3 * Math.sin(phase))
		}
		for (let i = 0; i < clouds.length; i++) {
			const slot = clouds[i]
			slot.mesh.position.x =
				slot.x +
				Math.sin((t * Math.PI * 2) / s.cloudTime + slot.phase * Math.PI * 2) * s.cloudTravel * scale
		}
	}
	update(0)
	return {
		update,
		dispose() {
			disposed = true
			group.removeFromParent()
			for (const resource of owned) resource.dispose()
		},
	}
}
