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
			poolLight: s.pool,
			jointInk: s.joint,
			edgeLight: s.edge,
		}))
			shader.uniforms[key] = { value: new THREE.Color(value) }
		// The paving's sandstone in three close cuts (`stones`).
		shader.uniforms.stones = { value: s.stones.map((c) => new THREE.Color(c)) }
		shader.uniforms.sunSide = { value: new THREE.Vector2(...s.sunSide).normalize() }
		shader.fragmentShader = shader.fragmentShader.replace(
			'void main() {',
			/* glsl */ `
		uniform vec3 sand, shadeStone, sunStone, ritualStone, poolLight, jointInk, edgeLight;
		uniform vec3 stones[3];
		uniform vec2 sunSide;
		float precinct(vec2 p, vec2 centre, vec2 halfSize) {
			vec2 edge = abs(p - centre) - halfSize;
			return 1.0 - smoothstep(-0.6, 0.8, max(edge.x, edge.y));
		}
		// One sandstone in three close cuts: the life is in the wear, not the colour.
		vec3 pour(float h) {
			return (h < 0.4 ? stones[0] : h < 0.75 ? stones[1] : stones[2]) * (0.96 + 0.08 * fract(h * 7.3));
		}
		// A laid stone from (joint, hash) and the same joint a step toward the sun: one flat
		// stone under a loose brush, its sunward edge worn pale and its far edge in shade. A few
		// stones are gone, and sand lies in the hole under the shadow of its sunward wall.
		// \`warm\` is unused by the sandstone and kept for the callers.
		vec3 laid(vec2 cell, float sunJoint, float warm, vec2 p) {
			vec3 c = pour(cell.y);
			c *= 0.94 + 0.12 * fFbm(p * 0.8 + cell.y * 37.0);
			float gone = step(0.93, fract(cell.y * 13.7));
			c = mix(c, sand * (0.9 - 0.3 * sunJoint), gone);
			c = mix(c, edgeLight, sunJoint * (1.0 - cell.x) * (1.0 - gone) * 0.45);
			// Sand has blown into most joints; where it has not, the joint is a dark seam.
			float filled = smoothstep(0.35, 0.6, fNoise(p * 0.31 + 11.0));
			return mix(c, mix(jointInk, sand, filled * 0.85), cell.x * (0.8 - 0.35 * filled));
		}
		// A crack is a line, not a loop: about half the 7 m patches of paving carry one, run
		// through a point at its own angle with a short branch leaving the middle, a little
		// unsteady so it never looks ruled.
		float crackLine(vec2 p) {
			vec2 q = p + (vec2(fNoise(p * 1.3), fNoise(p * 1.3 + 9.0)) - 0.5) * 0.22;
			vec2 cell = floor(q / 7.0);
			if (fHash(cell + 2.3) > 0.5) return 0.0;
			vec2 d = q - (cell + 0.25 + 0.5 * fHash2(cell + 5.1)) * 7.0;
			float a = fHash(cell + 8.7) * 3.14159;
			vec2 run = vec2(cos(a), sin(a));
			vec2 fork = vec2(cos(a + 0.9), sin(a + 0.9));
			float line = (1.0 - smoothstep(0.012, 0.035, abs(dot(d, vec2(-run.y, run.x)))))
				* (1.0 - smoothstep(1.6, 2.6, abs(dot(d, run))));
			float along = dot(d, fork);
			float branch = (1.0 - smoothstep(0.01, 0.03, abs(dot(d, vec2(-fork.y, fork.x)))))
				* step(0.0, along) * (1.0 - smoothstep(0.7, 1.3, along));
			return max(line, branch);
		}
		vec3 slabs(vec2 p, vec2 size, float stagger, float chip, float warm) {
			return laid(fGrid(p, size, stagger, chip), fGrid(p + sunSide * 0.09, size, stagger, chip).x, warm, p);
		}
		vec3 altamesaFloor(vec3 flags, vec2 p) {
			float wind = fFbm(p * 0.18 + vec2(3.0, 9.0));
			float ripples = sin(dot(p, vec2(1.0, 0.32)) * 5.0 + wind * 8.0);
			vec3 drift = sand * (0.93 + wind * 0.12 + ripples * 0.025);
			float road = 1.0 - smoothstep(4.0, 8.0, abs(p.y));
			float court = precinct(p, vec2(-6.0, 0.0), vec2(10.0, 9.0));
			float shade = precinct(p, vec2(12.0, -21.0), vec2(29.0, 8.0));
			float sun = precinct(p, vec2(12.0, 21.0), vec2(29.0, 8.0));
			float ritual = precinct(p, vec2(35.0, 0.0), vec2(13.0, 10.0));
			float paved = max(max(road, court), max(max(shade, sun), ritual));
			// The road's flags are hand-cut: the cells wander a little, so no edge runs ruler-straight.
			vec2 cut = p + (vec2(fNoise(p * 0.45), fNoise(p * 0.45 + 19.0)) - 0.5) * 0.7;
			vec3 stone = laid(fFlags(cut, 1.5), fFlags(cut + sunSide * 0.09, 1.5).x, 0.0, p);
			stone = mix(stone, mix(slabs(p, vec2(2.7, 2.1), 0.5, 0.19, 0.0), shadeStone, 0.25), shade);
			stone = mix(stone, mix(slabs(p, vec2(3.4, 1.5), 0.5, 0.12, 1.0), sunStone, 0.25), sun);
			stone = mix(stone, slabs(p + vec2(6.0, 0.0), vec2(2.8), 0.0, 0.14, 0.0), court);
			vec3 sacred = mix(slabs(p, vec2(3.2), 0.0, 0.12, 0.0), ritualStone, 0.4);
			// A rectangular stone border belongs to the architecture, never an ability ring.
			vec2 frame = abs(p - vec2(35.0, 0.0));
			float border = max(1.0 - smoothstep(0.12, 0.28, abs(frame.y - 8.6)),
				1.0 - smoothstep(0.12, 0.28, abs(frame.x - 11.5)));
			sacred = mix(sacred, jointInk, border * 0.3);
			// Broad worn riser seams lead east; a print preserves the actual walking plane.
			float stair = precinct(p, vec2(27.0, 0.0), vec2(5.0, 6.5));
			float tread = 1.0 - smoothstep(0.025, 0.12, fract((p.x - 22.0) / 1.5));
			sacred = mix(sacred, jointInk, stair * tread * 0.3);
			stone = mix(stone, sacred, ritual);
			// The side courts, each paved apart from the road with a short path from its door:
			// Vigía's lookout in long slabs, Pozo's well in rings, Solana's terrace in sun brick.
			float vigia = max(precinct(p, vec2(-32.0, -23.5), vec2(8.5, 6.0)),
				precinct(p, vec2(-32.0, -15.5), vec2(1.6, 2.0)));
			stone = mix(stone, mix(slabs(p, vec2(3.6, 1.8), 0.5, 0.12, 0.0), ritualStone, 0.3), vigia);
			vec2 well = p - vec2(-33.0, 24.5);
			float basin = 1.0 - smoothstep(7.4, 8.4, length(well));
			float pozo = max(basin, precinct(p, vec2(-34.0, 16.2), vec2(1.6, 2.4)));
			float ring = 1.0 - smoothstep(0.03, 0.12, abs(fract(length(well) / 1.7) - 0.5) * 2.0 - 0.86);
			float spoke = 1.0 - smoothstep(0.02, 0.09, abs(fract(atan(well.y, well.x) * 2.546 + floor(length(well) / 1.7) * 0.5) - 0.5) * 2.0 - 0.9);
			vec3 rings = mix(pour(fHash(vec2(floor(length(well) / 1.7), 4.0))), shadeStone, 0.3);
			rings = mix(rings, jointInk, max(ring, spoke * basin) * 0.5);
			stone = mix(stone, rings, pozo);
			float solana = precinct(p, vec2(42.0, 24.0), vec2(5.6, 7.4));
			vec2 edge = abs(p - vec2(42.0, 24.0));
			float kerb = max(1.0 - smoothstep(0.12, 0.28, abs(edge.x - 4.9)),
				1.0 - smoothstep(0.12, 0.28, abs(edge.y - 6.7)));
			vec3 sunned = mix(slabs(p, vec2(1.8), 0.0, 0.12, 1.0), sunStone, 0.3);
			stone = mix(stone, mix(sunned, jointInk, kerb * 0.45), solana);
			float side = max(vigia, max(pozo, solana));
			paved = max(paved, side);
			stone = mix(stone, jointInk, crackLine(p) * 0.6);
			// Dust lies in the worn joints, banks up where the wind leaves it, and heaps at the
			// foot of every wall and pillar.
			float wornJoint = fNoise(p * 2.0);
			stone = mix(stone, drift, smoothstep(0.66, 0.9, wornJoint) * 0.3);
			vec2 footUv = vec2(0.5) + vec2(p.x, -p.y) / (floorExtent * 2.0);
			float foot = 1.0 - texture2D(floorContactPrint, footUv).r;
			float heap = smoothstep(0.25, 0.8, foot + (fNoise(p * 0.9 + 3.0) - 0.5) * 0.7);
			stone = mix(stone, drift, heap * 0.85);
			float bank = smoothstep(0.38, 0.73, wind) * 0.7;
			bank *= 1.0 - court * 0.6;
			bank *= 1.0 - ritual * 0.8;
			bank *= 1.0 - side * 0.5;
			return mix(drift, stone, paved * (1.0 - bank));
		}
		void main() {`,
		)
		shader.fragmentShader = shader.fragmentShader.replace(
			'vec3 floorColour = fFloor(floorPoint);',
			`vec3 floorColour = altamesaFloor(fFloor(floorPoint), floorPoint);
			// Pools of warm light round the council's four braziers, laid after the shadows.
			float altamesaPool = 0.0;
			for (int i = 0; i < 4; i++) {
				vec2 lamp = vec2(i < 2 ? -12.0 : 0.0, mod(float(i), 2.0) < 0.5 ? -7.0 : 7.0);
				float d = length(floorPoint - lamp);
				altamesaPool += exp(-d * d / 6.0) * 0.3 + exp(-d * d / 40.0) * 0.05;
			}`,
		)
		shader.fragmentShader = shader.fragmentShader.replace(
			'diffuseColor.rgb = floorColour;',
			'diffuseColor.rgb = floorColour + poolLight * altamesaPool * (0.35 + 0.65 * floorColour);',
		)
	}
}
