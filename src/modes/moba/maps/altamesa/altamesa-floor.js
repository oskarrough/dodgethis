import * as THREE from 'three'

// One continuous print, so sand buries the paving without rectangular overlay seams.
// It inherits the kit's contact, moving sun and cloud shadows. Nothing here adds height.
export function dressFloor(mesh, s) {
	const compile = mesh.material.onBeforeCompile
	mesh.material.customProgramCacheKey = () => 'altamesa-worn-courts'
	mesh.material.onBeforeCompile = (shader) => {
		compile(shader)
		for (const [key, value] of Object.entries({
			sand: s.sand,
			shadeStone: s.shadeStone,
			sunStone: s.sunStone,
			ritualStone: s.ritualStone,
		}))
			shader.uniforms[key] = { value: new THREE.Color(value) }
		shader.fragmentShader = shader.fragmentShader.replace(
			'void main() {',
			/* glsl */ `
		uniform vec3 sand, shadeStone, sunStone, ritualStone;
		float precinct(vec2 p, vec2 centre, vec2 halfSize) {
			vec2 edge = abs(p - centre) - halfSize;
			return 1.0 - smoothstep(-0.6, 0.8, max(edge.x, edge.y));
		}
		vec3 altamesaFloor(vec3 flags, vec2 p) {
			float wind = fFbm(p * 0.18 + vec2(3.0, 9.0));
			float ripples = sin(dot(p, vec2(1.0, 0.32)) * 5.0 + wind * 8.0);
			vec3 drift = sand * (0.95 + wind * 0.08 + ripples * 0.018);
			float road = 1.0 - smoothstep(4.0, 8.0, abs(p.y));
			float court = precinct(p, vec2(-6.0, 0.0), vec2(10.0, 9.0));
			float shade = precinct(p, vec2(12.0, -21.0), vec2(29.0, 8.0));
			float sun = precinct(p, vec2(12.0, 21.0), vec2(29.0, 8.0));
			float ritual = precinct(p, vec2(35.0, 0.0), vec2(13.0, 10.0));
			float paved = max(max(road, court), max(max(shade, sun), ritual));
			vec3 stone = flags;
			vec2 slabs = fGrid(p, vec2(2.7, 2.1), 0.5, 0.19);
			stone = mix(stone, shadeStone * (1.0 - slabs.x * 0.09 + (slabs.y - 0.5) * 0.035), shade);
			vec2 brick = fGrid(p, vec2(3.4, 1.5), 0.5, 0.12);
			stone = mix(stone, sunStone * (1.0 - brick.x * 0.1 + (brick.y - 0.5) * 0.04), sun);
			vec2 council = fGrid(p + vec2(6.0, 0.0), vec2(2.8), 0.0, 0.14);
			stone = mix(stone, floorBase * (1.0 - council.x * 0.1 + (council.y - 0.5) * 0.035), court);
			vec2 dial = fGrid(p, vec2(3.2), 0.0, 0.12);
			vec3 sacred = ritualStone * (1.0 - dial.x * 0.08);
			// A rectangular stone border belongs to the architecture, never an ability ring.
			vec2 frame = abs(p - vec2(35.0, 0.0));
			float border = max(1.0 - smoothstep(0.12, 0.28, abs(frame.y - 8.6)),
				1.0 - smoothstep(0.12, 0.28, abs(frame.x - 11.5)));
			sacred *= 1.0 - border * 0.12;
			// Broad worn riser seams lead east; a print preserves the actual walking plane.
			float stair = precinct(p, vec2(27.0, 0.0), vec2(5.0, 6.5));
			float tread = 1.0 - smoothstep(0.025, 0.12, fract((p.x - 22.0) / 1.5));
			sacred *= 1.0 - stair * tread * 0.13;
			stone = mix(stone, sacred, ritual);
			// Broad scoured patches break the newly laid look without peppering the floor.
			stone *= 0.96 + 0.06 * fFbm(p * 0.65);
			float wornJoint = fNoise(p * 2.0);
			stone = mix(stone, drift, smoothstep(0.71, 0.9, wornJoint) * 0.18);
			float bank = smoothstep(0.38, 0.73, wind) * 0.7;
			bank *= 1.0 - court * 0.6;
			bank *= 1.0 - ritual * 0.8;
			return mix(drift, stone, paved * (1.0 - bank));
		}
		void main() {`,
		)
		shader.fragmentShader = shader.fragmentShader.replace(
			'vec3 floorColour = fFloor(floorPoint);',
			'vec3 floorColour = altamesaFloor(fFloor(floorPoint), floorPoint);',
		)
	}
}
