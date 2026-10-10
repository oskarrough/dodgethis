import * as THREE from 'three'
import { PALETTE } from '../../core/style.js'

// See-through team light: rim-lit, scanlined, breathing. The lobby's bot holograms and Flagfall's
// laser gates wear it; `flicker` (0..1) drops random frames out, `uTime` is the caller's clock.
export function hologramMaterial(team, { opacity, lines, flicker = 0, ...options }) {
	return new THREE.ShaderMaterial({
		uniforms: {
			uColor: { value: new THREE.Color(PALETTE[team === 'A' ? 'teamA' : 'teamB']) },
			uTime: { value: 0 },
			uOpacity: { value: opacity },
			uLines: { value: lines },
			uFlicker: { value: flicker },
		},
		vertexShader: `
			varying vec3 vNormal;
			varying vec3 vView;
			varying float vY;
			void main() {
				vec4 world = modelMatrix * vec4(position, 1.0);
				vY = world.y;
				vec4 view = viewMatrix * world;
				vView = normalize(-view.xyz);
				vNormal = normalize(normalMatrix * normal);
				gl_Position = projectionMatrix * view;
			}`,
		fragmentShader: `
			uniform vec3 uColor;
			uniform float uTime;
			uniform float uOpacity;
			uniform float uLines;
			uniform float uFlicker;
			varying vec3 vNormal;
			varying vec3 vView;
			varying float vY;
			void main() {
				float rim = pow(1.0 - abs(dot(normalize(vNormal), vView)), 2.0);
				float scan = 0.5 + 0.5 * sin((vY * uLines - uTime * 0.35) * 6.2832);
				float breathe = 0.85 + 0.15 * sin(uTime * 1.3);
				float dropout = step(0.82, fract(sin(floor(uTime * 20.0) * 12.9898) * 43758.5453));
				float alpha = uOpacity * (0.3 + 0.7 * rim) * (0.7 + 0.3 * scan) * breathe * (1.0 - uFlicker * dropout);
				gl_FragColor = vec4(mix(uColor, vec3(1.0), rim * 0.55), alpha);
			}`,
		transparent: true,
		depthWrite: false,
		...options,
	})
}
