import * as THREE from 'three'
import { FORWARD_LAYER } from '../../core/stylepass.js'

// Painted decals scattered over a court: cracks, inlays, moss, petals. One sheet of `grid` × `grid`
// cells with alpha (public/art/<map>-decals.webp), drawn as one instanced quad per decal just above the floor print and
// under every mark. Seeded, so every client lays the same floor. Presentation only.
//
//   decals: { image, grid, count, size: [min, max], strength, mute, seed, clear, skip }
//   mute: 0–1 pull toward grey so a decal's wash sits in the court; skip: cells never used (anything
//   that could read as a telegraph, arrow or ring)
//   clear: margin in metres kept free around every box and pillar
export function createFloorDecals({ decals, layout, groundY, own }) {
	if (!decals?.image || typeof document === 'undefined') return null
	const material = own(
		new THREE.ShaderMaterial({
			uniforms: {
				tSheet: { value: null },
				uGrid: { value: decals.grid },
				uStrength: { value: decals.strength },
				uMute: { value: decals.mute ?? 0 },
			},
			vertexShader: /* glsl */ `
attribute vec2 cell;
varying vec2 vUv;
varying vec2 vCell;
void main() {
	vUv = uv;
	vCell = cell;
	gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
}`,
			fragmentShader: /* glsl */ `
uniform sampler2D tSheet;
uniform float uGrid, uStrength, uMute;
varying vec2 vUv;
varying vec2 vCell;
void main() {
	// Cells count from the sheet's top-left; texture v runs bottom-up.
	vec2 at = vec2(vCell.x + vUv.x, uGrid - vCell.y - 1.0 + vUv.y) / uGrid;
	vec4 t = texture2D(tSheet, at);
	vec3 c = mix(t.rgb, vec3(dot(t.rgb, vec3(0.2126, 0.7152, 0.0722))), uMute);
	float key = t.a;
	// Fade the cell's border so no square edge ever shows.
	vec2 e = min(vUv, 1.0 - vUv);
	float edge = smoothstep(0.0, 0.12, min(e.x, e.y));
	float a = key * edge * uStrength;
	if (a < 0.01) discard;
	gl_FragColor = vec4(c, a);
}`,
			transparent: true,
			depthWrite: false,
		}),
	)
	new THREE.TextureLoader().load(
		decals.image,
		(texture) => {
			own(texture)
			texture.colorSpace = THREE.SRGBColorSpace
			texture.anisotropy = 4
			material.uniforms.tSheet.value = texture
			mesh.visible = true
		},
		undefined,
		() => console.warn(`floor-decals: no image at ${decals.image}`),
	)

	let state = decals.seed >>> 0 || 1
	const rand = () => {
		state = (state * 1664525 + 1013904223) >>> 0
		return state / 4294967296
	}
	const bounds = layout.bounds
	const clear = decals.clear ?? 0.6
	const blocked = (x, z, r) =>
		layout.boxes.some(
			(b) => Math.abs(x - b.x) < b.halfX + r + clear && Math.abs(z - b.z) < b.halfZ + r + clear,
		) ||
		layout.pillars.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + r + clear) ||
		// Structures (towers, the core) stand on plinths about 3 m across.
		(layout.structures ?? []).some((s) => Math.hypot(x - s.x, z - s.z) < 3 + r + clear)

	const skip = new Set(decals.skip ?? [])
	const cells = [...Array(decals.grid * decals.grid).keys()].filter((c) => !skip.has(c))
	const picks = []
	for (let tries = 0; picks.length < decals.count && tries < decals.count * 20; tries++) {
		const size = decals.size[0] + rand() * (decals.size[1] - decals.size[0])
		const x = (rand() * 2 - 1) * (bounds.halfX - size / 2)
		const z = (rand() * 2 - 1) * (bounds.halfZ - size / 2)
		if (blocked(x, z, size * 0.35)) continue
		if (picks.some((p) => Math.hypot(p.x - x, p.z - z) < (p.size + size) * 0.4)) continue
		picks.push({
			x,
			z,
			size,
			turn: rand() * Math.PI * 2,
			cell: cells[Math.floor(rand() * cells.length)],
		})
	}

	const geometry = own(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2))
	const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, picks.length))
	const cell = new Float32Array(Math.max(1, picks.length) * 2)
	const m = new THREE.Matrix4(),
		q = new THREE.Quaternion(),
		up = new THREE.Vector3(0, 1, 0)
	picks.forEach((p, i) => {
		q.setFromAxisAngle(up, p.turn)
		m.compose(new THREE.Vector3(p.x, groundY + 0.006, p.z), q, new THREE.Vector3(p.size, 1, p.size))
		mesh.setMatrixAt(i, m)
		cell[i * 2] = p.cell % decals.grid
		cell[i * 2 + 1] = Math.floor(p.cell / decals.grid)
	})
	mesh.count = picks.length
	geometry.setAttribute('cell', new THREE.InstancedBufferAttribute(cell, 2))
	mesh.layers.set(FORWARD_LAYER)
	mesh.renderOrder = -3.4 // over the floor print (-3.5), under every mark
	mesh.frustumCulled = false
	mesh.visible = false // until the sheet arrives
	mesh.name = 'floor-decals'
	return mesh
}
