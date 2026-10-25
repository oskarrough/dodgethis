import * as THREE from 'three'
import { tune } from '../../tune.js'
import { dressRim } from '../../rim-dress.js'

export function scenery(scope) {
	const { s, own, forward, points } = scope
	dressRim(
		scope,
		s.rim,
		tune.altamesa.walls,
		{ ruin: 'courtShade', wood: 'ink', bone: 'cream', moss: 'court' },
		'altamesa-rim',
	)

	// Airbrushed apricot on the sunward cloud sea. Kept below all playable ground;
	// this forward veil never enters the ink pass or changes another map's sky.
	const edge = new THREE.Vector2(
		Math.max(...points[0].map((p) => Math.abs(p.x))),
		Math.max(...points[0].map((p) => Math.abs(p.z))),
	)
	const sun = new THREE.Vector2(s.light.dir[0], s.light.dir[2]).normalize()
	const glow = own(
		new THREE.ShaderMaterial({
			transparent: true,
			depthWrite: false,
			uniforms: {
				sun: { value: sun },
				edge: { value: edge },
				apricot: { value: new THREE.Color('#ffb87e') },
				cream: { value: new THREE.Color('#ffe6c0') },
			},
			vertexShader: /* glsl */ `
		varying vec2 world;
		void main() {
			vec4 p = modelMatrix * vec4(position, 1.0);
			world = p.xz;
			gl_Position = projectionMatrix * viewMatrix * p;
		}`,
			fragmentShader: /* glsl */ `
		uniform vec2 sun, edge;
		uniform vec3 apricot, cream;
		varying vec2 world;
		void main() {
			float along = dot(world, sun);
			float across = dot(world, vec2(-sun.y, sun.x));
			float halo = exp(-pow((along - 95.0) / 135.0, 2.0) - pow(across / 170.0, 2.0));
			float heart = exp(-pow((along - 125.0) / 65.0, 2.0) - pow(across / 100.0, 2.0));
			float outside = max(abs(world.x) - edge.x, abs(world.y) - edge.y);
			float clearCliff = smoothstep(4.0, 22.0, outside);
			gl_FragColor = vec4(mix(apricot, cream, heart), halo * clearCliff * 0.78);
		}`,
		}),
	)
	const sky = forward(
		new THREE.Mesh(
			own(new THREE.PlaneGeometry(s.clouds.size, s.clouds.size).rotateX(-Math.PI / 2)),
			glow,
		),
		'altamesa-sun-haze',
	)
	// Draw after the sight haze; the copied world depth still masks court and ruins.
	sky.renderOrder = 2
	sky.position.y = -12
}
