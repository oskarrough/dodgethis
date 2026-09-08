import * as THREE from 'three'
import { PALETTE } from './style.js'

// Opaque shade/role/normal/depth → ink, highlights and halftone → layer-1 effects against copied depth; creators own materials.

const ROLES = Object.keys(PALETTE)
// Compatibility at construction boundaries that still accept a palette color.
const ROLE_BY_COLOR = new Map(ROLES.map((role) => [new THREE.Color(PALETTE[role]).getHex(), role]))
export function styleRoleFromColor(color) {
	return ROLE_BY_COLOR.get(new THREE.Color(color).getHex()) ?? 'cream'
}

// Sun direction in world space. The style pass only needs one light.
const LIGHT_WORLD = new THREE.Vector3(0.4, 0.85, 0.35).normalize()
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
uniform mat4 uInvProj;
uniform mat4 uInvView;

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
	if (sky) { gl_FragColor = vec4(uSky, 1.0); return; }

	float d = linDepth(z);
	float o = 1.2 * sc;
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
		col = mix(base, uCream, band * 0.32);
		col = mix(col, uInk, (1.0 - band) * 0.18);

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
		col = mix(col, uInk, dots * 0.30);
	}

	// Ink the edge last so nothing prints over the outline; stable noise varies the weight so it reads as a pen, not a filter.
	float ew = 0.78 + 0.32 * vnoise(gl_FragCoord.xy * 0.35);
	col = mix(col, mix(uInk, roleColor(inkId) * 0.35, 0.25), clamp(edge * ew, 0.0, 1.0));
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

// Pack per-instance role ID in red and flatness in green: instances cannot own uniforms.
export function instanceStyle(role, { flat = true } = {}) {
	return new THREE.Color(Math.max(0, ROLES.indexOf(role)) / 255, flat ? 1 : 0, 0)
}

const OPAQUE_LAYER = 0
export const FORWARD_LAYER = 1

export function createStylePass(canvas) {
	const renderer = new THREE.WebGLRenderer({
		canvas,
		antialias: false,
		stencil: false,
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
			uInvProj: { value: new THREE.Matrix4() },
			uInvView: { value: new THREE.Matrix4() },
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

	// Final blit, converting to the display's color space exactly once.
	const blit = new THREE.ShaderMaterial({
		uniforms: { tImage: { value: composed.texture } },
		vertexShader: postVert,
		fragmentShader: `
			precision highp float;
			varying vec2 vUv;
			uniform sampler2D tImage;
			void main() {
				vec3 c = texture2D(tImage, vUv).rgb;
				// linear -> sRGB
				vec3 lo = c * 12.92;
				vec3 hi = 1.055 * pow(max(c, vec3(0.0031308)), vec3(1.0 / 2.4)) - 0.055;
				gl_FragColor = vec4(mix(hi, lo, step(c, vec3(0.0031308))), 1.0);
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
		post.uniforms.uRes.value.set(rw, rh)
	}

	function setPalette(worldColors = {}) {
		for (let i = 0; i < ROLES.length; i++) colors[i].set(worldColors[ROLES[i]] ?? PALETTE[ROLES[i]])
		post.uniforms.uSky.value.set(worldColors.page ?? PALETTE.page)
	}

	function render(scene, camera) {
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

		// 2. style the world and copy its depth into the composition target
		post.uniforms.uNear.value = camera.near
		post.uniforms.uFar.value = camera.far
		post.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse)
		post.uniforms.uInvView.value.copy(camera.matrixWorld)
		renderer.setRenderTarget(composed)
		renderer.render(postScene, postCam)

		// 3. forward effects, depth-tested against the copied opaque depth
		camera.layers.set(FORWARD_LAYER)
		renderer.render(scene, camera)
		camera.layers.set(OPAQUE_LAYER)

		// 4. one conversion to display color space
		renderer.setRenderTarget(null)
		renderer.clear(true, true, false)
		renderer.render(blitScene, postCam)
	}

	function dispose() {
		data.dispose()
		composed.dispose()
		depthTexture.dispose()
		post.dispose()
		blit.dispose()
		quad.geometry.dispose()
		blitQuad.geometry.dispose()
		renderer.dispose()
	}

	return { renderer, setSize, setPalette, render, dispose, pixelRatio }
}
