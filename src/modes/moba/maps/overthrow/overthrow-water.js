import * as THREE from 'three'
import { HAZE, NOISE } from '../../isle.js'
import { bind, paint } from '../../restyle.js'

// Wide white curtains, a lilac underfold and a dissolving foot, always outside the rim.
export function morningFalls({ s, own, forward, shared }, sites, water) {
	const positions = [],
		uv = []
	for (const p of sites) {
		const top = p.y,
			bottom = p.y - p.height
		const left = p.x - p.width / 2,
			right = p.x + p.width / 2
		positions.push(
			left,
			top,
			p.z,
			left,
			bottom,
			p.z + 0.6,
			right,
			top,
			p.z,
			right,
			top,
			p.z,
			left,
			bottom,
			p.z + 0.6,
			right,
			bottom,
			p.z + 0.6,
		)
		uv.push(0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1)
	}
	const geometry = own(new THREE.BufferGeometry())
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
	geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
	const material = own(
		new THREE.ShaderMaterial({
			transparent: true,
			depthWrite: false,
			side: THREE.DoubleSide,
			uniforms: {
				...shared,
				uWater: { value: paint(s.colors, 'water') },
				uWaterShade: { value: paint(s.colors, 'waterShade') },
				uFallSpeed: bind({}, (u) => {
					u.value = s.fallSpeed
				}),
			},
			vertexShader: `varying vec3 vWorld;varying vec2 vFall;
		void main(){vec4 p=modelMatrix*vec4(position,1.0);vWorld=p.xyz;vFall=uv;gl_Position=projectionMatrix*viewMatrix*p;}`,
			fragmentShader: `${HAZE}\n${NOISE}
		uniform vec3 uWater,uWaterShade;uniform float uTime,uFallSpeed;varying vec2 vFall;
		void main(){
			float fold=vFall.x+sin(vFall.y*8.0-uTime*uFallSpeed)*0.025;
			vec3 col=mix(uWaterShade,uWater,smoothstep(0.0,0.25,fold)*(1.0-smoothstep(0.7,1.0,fold)));
			float alpha=(1.0-smoothstep(0.6,1.0,vFall.y))*smoothstep(0.0,0.08,vFall.x)*smoothstep(1.0,0.88,vFall.x);
			gl_FragColor=vec4(isleHaze(col),alpha*0.85);
		}`,
		}),
	)
	forward(new THREE.Mesh(geometry, material), 'overthrow-morning-falls')
	// A curved white crest turns the horizontal stream over the edge into its curtain.
	const lips = []
	for (const p of sites) {
		for (let i = 0; i < 4; i++) {
			const a = (i * Math.PI) / 8,
				b = ((i + 1) * Math.PI) / 8
			const left = p.x - p.width * 0.54,
				right = p.x + p.width * 0.54
			const ya = p.y + Math.cos(a) * water.lip,
				yb = p.y + Math.cos(b) * water.lip
			const za = p.z + Math.sin(a) * water.lip,
				zb = p.z + Math.sin(b) * water.lip
			lips.push(
				left,
				ya,
				za,
				left,
				yb,
				zb,
				right,
				ya,
				za,
				right,
				ya,
				za,
				left,
				yb,
				zb,
				right,
				yb,
				zb,
			)
		}
	}
	const lipGeometry = own(new THREE.BufferGeometry())
	lipGeometry.setAttribute('position', new THREE.Float32BufferAttribute(lips, 3))
	const lipMaterial = own(
		new THREE.ShaderMaterial({
			uniforms: { ...shared, uWater: { value: paint(s.colors, 'water') } },
			side: THREE.DoubleSide,
			vertexShader: `varying vec3 vWorld;void main(){vec4 p=modelMatrix*vec4(position,1.0);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
			fragmentShader: `${HAZE}\nuniform vec3 uWater;void main(){gl_FragColor=vec4(isleHaze(uWater),1.0);}`,
		}),
	)
	forward(new THREE.Mesh(lipGeometry, lipMaterial), 'overthrow-fall-lips')
	const mist = own(
		new THREE.ShaderMaterial({
			transparent: true,
			depthWrite: false,
			uniforms: { ...shared, uMist: { value: paint(s.colors, 'water') } },
			vertexShader: `varying vec3 vWorld;varying vec2 vMist;
		void main(){vMist=uv;vec4 p=modelMatrix*vec4(position,1.0);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
			fragmentShader: `${HAZE}\n${NOISE}
		varying vec2 vMist;uniform vec3 uMist;
		void main(){vec2 p=(vMist-0.5)*2.0;float edge=1.0-smoothstep(0.2,1.0,length(p));
		float body=0.55+0.45*isleNoise(vMist*5.0);gl_FragColor=vec4(isleHaze(uMist),edge*body*0.85);}`,
		}),
	)
	const mistPositions = [],
		mistUV = []
	for (const p of sites) {
		const r = p.width * water.mist,
			y = p.y - p.height * 0.86,
			z = p.z + 0.8
		mistPositions.push(
			p.x - r,
			y - r * 0.4,
			z,
			p.x + r,
			y - r * 0.4,
			z,
			p.x - r,
			y + r * 0.4,
			z,
			p.x - r,
			y + r * 0.4,
			z,
			p.x + r,
			y - r * 0.4,
			z,
			p.x + r,
			y + r * 0.4,
			z,
		)
		mistUV.push(0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1)
	}
	const mistGeometry = own(new THREE.BufferGeometry())
	mistGeometry.setAttribute('position', new THREE.Float32BufferAttribute(mistPositions, 3))
	mistGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(mistUV, 2))
	forward(new THREE.Mesh(mistGeometry, mist), 'overthrow-fall-mist')
}

// Daylight waterfalls use the shared cliff's rings and resource ownership.
export function rimFalls({ s, own, forward, shared, outline, outward, count, rings, points }) {
	const c = s.colors
	// --- Waterfalls: white ribbons draped down the cliff, streaks running down. ---
	const fall = own(
		new THREE.ShaderMaterial({
			uniforms: {
				...shared,
				uWater: { value: paint(c, 'water') },
				uWaterShade: { value: paint(c, 'waterShade') },
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
