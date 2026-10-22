import * as THREE from 'three'
import { HAZE, NOISE } from '../../isle.js'

// Daylight waterfalls use the shared cliff's rings and resource ownership.
export function scenery({ s, own, forward, shared, outline, outward, count, rings, points }) {
	const c = s.colors
	const color = (hex) => new THREE.Color(hex)
	// --- Waterfalls: white ribbons draped down the cliff, streaks running down. ---
	const fall = own(
		new THREE.ShaderMaterial({
			uniforms: {
				...shared,
				uWater: { value: color(c.water) },
				uWaterShade: { value: color(c.waterShade) },
				uFallSpeed: { value: s.fallSpeed },
			},
			vertexShader: /* glsl */ `
varying vec3 vWorld;
varying vec2 vFall;
void main() {
	vec4 world = modelMatrix * vec4(position, 1.0);
	vWorld = world.xyz;
	vFall = uv;
	gl_Position = projectionMatrix * viewMatrix * world;
}`,
			fragmentShader: /* glsl */ `
${HAZE}
${NOISE}
uniform vec3 uWater, uWaterShade;
uniform float uTime, uFallSpeed;
varying vec2 vFall; // x across 0..1, y metres fallen
void main() {
	float streak = isleNoise(vec2(vFall.x * 7.0, (vFall.y - uTime * uFallSpeed) * 0.18));
	float edge = smoothstep(0.0, 0.18, vFall.x) * smoothstep(1.0, 0.82, vFall.x);
	vec3 col = streak * edge > 0.42 ? uWater : uWaterShade;
	gl_FragColor = vec4(isleHaze(col), 1.0);
}`,
		}),
	)
	for (const spot of s.falls) {
		// The rim segment nearest the spot; the ribbon follows that facet's columns down.
		let best = 0
		for (let i = 0; i < count; i++)
			if (
				Math.hypot(outline[i].x - spot.x, outline[i].z - spot.z) <
				Math.hypot(outline[best].x - spot.x, outline[best].z - spot.z)
			)
				best = i
		const j = (best + 1) % count
		const segment = Math.hypot(outline[j].x - outline[best].x, outline[j].z - outline[best].z)
		const half = Math.min(0.45, spot.width / 2 / Math.max(0.1, segment))
		const ribbon = [],
			uvs = [],
			index = []
		const lift = 0.12
		for (let k = 0; k < rings.length; k++) {
			const a = points[k][best],
				b = points[k][j]
			const ox = (outward[best].x + outward[j].x) * 0.5 * lift,
				oz = (outward[best].z + outward[j].z) * 0.5 * lift
			for (const u of [0.5 - half, 0.5 + half]) {
				ribbon.push(a.x + (b.x - a.x) * u + ox, a.y + 0.02, a.z + (b.z - a.z) * u + oz)
				uvs.push(u < 0.5 ? 0 : 1, rings[k].drop)
			}
			if (k) index.push(2 * k - 2, 2 * k - 1, 2 * k + 1, 2 * k - 2, 2 * k + 1, 2 * k)
		}
		const geometry = own(new THREE.BufferGeometry())
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(ribbon, 3))
		geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
		geometry.setIndex(index)
		fall.side = THREE.DoubleSide
		forward(new THREE.Mesh(geometry, fall), 'overthrow-waterfall')
	}
}
