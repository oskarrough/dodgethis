import * as THREE from 'three'
import { makeStyleMaterial } from '../../../../core/stylepass.js'

// Six small basins on the drop, rooted to the same outline as the cliff. Neither
// the ledge nor its water reaches back across the rim into the walking surface.
export function nightPools({ s, own, forward, outline, outward, rand, shared }, p) {
	const shelves = [],
		water = [],
		ripples = []
	const halfX = Math.max(...outline.map((v) => Math.abs(v.x)))
	const halfZ = Math.max(...outline.map((v) => Math.abs(v.z)))
	for (const side of [-1, 1]) {
		for (const { fraction, drop, radius: size } of p.sites) {
			let nearest = 0,
				distance = Infinity
			for (let i = 0; i < outline.length; i++) {
				const d = Math.hypot(outline[i].x - side * halfX, outline[i].z - fraction * halfZ)
				if (d < distance) {
					nearest = i
					distance = d
				}
			}
			const rim = outline[nearest],
				normal = outward[nearest]
			const facing = Math.atan2(normal.x, normal.z)
			const phase = rand() * Math.PI * 2
			const centre = new THREE.Vector3(
				rim.x + normal.x * p.reach,
				s.groundY - drop,
				rim.z + normal.z * p.reach,
			)
			const point = (angle, radius, y = 0) => {
				const edge = 1 + Math.sin(angle * 3 + phase) * 0.09 + Math.sin(angle * 5 - phase) * 0.055
				const v = new THREE.Vector3(
					Math.cos(angle) * size * edge * radius,
					y,
					Math.sin(angle) * size * p.squash * edge * radius,
				)
				v.applyAxisAngle(new THREE.Vector3(0, 1, 0), facing).add(centre)
				const past = (v.x - rim.x) * normal.x + (v.z - rim.z) * normal.z
				if (past < 0.15) {
					v.x += normal.x * (0.15 - past)
					v.z += normal.z * (0.15 - past)
				}
				return v
			}
			const triangle = (list, a, b, c) => list.push(...a, ...b, ...c)
			for (let i = 0; i < p.segments; i++) {
				const a = (i * Math.PI * 2) / p.segments,
					b = ((i + 1) * Math.PI * 2) / p.segments
				const topA = point(a, 1, -0.04),
					topB = point(b, 1, -0.04)
				const footA = point(a, 0.64, -p.depth),
					footB = point(b, 0.64, -p.depth)
				triangle(shelves, point(0, 0, -0.04), topB, topA)
				triangle(shelves, topA, topB, footA)
				triangle(shelves, footA, topB, footB)
				triangle(water, centre, point(b, p.fill), point(a, p.fill))
				for (let ring = 0; ring < 4; ring++) {
					if (ring < 3 && Math.sin(a * 2 + ring * 2 + phase) < 0.15) continue
					const radius = ring === 3 ? p.fill * 0.98 : 0.2 + ring * 0.2
					const inner = radius - p.line / size
					triangle(
						ripples,
						point(a, inner, 0.012),
						point(b, radius, 0.012),
						point(a, radius, 0.012),
					)
					triangle(ripples, point(a, inner, 0.012), point(b, inner, 0.012), point(b, radius, 0.012))
				}
			}
		}
	}
	const enamel = new THREE.ShaderMaterial({
		uniforms: {
			violet: { value: new THREE.Color(p.violet) },
			teal: { value: new THREE.Color(p.teal) },
		},
		vertexShader: /* glsl */ `varying vec2 at; void main(){at=position.xz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
		fragmentShader: /* glsl */ `varying vec2 at; uniform vec3 violet,teal;
		void main(){float pour=sin(at.x*1.7+sin(at.y*1.9))*0.6+sin(at.y*2.5)*0.4;
		gl_FragColor=vec4(mix(violet,teal,step(0.38,pour)),1.0);}`,
	})
	const ripple = new THREE.ShaderMaterial({
		transparent: true,
		depthWrite: false,
		uniforms: { uTime: shared.uTime, ink: { value: new THREE.Color(p.ripple) } },
		vertexShader: /* glsl */ `varying float phase; void main(){phase=position.x+position.z;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
		fragmentShader: /* glsl */ `varying float phase; uniform float uTime; uniform vec3 ink;
		void main(){gl_FragColor=vec4(ink,0.72+0.12*sin(phase+uTime*0.55));}`,
	})
	for (const [vertices, name, material] of [
		[shelves, 'flagfall-pool-ledges', makeStyleMaterial('courtShade')],
		[water, 'flagfall-pool-enamel', enamel],
		[ripples, 'flagfall-pool-ripples', ripple],
	]) {
		const geometry = own(new THREE.BufferGeometry())
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
		geometry.computeVertexNormals()
		const mesh = forward(new THREE.Mesh(geometry, own(material)), name)
		if (vertices === shelves) mesh.layers.set(0)
	}
}
