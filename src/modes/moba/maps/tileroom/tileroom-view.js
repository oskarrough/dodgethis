import * as THREE from 'three'
import { FORWARD_LAYER } from '../../../../core/stylepass.js'
import { tune } from '../../tune.js'
import { castShadows, createMatchTerrain } from '../../match-terrain.js'

// The tile room's ground: Overthrow's isle, with six floor swatches printed over its court.
// Every swatch is one shader with a different pattern; all share the contact darkening at
// the foot of cover, the baked sun shadow and the drifting cloud shadows.
const STYLES = { print: 0, slabs: 1, flags: 2, bricks: 3, sand: 4, dial: 5 }

const floorChunk = /* glsl */ `
uniform int floorStyle;
uniform vec3 floorBase, floorJoint, floorAccent;
uniform float floorSize, floorVary, floorBorder, floorTime;
uniform vec2 floorCentre, floorHalf, floorExtent;
uniform sampler2D floorShadowPrint, floorContactPrint;
uniform float floorShadowOn, floorShadowStrength, floorContactStrength;
uniform vec3 floorShadowColour;
uniform vec3 floorClouds; // scale, speed, strength
varying vec2 floorPoint;

float fHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 fHash2(vec2 p) {
	return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}
float fNoise(vec2 p) {
	vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(fHash(i), fHash(i + vec2(1, 0)), f.x), mix(fHash(i + vec2(0, 1)), fHash(i + vec2(1, 1)), f.x), f.y);
}
float fFbm(vec2 p) {
	float v = 0.0, a = 0.5;
	for (int i = 0; i < 4; i++) { v += a * fNoise(p); p = p * 2.03 + 7.1; a *= 0.5; }
	return v;
}
// Soft joint: 1 on the joint line, 0 inside the stone.
float fJoint(float d, float width) { return 1.0 - smoothstep(width * 0.5, width * 1.6, d); }

// Returns (joint, per-stone value) for a grid of slabs of the given size; rows may stagger.
vec2 fGrid(vec2 p, vec2 size, float stagger, float chip) {
	float row = floor(p.y / size.y);
	p.x += stagger * mod(row, 2.0) * size.x;
	vec2 cell = floor(p / size);
	vec2 f = fract(p / size) * size;
	vec2 d = min(f, size - f);
	float edge = min(d.x, d.y);
	// Chipped corners: a few corners lose a bite.
	float bite = chip * fHash(cell + 3.7);
	float corner = length(d) - bite;
	float joint = max(fJoint(edge, 0.05), fJoint(corner, 0.06));
	return vec2(joint, fHash(cell));
}

// Irregular flagstones: Voronoi cells with a soft joint along their borders.
vec2 fFlags(vec2 p, float size) {
	p /= size;
	vec2 i = floor(p), f = fract(p);
	float d1 = 8.0, d2 = 8.0;
	vec2 id = vec2(0);
	for (int y = -1; y <= 1; y++)
		for (int x = -1; x <= 1; x++) {
			vec2 o = vec2(x, y);
			vec2 c = o + 0.15 + 0.7 * fHash2(i + o) - f;
			float d = dot(c, c);
			if (d < d1) { d2 = d1; d1 = d; id = i + o; }
			else if (d < d2) d2 = d;
		}
	float gap = (sqrt(d2) - sqrt(d1)) * size;
	return vec2(fJoint(gap, 0.07), fHash(id));
}

vec3 fFloor(vec2 p) {
	vec3 col = floorBase;
	if (floorStyle == 0) {
		// Today: one flat colour with broad, barely-visible patches.
		col *= 1.0 - floorVary * fNoise(p / floorSize);
	} else if (floorStyle == 1) {
		vec2 g = fGrid(p, vec2(floorSize), 0.0, 0.18);
		col = mix(floorBase, floorAccent, fHash(vec2(g.y, 1.0)) > 0.8 ? 0.6 : 0.0);
		col *= 1.0 + floorVary * (g.y - 0.5) * 2.0;
		col *= 1.0 - 0.03 * fFbm(p * 1.3);
		col = mix(col, floorJoint, g.x * 0.85);
	} else if (floorStyle == 2) {
		vec2 g = fFlags(p, floorSize);
		col = mix(floorBase, floorAccent, smoothstep(0.55, 0.95, g.y) * 0.7);
		col *= 1.0 + floorVary * (g.y - 0.5) * 2.0;
		col *= 1.0 - 0.05 * fFbm(p * 2.1);
		col = mix(col, floorJoint, g.x * 0.85);
	} else if (floorStyle == 3) {
		// Long pavers in running bond, laid across the court.
		vec2 g = fGrid(p, vec2(floorSize * 2.2, floorSize), 0.5, 0.07);
		col = mix(floorBase, floorAccent, step(0.7, g.y) * 0.7);
		col *= 1.0 + floorVary * (g.y - 0.5) * 2.0;
		col = mix(col, floorJoint, g.x * 0.8);
	} else if (floorStyle == 4) {
		// Sand: low dunes, fine wind ripples, a few buried slabs breaking through.
		float dune = fFbm(p * 0.12);
		vec2 wind = normalize(vec2(0.8, 0.35));
		float along = dot(p, wind) * 6.0 / floorSize + fFbm(p * 0.35) * 6.0;
		float ripple = smoothstep(0.75, 1.0, sin(along) * 0.5 + 0.5);
		col = mix(floorBase, floorAccent, smoothstep(0.45, 0.75, dune) * 0.8);
		col = mix(col, floorJoint, ripple * 0.35 * (0.4 + dune));
		vec2 g = fGrid(p + 40.0, vec2(1.7), 0.5, 0.25);
		float buried = step(0.82, g.y) * smoothstep(0.62, 0.42, fFbm(p * 0.5 + 5.0));
		col = mix(col, mix(vec3(0.76, 0.66, 0.55), floorJoint, g.x), buried * 0.8);
	} else {
		// An arena inlay: Gnomon's sundial in darker stone, set in a field of slabs.
		vec2 g = fGrid(p, vec2(floorSize), 0.0, 0.18);
		col *= 1.0 + floorVary * (g.y - 0.5) * 2.0;
		col = mix(col, floorJoint, g.x * 0.8);
		vec2 q = p - floorCentre;
		float r = length(q);
		float a = atan(q.y, q.x);
		float outer = 5.6, inner = 1.2;
		float ring = smoothstep(0.09, 0.0, abs(r - outer) - 0.18) + smoothstep(0.06, 0.0, abs(r - outer + 0.7) - 0.05);
		float step15 = 3.14159265 / 12.0;
		float hour = abs(mod(a + step15 * 0.5, step15) - step15 * 0.5) * r;
		float lines = smoothstep(0.07, 0.0, hour - 0.05) * step(inner, r) * step(r, outer - 0.7);
		float pin = smoothstep(0.08, 0.0, r - inner) ;
		float inlay = clamp(ring + lines + pin, 0.0, 1.0);
		col = mix(col, floorAccent, inlay * 0.85);
	}
	return col;
}

void fShade(inout vec3 col, vec2 p) {
	vec2 uv = vec2(0.5) + vec2(p.x, -p.y) / (floorExtent * 2.0);
	// Contact: soft darkening where cover meets the floor.
	float contact = 1.0 - texture2D(floorContactPrint, uv).r;
	col *= 1.0 - floorContactStrength * contact;
	if (floorShadowOn > 0.5) {
		float shaded = 1.0 - texture2D(floorShadowPrint, uv).r;
		col = mix(col, floorShadowColour, shaded * floorShadowStrength);
	}
	// Cloud shadows drift slowly across everything.
	vec2 drift = vec2(1.0, 0.4) * floorTime * floorClouds.y;
	float cloud = smoothstep(0.5, 0.7, fFbm((p - drift) / floorClouds.x));
	col *= 1.0 - floorClouds.z * cloud;
	// A worn kerb around the swatch.
	vec2 e = floorHalf - abs(p - floorCentre);
	col = mix(col, floorJoint * 0.92, 1.0 - smoothstep(floorBorder * 0.6, floorBorder, min(e.x, e.y)));
}
`

export function ground(scope) {
	const { layout, terrain, m, group, chalkLayout, owned, isleScenery } = scope
	const s = tune.tileroom
	const casts = { hedge: m.hedgeHeight, wall: m.wallHeight, pillar: m.pillarHeight + m.capHeight }
	const unterrain = createMatchTerrain(group, layout, terrain, chalkLayout, {
		scenery: isleScenery,
		casts,
	})
	// The same extent and mapping as the court's own shadow print, so the two line up.
	const extent = {
		halfX: layout.bounds.halfX + terrain.margin + terrain.jag,
		halfZ: layout.bounds.halfZ + terrain.margin + terrain.jag,
	}
	const own = (resource) => {
		owned.push(resource)
		return resource
	}
	const shadowPrint = castShadows({ layout, s: terrain, extent, casts, own })
	const contactPrint = contact(layout, extent, s.contact.reach, own)
	const time = { value: 0 }
	for (const w of s.swatches) {
		const material = own(new THREE.MeshBasicMaterial({ color: '#ffffff', depthWrite: false }))
		material.customProgramCacheKey = () => 'tileroom-floor'
		material.onBeforeCompile = (shader) => {
			Object.assign(shader.uniforms, {
				floorStyle: { value: STYLES[w.style] },
				floorBase: { value: new THREE.Color(w.base) },
				floorJoint: { value: new THREE.Color(w.joint) },
				floorAccent: { value: new THREE.Color(w.accent) },
				floorSize: { value: w.size },
				floorVary: { value: w.vary },
				floorBorder: { value: s.border },
				floorTime: time,
				floorCentre: { value: new THREE.Vector2(w.x, w.z) },
				floorHalf: { value: new THREE.Vector2(s.swatchHalfX, s.swatchHalfZ) },
				floorExtent: { value: new THREE.Vector2(extent.halfX, extent.halfZ) },
				floorShadowPrint: { value: shadowPrint },
				floorShadowOn: { value: shadowPrint ? 1 : 0 },
				floorShadowStrength: { value: s.shadow },
				floorShadowColour: { value: new THREE.Color(terrain.light.shadow) },
				floorContactPrint: { value: contactPrint },
				floorContactStrength: { value: contactPrint ? s.contact.strength : 0 },
				floorClouds: {
					value: new THREE.Vector3(s.clouds.scale, s.clouds.speed, s.clouds.strength),
				},
			})
			shader.vertexShader =
				'varying vec2 floorPoint;\n' +
				shader.vertexShader.replace(
					'#include <begin_vertex>',
					'#include <begin_vertex>\nfloorPoint = (modelMatrix * vec4(position, 1.0)).xz;',
				)
			shader.fragmentShader =
				floorChunk +
				shader.fragmentShader.replace(
					'#include <color_fragment>',
					'#include <color_fragment>\nvec3 floorColour = fFloor(floorPoint);\nfShade(floorColour, floorPoint);\ndiffuseColor.rgb = floorColour;',
				)
		}
		const sheet = new THREE.Mesh(
			own(new THREE.PlaneGeometry(s.swatchHalfX * 2, s.swatchHalfZ * 2).rotateX(-Math.PI / 2)),
			material,
		)
		sheet.position.set(w.x, terrain.groundY + 0.004, w.z)
		sheet.layers.set(FORWARD_LAYER)
		sheet.renderOrder = -3.5
		sheet.name = `tileroom-${w.style}`
		group.add(sheet)
		const tag = label(w.name, s.label.height, own)
		if (tag) {
			tag.position.set(w.x, terrain.groundY + 0.008, w.z + Math.sign(w.z) * s.label.z)
			group.add(tag)
		}
	}
	const dispose = () => unterrain?.()
	dispose.update = (dt) => {
		time.value += dt
		unterrain?.update?.(dt)
	}
	return dispose
}

// A blurred print of every box and pillar footprint: white floor, dark where cover stands.
function contact(layout, extent, reach, own) {
	if (typeof document === 'undefined') return null
	const ppm = 16
	const canvas = document.createElement('canvas')
	canvas.width = Math.ceil(extent.halfX * 2 * ppm)
	canvas.height = Math.ceil(extent.halfZ * 2 * ppm)
	const ctx = canvas.getContext('2d')
	ctx.fillStyle = '#fff'
	ctx.fillRect(0, 0, canvas.width, canvas.height)
	const px = (x) => ((x + extent.halfX) / (2 * extent.halfX)) * canvas.width
	const pz = (z) => ((z + extent.halfZ) / (2 * extent.halfZ)) * canvas.height
	ctx.filter = `blur(${reach * ppm * 0.6}px)`
	ctx.fillStyle = '#000'
	const grow = reach * 0.35
	for (const b of layout.boxes)
		ctx.fillRect(
			px(b.x - b.halfX - grow),
			pz(b.z - b.halfZ - grow),
			(b.halfX + grow) * 2 * ppm,
			(b.halfZ + grow) * 2 * ppm,
		)
	for (const p of layout.pillars) {
		ctx.beginPath()
		ctx.arc(px(p.x), pz(p.z), (p.r + grow) * ppm, 0, Math.PI * 2)
		ctx.fill()
	}
	const texture = own(new THREE.CanvasTexture(canvas))
	return texture
}

// The swatch's name, inked on the floor in front of it. A lab, so words are allowed here.
function label(text, height, own) {
	if (typeof document === 'undefined') return null
	const canvas = document.createElement('canvas')
	canvas.width = 1024
	canvas.height = 128
	const ctx = canvas.getContext('2d')
	ctx.font = '800 84px Sniglet, Josefin Sans, sans-serif'
	ctx.fillStyle = '#26445f'
	ctx.textAlign = 'center'
	ctx.textBaseline = 'middle'
	ctx.fillText(text, 512, 68)
	const texture = own(new THREE.CanvasTexture(canvas))
	texture.colorSpace = THREE.SRGBColorSpace
	const material = own(
		new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
	)
	const mesh = new THREE.Mesh(
		own(new THREE.PlaneGeometry(height * 8, height).rotateX(-Math.PI / 2)),
		material,
	)
	mesh.layers.set(FORWARD_LAYER)
	mesh.renderOrder = -3.2
	return mesh
}
