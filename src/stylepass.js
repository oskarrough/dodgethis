import * as THREE from 'three'
import { PALETTE } from './style.js'

// The game's only renderer: a geometry-first surface-data pass, then one
// full-screen shader that decides what the world is made of.
//
//   opaque geometry ──► data buffer (shade, style id, view normal xy) + depth
//                              │
//                              ▼
//                    one style shader ──► flat color, navy ink edges,
//                                          cream highlight, halftone shadow
//                              │
//                              ▼
//        forward pass (trails, preview, labels, corpses, shield)
//        rendered against the SAME depth buffer, so they occlude correctly
//
// The palette doubles as the style-ID table: a material's color is looked up in
// PALETTE, and its index becomes the discrete ID written to the buffer. That is
// why every module was moved onto semantic roles first — geometry names a role,
// the renderer decides how a role looks.

const ROLES = Object.keys(PALETTE)
// Keyed by the round-tripped hex, not the raw literal: Three converts material
// colors into its working space, so `getHex()` must be compared against a value
// that took the same trip or every lookup silently misses.
const ROLE_INDEX = new Map(ROLES.map((role, i) => [new THREE.Color(PALETTE[role]).getHex(), i]))

// Sun direction in world space. The style pass only needs one light.
const LIGHT_WORLD = new THREE.Vector3(0.4, 0.85, 0.35).normalize()
const shared = { uLightDir: { value: new THREE.Vector3(0, 1, 0) } }

const dataVert = /* glsl */ `
varying vec3 vNormalV;
varying vec2 vInstanceStyle; // x = style id (<0 when the material's own id wins), y = flatness
void main() {
	vec3 transformed = position;
	vec3 objectNormal = normal;
	// Pooled effects are instanced. Without this the whole pool collapses onto the
	// mesh's origin — one large shape at world centre, once per burst.
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

// shade, style id, and the two view-space normal channels that survive
// reconstruction (z is recovered in the style shader from their length).
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
	// An instance may override the material's role, so one pooled mesh can draw
	// marks in two roles at once.
	bool perInstance = vInstanceStyle.x >= 0.0;
	float id = perInstance ? vInstanceStyle.x : uStyleId;
	float flatness = perInstance ? vInstanceStyle.y : uFlat;
	// Flat surfaces (court lines, stickers, markers) opt out of shading and
	// halftone entirely — they are printed ON the world, not lit by it.
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
	float z = texture2D(tDepth, vUv).x;
	bool sky = z >= 0.99999;
	if (sky) { gl_FragColor = vec4(uSky, 1.0); return; }

	float d = linDepth(z);
	float o = 1.2 * sc;
	vec2 ox = vec2(o, 0.0) * px, oy = vec2(0.0, o) * px;
	float zl = texture2D(tDepth, vUv - ox).x, zr = texture2D(tDepth, vUv + ox).x;
	float zu = texture2D(tDepth, vUv + oy).x, zd = texture2D(tDepth, vUv - oy).x;
	vec4 sl = texture2D(tData, vUv - ox), sr = texture2D(tData, vUv + ox);
	vec4 su = texture2D(tData, vUv + oy), sd = texture2D(tData, vUv - oy);

	// Silhouettes from an inverse-depth laplacian. 1/d is affine across ANY
	// plane, including the court seen at a grazing angle, so a flat floor has a
	// second difference of zero and never draws a false outline. Dividing by 1/d
	// makes the test scale invariant, so a far arrow outlines as crisply as a
	// near one.
	float iw = 1.0 / d;
	float lap = abs(1.0 / linDepth(zl) + 1.0 / linDepth(zr) - 2.0 * iw)
	          + abs(1.0 / linDepth(zu) + 1.0 / linDepth(zd) - 2.0 * iw);
	float edge = smoothstep(0.06, 0.28, lap / (iw + 1e-7));
	// Creases from normal discontinuity, for folds that share a depth.
	float nEdge = length(sl.ba - sr.ba) + length(su.ba - sd.ba);
	edge = max(edge, smoothstep(0.45, 0.9, nEdge));

	// Take the ink color from the front-most neighbour so an outline belongs to
	// the nearer shape rather than smearing the background's role across it.
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

		// One halftone rule, anchored in world space so the dots sit ON the
		// surface and do not swim when the camera moves. Spacing steps in powers
		// of two with distance to keep on-screen density roughly constant, which
		// is what stops the pattern from crawling into moire far away.
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

	// Ink the edge last so nothing prints over the outline. A little stable
	// noise varies the weight, which reads as a pen rather than a filter.
	float ew = 0.78 + 0.32 * vnoise(gl_FragCoord.xy * 0.35);
	col = mix(col, mix(uInk, roleColor(inkId) * 0.35, 0.25), clamp(edge * ew, 0.0, 1.0));
	gl_FragColor = vec4(col, 1.0);
}`

// A material that writes surface data instead of a final color. `role` names a
// palette entry; `flat` opts a surface out of shading and halftone.
export function makeStyleMaterial(role, { flat = false, side = THREE.FrontSide } = {}) {
	const id = ROLES.indexOf(role)
	return new THREE.ShaderMaterial({
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

// Per-instance style override, packed into an InstancedMesh's instanceColor:
// red carries the style ID, green the flatness flag. An instance cannot have its
// own uniform, so this is how one pooled mesh draws marks in several roles.
export function instanceStyle(role, { flat = true } = {}) {
	return new THREE.Color(Math.max(0, ROLES.indexOf(role)) / 255, flat ? 1 : 0, 0)
}

const OPAQUE_LAYER = 0
const FORWARD_LAYER = 1

// Anything that cannot describe itself as an opaque surface — trails, the dashed
// preview, portal labels and sparkles, fading corpses, the godmode bubble — is
// composited forward instead of being flattened into the data buffer.
function isForward(object) {
	if (object.isLine || object.isSprite || object.isPoints) return true
	const m = object.material
	return !!m && (m.transparent === true || m.opacity < 1)
}

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
	// Fill rate, not scene complexity, is what this pass costs. 1.5 keeps a
	// high-DPI laptop honest without visibly softening the ink.
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
	// Three targets, because a framebuffer may not sample the depth texture it is
	// also writing to — that feedback loop renders black, with no error reported.
	//   data     surface facts, and the depth every later pass reuses
	//   styled   the post shader's output; it samples depth, so must NOT attach it
	//   composed styled copied in, then forward effects depth-tested against that
	//            same depth texture, which is what makes them occlude correctly
	const data = new THREE.WebGLRenderTarget(2, 2, targetOpts)
	const styled = new THREE.WebGLRenderTarget(2, 2, {
		type: THREE.HalfFloatType,
		format: THREE.RGBAFormat,
		minFilter: THREE.LinearFilter,
		magFilter: THREE.LinearFilter,
		depthBuffer: false,
		stencilBuffer: false,
		generateMipmaps: false,
	})
	const composed = new THREE.WebGLRenderTarget(2, 2, {
		...targetOpts,
		minFilter: THREE.LinearFilter,
		magFilter: THREE.LinearFilter,
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
		depthTest: false,
		depthWrite: false,
	})
	const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post)
	quad.frustumCulled = false
	const postScene = new THREE.Scene().add(quad)
	const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

	// Plain copy, styled -> composed, so the forward pass joins it on a target
	// that owns the shared depth buffer.
	const copy = new THREE.ShaderMaterial({
		uniforms: { tImage: { value: styled.texture } },
		vertexShader: postVert,
		fragmentShader: `
			precision highp float;
			varying vec2 vUv;
			uniform sampler2D tImage;
			void main() { gl_FragColor = vec4(texture2D(tImage, vUv).rgb, 1.0); }`,
		depthTest: false,
		depthWrite: false,
	})
	const copyQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copy)
	copyQuad.frustumCulled = false
	const copyScene = new THREE.Scene().add(copyQuad)

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
		styled.setSize(rw, rh)
		composed.setSize(rw, rh)
		post.uniforms.uRes.value.set(rw, rh)
	}

	// Materials are swapped lazily, so a round spawning new units or arrows needs
	// no explicit registration. The original material is kept for disposal by its
	// owner; we only ever add ours alongside.
	const converted = new WeakMap() // original material -> its style material
	const seen = new WeakSet() // objects already routed, so this stays O(new)
	function adopt(object) {
		if (seen.has(object)) return
		seen.add(object)
		const m = object.material
		if (!m) return
		if (isForward(object)) {
			object.layers.set(FORWARD_LAYER) // keeps its own material
			return
		}
		let styled = converted.get(m)
		if (!styled) {
			const key = m.color?.getHex?.()
			const roleName = ROLE_INDEX.has(key) ? ROLES[ROLE_INDEX.get(key)] : 'cream'
			styled = makeStyleMaterial(roleName, { flat: !!m.isMeshBasicMaterial, side: m.side })
			converted.set(m, styled)
		}
		object.layers.set(OPAQUE_LAYER)
		object.material = styled
	}

	function render(scene, camera) {
		renderer.info.reset()
		scene.traverse((o) => {
			if (o.isMesh || o.isLine || o.isSprite || o.isPoints) adopt(o)
		})
		camera.updateMatrixWorld()
		camera.matrixWorldInverse.copy(camera.matrixWorld).invert()
		shared.uLightDir.value.copy(LIGHT_WORLD).transformDirection(camera.matrixWorldInverse)

		// 1. surface facts + depth
		camera.layers.set(OPAQUE_LAYER)
		renderer.setRenderTarget(data)
		renderer.setClearColor(0x000000, 0)
		renderer.clear(true, true, false)
		renderer.render(scene, camera)

		// 2. decide what it is made of
		post.uniforms.uNear.value = camera.near
		post.uniforms.uFar.value = camera.far
		post.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse)
		post.uniforms.uInvView.value.copy(camera.matrixWorld)
		renderer.setRenderTarget(styled)
		renderer.clear(true, false, false)
		renderer.render(postScene, postCam)

		// 3. move it onto the target that owns the depth written in step 1
		renderer.setRenderTarget(composed)
		renderer.clear(true, false, false) // colour only — that depth is the point
		renderer.render(copyScene, postCam)

		// 4. forward effects, depth-tested against the world they sit in
		camera.layers.set(FORWARD_LAYER)
		renderer.render(scene, camera)
		camera.layers.set(OPAQUE_LAYER)

		// 5. one conversion to display color space
		renderer.setRenderTarget(null)
		renderer.clear(true, true, false)
		renderer.render(blitScene, postCam)
	}

	function dispose() {
		data.dispose()
		styled.dispose()
		composed.dispose()
		depthTexture.dispose()
		post.dispose()
		copy.dispose()
		blit.dispose()
		quad.geometry.dispose()
		copyQuad.geometry.dispose()
		blitQuad.geometry.dispose()
		renderer.dispose()
	}

	return { renderer, setSize, render, dispose, pixelRatio }
}
