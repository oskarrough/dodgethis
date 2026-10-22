import * as THREE from 'three'
import { PALETTE } from '../../core/style.js'

// See-through team light: rim-lit, scanlined, breathing. The lobby's bot holograms and Flagfall's
// laser gates wear it; `flicker` (0..1) drops random frames out, `uTime` is the caller's clock.
// `lift` (0..1) pulls the fill toward cream, `core` is the face-on opacity against the rim's, and
// `outline` (0..1) inks the silhouette, so a hologram still reads standing on its own team's colour.
export function hologramMaterial(
	team,
	{ opacity, lines, flicker = 0, lift = 0, core = 0.3, outline = 0, ...options },
) {
	return new THREE.ShaderMaterial({
		uniforms: {
			uColor: { value: new THREE.Color(PALETTE[team === 'A' ? 'teamA' : 'teamB']) },
			uTime: { value: 0 },
			uOpacity: { value: opacity },
			uLines: { value: lines },
			uFlicker: { value: flicker },
			uLift: { value: lift },
			uCore: { value: core },
			uOutline: { value: outline },
			uCream: { value: new THREE.Color(PALETTE.cream) },
			uInk: { value: new THREE.Color(PALETTE.ink) },
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
			uniform float uLift;
			uniform float uCore;
			uniform float uOutline;
			uniform vec3 uCream;
			uniform vec3 uInk;
			varying vec3 vNormal;
			varying vec3 vView;
			varying float vY;
			void main() {
				float grazing = 1.0 - abs(dot(normalize(vNormal), vView));
				float rim = pow(grazing, 2.0);
				float edge = uOutline * smoothstep(0.38, 0.58, grazing);
				float scan = 0.5 + 0.5 * sin((vY * uLines - uTime * 0.35) * 6.2832);
				float breathe = 0.85 + 0.15 * sin(uTime * 1.3);
				float dropout = step(0.82, fract(sin(floor(uTime * 20.0) * 12.9898) * 43758.5453));
				float alpha = uOpacity * (uCore + (1.0 - uCore) * rim) * (0.7 + 0.3 * scan) * breathe * (1.0 - uFlicker * dropout);
				vec3 fill = mix(mix(uColor, uCream, uLift), vec3(1.0), rim * 0.55);
				gl_FragColor = vec4(mix(fill, uInk, edge), max(alpha, edge * uOpacity));
			}`,
		transparent: true,
		depthWrite: false,
		...options,
	})
}
