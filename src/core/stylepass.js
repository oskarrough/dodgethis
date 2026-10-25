import * as THREE from 'three'
import { PALETTE } from './style.js'
import { createStylePresets } from './style-presets.js'

// Opaque shade/role/normal/depth → ink, highlights and halftone → layer-1 effects against copied depth; creators own materials.

const ROLES = Object.keys(PALETTE)

// Sun direction in world space. The style pass only needs one light; a palette's `light` may move it.
const LIGHT_DEFAULT = new THREE.Vector3(0.4, 0.85, 0.35).normalize()
const LIGHT_WORLD = LIGHT_DEFAULT.clone()
const shared = { uLightDir: { value: new THREE.Vector3(0, 1, 0) } }

const dataVert = /* glsl */ `
varying vec3 vNormalV;
varying vec2 vInstanceStyle; // x = style id (<0 when the material's own id wins), y = flatness
void main() {
	vec3 transformed = position;
	vec3 objectNormal = normal;
	// Instancing without this collapses the pool onto the mesh's origin — one large shape at world centre per burst.
	#ifdef USE_INSTANCING
		transformed = (instanceMatrix * vec4(transformed, 1.0)).xyz;
		objectNormal = mat3(instanceMatrix) * objectNormal;
	#endif
	#ifdef USE_INSTANCING_COLOR
		vInstanceStyle = vec2(instanceColor.r * 255.0, instanceColor.g);
	#else
		vInstanceStyle = vec2(-1.0, 0.0);
	#endif
	vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
	vNormalV = normalize(normalMatrix * objectNormal);
	gl_Position = projectionMatrix * mvPosition;
}`

// Pack shade, style ID and view-normal xy; the style shader reconstructs z from their length.
const dataFrag = /* glsl */ `
precision highp float;
uniform float uStyleId;
uniform float uFlat;
uniform vec3 uLightDir;
varying vec3 vNormalV;
varying vec2 vInstanceStyle;
void main() {
	vec3 n = normalize(vNormalV);
	if (!gl_FrontFacing) n = -n;
	float ndl = dot(n, uLightDir) * 0.5 + 0.5;
	// An instance may override the material's role, so one pooled mesh draws marks in two roles at once.
	bool perInstance = vInstanceStyle.x >= 0.0;
	float id = perInstance ? vInstanceStyle.x : uStyleId;
	float flatness = perInstance ? vInstanceStyle.y : uFlat;
	// Flat surfaces (court lines, stickers, markers) are printed ON the world, not lit — no shading or halftone.
	float shade = flatness > 0.5 ? -1.0 : clamp(ndl, 0.0, 1.0);
	gl_FragColor = vec4(shade, id, n.x, n.y);
}`

const postVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`

const postFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tData;
uniform sampler2D tDepth;
uniform vec2 uRes;
uniform float uNear;
uniform float uFar;
uniform vec3 uColors[${ROLES.length}];
uniform vec3 uInk;
uniform vec3 uCream;
uniform vec3 uSky;
uniform vec3 uSunTint;
uniform vec3 uShadeTint;
uniform vec2 uBandMix; // lit band toward the sun tint, dark band toward the shade tint
uniform mat4 uInvProj;
uniform mat4 uInvView;
uniform float uLine;
uniform float uHatch;
uniform float uAlpha;
uniform float uImpact; // 1: standing things cream on ink; -1: the same, inverted; 0: off

float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
	vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
	float a = hash21(i), b = hash21(i + vec2(1.0, 0.0)), c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
	return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float linDepth(float z) { float zn = z * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - zn * (uFar - uNear)); }

vec3 roleColor(float id) {
	int idx = int(id + 0.5);
	for (int i = 0; i < ${ROLES.length}; i++) if (i == idx) return uColors[i];
	return uColors[0];
}

void main() {
	vec2 px = 1.0 / uRes;
	float sc = uRes.y / 900.0;
	vec4 s = texture2D(tData, vUv);
	// Copy opaque depth while styling into a separate framebuffer; forward effects can depth-test without sampling it.
	float z = texture2D(tDepth, vUv).x;
	gl_FragDepth = z;
	bool sky = z >= 0.99999;
	if (sky) { gl_FragColor = vec4(uImpact > 0.5 ? uInk : uImpact < -0.5 ? uCream : uSky, uImpact != 0.0 ? 1.0 : 1.0 - uAlpha); return; }

	float d = linDepth(z);
	float o = 1.2 * sc * uLine;
	vec2 ox = vec2(o, 0.0) * px, oy = vec2(0.0, o) * px;
	float zl = texture2D(tDepth, vUv - ox).x, zr = texture2D(tDepth, vUv + ox).x;
	float zu = texture2D(tDepth, vUv + oy).x, zd = texture2D(tDepth, vUv - oy).x;
	vec4 sl = texture2D(tData, vUv - ox), sr = texture2D(tData, vUv + ox);
	vec4 su = texture2D(tData, vUv + oy), sd = texture2D(tData, vUv - oy);

	// Silhouettes from an inverse-depth laplacian: 1/d is affine across any plane, so a flat floor has zero second difference (no false outline), and dividing by 1/d keeps outlines scale invariant.
	float iw = 1.0 / d;
	float lap = abs(1.0 / linDepth(zl) + 1.0 / linDepth(zr) - 2.0 * iw)
	          + abs(1.0 / linDepth(zu) + 1.0 / linDepth(zd) - 2.0 * iw);
	float edge = smoothstep(0.06, 0.28, lap / (iw + 1e-7));
	// Creases from normal discontinuity, for folds that share a depth.
	float nEdge = length(sl.ba - sr.ba) + length(su.ba - sd.ba);
	edge = max(edge, smoothstep(0.45, 0.9, nEdge));

	// Take ink color from the front-most neighbour so the outline belongs to the nearer shape.
	float zmin = z; float inkId = s.g;
	if (zl < zmin) { zmin = zl; inkId = sl.g; }
	if (zr < zmin) { zmin = zr; inkId = sr.g; }
	if (zu < zmin) { zmin = zu; inkId = su.g; }
	if (zd < zmin) { zmin = zd; inkId = sd.g; }

	vec3 base = roleColor(s.g);
	float shade = s.r;
	vec3 col = base;

	if (shade >= 0.0) {
		// Three flat bands, not a gradient: printed artwork, not lit plastic.
		float band = shade > 0.66 ? 1.0 : (shade > 0.38 ? 0.5 : 0.0);
		col = mix(base, uSunTint, band * uBandMix.x);
		col = mix(col, uShadeTint, (1.0 - band) * uBandMix.y);

		// One halftone rule anchored in world space so dots sit ON the surface and don't swim; power-of-two distance stepping keeps on-screen density constant (no far moire).
		vec4 clip = vec4(vUv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
		vec4 vpos = uInvProj * clip; vpos /= vpos.w;
		vec3 wpos = (uInvView * vec4(vpos.xyz, 1.0)).xyz;
		vec2 nxy = s.ba;
		vec3 nView = vec3(nxy, sqrt(max(0.0, 1.0 - dot(nxy, nxy))));
		vec3 wn = normalize(mat3(uInvView) * nView);
		vec3 an = abs(wn);
		vec2 hp = an.y > max(an.x, an.z) ? wpos.xz : (an.x > an.z ? wpos.zy : wpos.xy);
		float lod = exp2(floor(log2(max(1e-4, (0.02 * d) / 0.22))));
		float sp = 0.22 * lod;
		vec2 cell = fract(hp / sp) - 0.5;
		float dot0 = 1.0 - smoothstep(0.16, 0.30, length(cell));
		float dots = dot0 * smoothstep(0.42, 0.16, shade);
		if (uHatch > 0.0) {
			// World-anchored 30 degree lines, anti-aliased at their projected width.
			float stripe = (hp.x * 0.8660254 + hp.y * 0.5) / sp;
			float width = max(fwidth(stripe), 0.001);
			float hatch = 1.0 - smoothstep(0.10, 0.10 + width, abs(fract(stripe) - 0.5));
			vec3 hatched = mix(base, uInk, hatch * smoothstep(0.66, 0.16, shade) * 0.30);
			col = mix(mix(col, uShadeTint, dots * 0.30), hatched, uHatch);
		} else {
			col = mix(col, uShadeTint, dots * 0.30);
		}
	}

	// Ink the edge last so nothing prints over the outline; stable noise varies the weight so it reads as a pen, not a filter.
	float ew = mix(0.78 + 0.32 * vnoise(gl_FragCoord.xy * 0.35), 1.0, uHatch);
	col = mix(col, mix(uInk, roleColor(inkId) * 0.35, 0.25), clamp(edge * ew, 0.0, 1.0));
	if (uImpact != 0.0) {
		// The impact frame: two tones, split by height, so whatever stands up reads as one silhouette.
		vec4 iclip = vec4(vUv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
		vec4 ipos = uInvProj * iclip; ipos /= ipos.w;
		float up = (uInvView * vec4(ipos.xyz, 1.0)).y;
		bool stands = up > 0.25 && edge < 0.5;
		col = (stands == (uImpact > 0.5)) ? uCream : uInk;
	}
	gl_FragColor = vec4(col, 1.0);
}`

// Write surface data for a palette `role`; `flat` skips shading and halftone.
export function makeStyleMaterial(role, { flat = false, side = THREE.FrontSide } = {}) {
	const id = ROLES.indexOf(role)
	return new THREE.ShaderMaterial({
		userData: { styleColor: PALETTE[role] ?? PALETTE.cream },
		uniforms: {
			uStyleId: { value: id < 0 ? 0 : id },
			uFlat: { value: flat ? 1 : 0 },
			uLightDir: shared.uLightDir,
		},
		vertexShader: dataVert,
		fragmentShader: dataFrag,
		side,
	})
}

// A role's style ID, for code that repaints a style material's uStyleId.
export function styleId(role) {
	return Math.max(0, ROLES.indexOf(role))
}

// Pack per-instance role ID in red and flatness in green: instances cannot own uniforms.
export function instanceStyle(role, { flat = true } = {}) {
	return new THREE.Color(Math.max(0, ROLES.indexOf(role)) / 255, flat ? 1 : 0, 0)
}

const OPAQUE_LAYER = 0
export const FORWARD_LAYER = 1
// Things that emit light opt in (`glows(mesh)`): they are drawn again, small and blurred, and added
// over the frame as an airbrushed bloom. Opt-in rather than a brightness threshold, so the pale
// court and cream marks never bloom.
export const GLOW_LAYER = 2
const glowMaterials = new Map()
let glowTwins = 0 // live twins; the bloom pass is skipped while there are none
// A glow twin follows its source. Sprites retain their alpha mask and live opacity; a shader
// source can supply a rim-only material. Clear the source's children before disposing it.
// Supplied materials belong to the caller; sprite copies are released when their twin is removed.
export function glows(object, color, { material: supplied } = {}) {
	const meshes = []
	object.traverse((o) => (o.isMesh || o.isSprite) && !o.userData.glowTwin && meshes.push(o))
	for (const mesh of meshes) {
		if (mesh.children.some((child) => child.userData.glowTwin)) continue
		let material = supplied
		if (!material && mesh.isSprite) {
			material = mesh.material.clone()
			material.color.set(color)
		} else if (!material) {
			const key = new THREE.Color(color).getHex()
			material = glowMaterials.get(key)
			if (!material) {
				material = new THREE.MeshBasicMaterial({ color: key, depthWrite: false })
				glowMaterials.set(key, material)
			}
		}
		const twin = mesh.isSprite
			? new THREE.Sprite(material)
			: new THREE.Mesh(mesh.geometry, material)
		if (mesh.isSprite) {
			twin.center.copy(mesh.center)
			if (!supplied)
				twin.onBeforeRender = () => {
					material.opacity = mesh.material.opacity
					material.rotation = mesh.material.rotation
				}
		}
		twin.userData.glowTwin = true
		twin.layers.set(GLOW_LAYER)
		twin.frustumCulled = false
		twin.addEventListener('removed', () => {
			glowTwins--
			if (mesh.isSprite && !supplied) material.dispose()
		})
		glowTwins++
		mesh.add(twin)
	}
	return object
}

export function createStylePass(canvas) {
	const renderer = new THREE.WebGLRenderer({
		canvas,
		antialias: false,
		stencil: false,
		alpha: true,
		powerPreference: 'high-performance',
	})
	renderer.outputColorSpace = THREE.LinearSRGBColorSpace
	renderer.autoClear = false
	renderer.info.autoReset = false
	// Cap high-DPI fill cost at 1.5 without visibly softening the ink.
	const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)

	const depthTexture = new THREE.DepthTexture(2, 2)
	depthTexture.format = THREE.DepthFormat
	depthTexture.type = THREE.FloatType
	const targetOpts = {
		type: THREE.HalfFloatType,
		format: THREE.RGBAFormat,
		minFilter: THREE.NearestFilter, // never blend an encoded style ID
		magFilter: THREE.NearestFilter,
		depthTexture,
		depthBuffer: true,
		stencilBuffer: false,
		generateMipmaps: false,
	}
	// Separate sampled depth from composed's renderbuffer; styling copies depth without a feedback loop or extra blit.
	const data = new THREE.WebGLRenderTarget(2, 2, targetOpts)
	const composed = new THREE.WebGLRenderTarget(2, 2, {
		type: THREE.HalfFloatType,
		format: THREE.RGBAFormat,
		minFilter: THREE.LinearFilter,
		magFilter: THREE.LinearFilter,
		depthBuffer: true,
		stencilBuffer: false,
		generateMipmaps: false,
	})

	const colors = ROLES.map((role) => new THREE.Color(PALETTE[role]))
	const post = new THREE.ShaderMaterial({
		uniforms: {
			tData: { value: data.texture },
			tDepth: { value: depthTexture },
			uRes: { value: new THREE.Vector2(2, 2) },
			uNear: { value: 0.1 },
			uFar: { value: 200 },
			uColors: { value: colors },
			uInk: { value: new THREE.Color(PALETTE.ink) },
			uCream: { value: new THREE.Color(PALETTE.cream) },
			uSky: { value: new THREE.Color(PALETTE.page) },
			uSunTint: { value: new THREE.Color(PALETTE.cream) },
			uShadeTint: { value: new THREE.Color(PALETTE.ink) },
			uBandMix: { value: new THREE.Vector2(0.32, 0.18) },
			uInvProj: { value: new THREE.Matrix4() },
			uInvView: { value: new THREE.Matrix4() },
			uLine: { value: 1 },
			uHatch: { value: 0 },
			uAlpha: { value: 0 },
			uImpact: { value: 0 },
		},
		vertexShader: postVert,
		fragmentShader: postFrag,
		// Enable depth testing so every fullscreen fragment, including sky, replaces destination depth.
		depthTest: true,
		depthFunc: THREE.AlwaysDepth,
		depthWrite: true,
	})
	const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post)
	quad.frustumCulled = false
	const postScene = new THREE.Scene().add(quad)
	const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

	// Bloom: glow-layer objects drawn at quarter size, blurred twice each way, added in the blit.
	const glowOpts = {
		type: THREE.HalfFloatType,
		format: THREE.RGBAFormat,
		minFilter: THREE.LinearFilter,
		magFilter: THREE.LinearFilter,
		depthBuffer: false,
		stencilBuffer: false,
		generateMipmaps: false,
	}
	// The source pass shares the opaque depth, so a glow behind a wall stays hidden.
	const glowSource = new THREE.WebGLRenderTarget(2, 2, {
		...glowOpts,
		depthTexture,
		depthBuffer: true,
	})
	const glowA = new THREE.WebGLRenderTarget(2, 2, glowOpts)
	const glowB = new THREE.WebGLRenderTarget(2, 2, glowOpts)
	const blur = new THREE.ShaderMaterial({
		uniforms: { tImage: { value: null }, uStep: { value: new THREE.Vector2() } },
		vertexShader: postVert,
		fragmentShader: `
			precision highp float;
			varying vec2 vUv;
			uniform sampler2D tImage;
			uniform vec2 uStep;
			void main() {
				vec4 c = texture2D(tImage, vUv) * 0.227;
				c += (texture2D(tImage, vUv + uStep * 1.385) + texture2D(tImage, vUv - uStep * 1.385)) * 0.316;
				c += (texture2D(tImage, vUv + uStep * 3.231) + texture2D(tImage, vUv - uStep * 3.231)) * 0.070;
				gl_FragColor = c;
			}`,
		depthTest: false,
		depthWrite: false,
	})
	const blurQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blur)
	blurQuad.frustumCulled = false
	const blurScene = new THREE.Scene().add(blurQuad)
	const glow = { strength: 1, radius: 1, on: true }
	let glowSize = new THREE.Vector2(2, 2)

	// Final blit, converting to the display's color space exactly once.
	const blit = new THREE.ShaderMaterial({
		uniforms: {
			tImage: { value: composed.texture },
			tGlow: { value: glowA.texture },
			uGlow: { value: 0 },
			uEncode: { value: 1 },
		},
		vertexShader: postVert,
		fragmentShader: `
			precision highp float;
			varying vec2 vUv;
			uniform sampler2D tImage;
			uniform sampler2D tGlow;
			uniform float uGlow;
			uniform float uEncode;
			void main() {
				vec4 image = texture2D(tImage, vUv);
				vec3 c = image.rgb + texture2D(tGlow, vUv).rgb * uGlow;
				// linear -> sRGB
				vec3 lo = c * 12.92;
				vec3 hi = 1.055 * pow(max(c, vec3(0.0031308)), vec3(1.0 / 2.4)) - 0.055;
				vec3 shown = mix(hi, lo, step(c, vec3(0.0031308)));
				gl_FragColor = vec4(mix(c, shown, uEncode) * image.a, image.a);
			}`,
		depthTest: false,
		depthWrite: false,
	})
	const blitQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blit)
	blitQuad.frustumCulled = false
	const blitScene = new THREE.Scene().add(blitQuad)

	function setSize(w, h) {
		renderer.setPixelRatio(pixelRatio)
		renderer.setSize(w, h, false)
		const rw = Math.max(2, Math.floor(w * pixelRatio))
		const rh = Math.max(2, Math.floor(h * pixelRatio))
		data.setSize(rw, rh)
		composed.setSize(rw, rh)
		glowSource.setSize(rw, rh)
		glowSize.set(Math.max(2, Math.floor(rw / 4)), Math.max(2, Math.floor(rh / 4)))
		glowA.setSize(glowSize.x, glowSize.y)
		glowB.setSize(glowSize.x, glowSize.y)
		post.uniforms.uRes.value.set(rw, rh)
	}

	// `light` is optional: { dir: [x, y, z] toward the sun, sun and shade tints, bandMix: [lit, dark] }.
	function setPalette(worldColors = {}) {
		for (let i = 0; i < ROLES.length; i++) colors[i].set(worldColors[ROLES[i]] ?? PALETTE[ROLES[i]])
		post.uniforms.uSky.value.set(worldColors.page ?? PALETTE.page)
		const light = worldColors.light ?? {}
		if (light.dir) LIGHT_WORLD.set(...light.dir).normalize()
		else LIGHT_WORLD.copy(LIGHT_DEFAULT)
		post.uniforms.uSunTint.value.set(light.sun ?? PALETTE.cream)
		post.uniforms.uShadeTint.value.set(light.shade ?? PALETTE.ink)
		post.uniforms.uBandMix.value.set(...(light.bandMix ?? [0.32, 0.18]))
		// `glow` is optional: { strength, radius } for the bloom, per map.
		glow.strength = worldColors.glow?.strength ?? 1
		glow.radius = worldColors.glow?.radius ?? 1
	}

	// `target` (optional) takes the styled frame still linear, for a view drawn inside the next frame (a portal's far side).
	function render(scene, camera, target = null) {
		renderer.info.reset()
		camera.updateMatrixWorld()
		camera.matrixWorldInverse.copy(camera.matrixWorld).invert()
		shared.uLightDir.value.copy(LIGHT_WORLD).transformDirection(camera.matrixWorldInverse)

		// 1. surface facts + depth
		camera.layers.set(OPAQUE_LAYER)
		renderer.setRenderTarget(data)
		renderer.setClearColor(0x000000, 0)
		renderer.clear(true, true, false)
		renderer.render(scene, camera)

		// 2. style the world and copy its depth into the composition target. An impact frame's last frame inverts.
		post.uniforms.uImpact.value = impactFrames > 1 ? 1 : impactFrames === 1 ? -1 : 0
		if (impactFrames > 0 && !target) impactFrames--
		post.uniforms.uNear.value = camera.near
		post.uniforms.uFar.value = camera.far
		post.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse)
		post.uniforms.uInvView.value.copy(camera.matrixWorld)
		renderer.setRenderTarget(composed)
		renderer.render(postScene, postCam)

		// 3. forward effects, depth-tested against the copied opaque depth; an impact frame is two tones and nothing else
		if (post.uniforms.uImpact.value === 0) {
			camera.layers.set(FORWARD_LAYER)
			renderer.render(scene, camera)
			camera.layers.set(OPAQUE_LAYER)
		}

		// 4. bloom from whatever opted into the glow layer
		blit.uniforms.uGlow.value = 0
		if (glow.on && glowTwins > 0 && post.uniforms.uImpact.value === 0) {
			camera.layers.set(GLOW_LAYER)
			renderer.setRenderTarget(glowSource)
			renderer.setClearColor(0x000000, 0)
			renderer.clear(true, false, false)
			renderer.render(scene, camera)
			camera.layers.set(OPAQUE_LAYER)
			for (let pass = 0; pass < 2; pass++)
				for (const [from, to, x, y] of [
					[pass ? glowA : glowSource, glowB, 1, 0],
					[glowB, glowA, 0, 1],
				]) {
					blur.uniforms.tImage.value = from.texture
					blur.uniforms.uStep.value.set(
						(x * glow.radius * (pass + 1)) / glowSize.x,
						(y * glow.radius * (pass + 1)) / glowSize.y,
					)
					renderer.setRenderTarget(to)
					renderer.render(blurScene, postCam)
				}
			blit.uniforms.uGlow.value = glow.strength
		}

		// 5. one conversion to display color space
		renderer.setRenderTarget(target)
		renderer.clear(true, true, false)
		blit.uniforms.uEncode.value = target ? 0 : 1
		renderer.render(blitScene, postCam)
	}

	// Print the next `frames` frames two-tone (the last one inverted): the anime impact frame for the biggest blows.
	let impactFrames = 0
	function impactFrame(frames = 3) {
		impactFrames = Math.max(impactFrames, Math.round(frames))
	}

	function dispose() {
		data.dispose()
		composed.dispose()
		glowSource.dispose()
		glowA.dispose()
		glowB.dispose()
		blur.dispose()
		blurQuad.geometry.dispose()
		depthTexture.dispose()
		post.dispose()
		blit.dispose()
		quad.geometry.dispose()
		blitQuad.geometry.dispose()
		renderer.dispose()
	}

	const setStylePreset = createStylePresets(({ line, hatch, alpha }) => {
		post.uniforms.uLine.value = line
		post.uniforms.uHatch.value = hatch
		post.uniforms.uAlpha.value = alpha ? 1 : 0
	})

	// `glow` is live: { on, strength, radius } (a map or the debug panel may change it).
	return {
		renderer,
		setSize,
		setPalette,
		setStylePreset,
		render,
		impactFrame,
		dispose,
		pixelRatio,
		glow,
	}
}
