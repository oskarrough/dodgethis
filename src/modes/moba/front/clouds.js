import { tune } from './tune.js'

// The cloud reveal: soft cloud rolls in from the rim as the crane rises, then a hole opens
// around your hero and spreads outward, fog-of-war style. Drawn small and upscaled, so it
// stays soft and cheap. Returns null without WebGL2; the descent then keeps its plain fade.
const vertex = `#version 300 es
void main() {
	vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
	gl_Position = vec4(p, 0.0, 1.0);
}`

const fragment = `#version 300 es
precision highp float;
uniform vec2 res, hole, drift;
uniform float time, cover, part, rise, scale, warp, soft, rough, zoom, lift, bloom;
uniform vec3 light, shade;
out vec4 color;

float hash(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}
float noise(vec2 p) {
	vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
	float v = 0.0, a = 1.0, sum = 0.0;
	mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
	for (int i = 0; i < 4; i++) {
		v += a * noise(p);
		sum += a;
		p = m * p;
		a *= 0.45;
	}
	return v / sum;
}

void main() {
	vec2 uv = (gl_FragCoord.xy - 0.5 * res) / res.y;
	vec2 half_ = vec2(0.5 * res.x / res.y, 0.5);
	// Flying through: the field swells away from the hole as it opens, and slides down as you rise.
	vec2 p = (hole + (uv - hole) / (1.0 + part * zoom)) * scale + vec2(0.0, rise * lift) + time * drift;
	vec2 q = vec2(fbm(p + time * drift.yx), fbm(p + vec2(5.2, 1.3) - time * drift));
	float n = fbm(p + warp * q);
	float lit = fbm(p + warp * q + vec2(-0.08, 0.08));
	float wobble = (n - 0.5) * 2.0 * rough;

	// Roll in from the rim, the bottom first.
	vec2 e = uv / half_;
	float rim = clamp(length(e) * 0.55 + (0.5 - 0.5 * e.y) * 0.45, 0.0, 1.0);
	float t = mix(1.0 + rough + soft, -rough - soft, cover);
	float fill = smoothstep(t - soft, t + soft, rim + wobble);

	// Part around the hero, outward to the farthest corner.
	float far = length(abs(hole) + half_);
	float radius = mix(-rough - soft, far + rough + soft, part);
	float open = smoothstep(radius - soft, radius + soft, length(uv - hole) + wobble);

	float a = fill * open;
	float tone = smoothstep(0.15, 0.85, 0.7 + (n - 0.5) * 2.6 + (lit - n) * 3.0);
	vec3 c = mix(shade, light, tone);
	// Premultiplied, with a little extra light at the soft edge: it blooms over the isle.
	color = vec4(c * a + light * bloom * 4.0 * a * (1.0 - a), a);
}`

const uniforms = [
	'res',
	'hole',
	'drift',
	'time',
	'cover',
	'part',
	'rise',
	'scale',
	'warp',
	'soft',
	'rough',
	'zoom',
	'lift',
	'bloom',
	'light',
	'shade',
]

const rgb = (hex) => {
	const v = parseInt(String(hex).replace('#', ''), 16) || 0
	return [(v >> 16) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]
}

export function createClouds(map) {
	const el = document.createElement('canvas')
	el.className = 'front-clouds'
	el.setAttribute('aria-hidden', 'true')
	const gl = el.getContext('webgl2', {
		alpha: true,
		premultipliedAlpha: true,
		antialias: false,
		depth: false,
		stencil: false,
	})
	if (!gl) return null
	const shader = (type, source) => {
		const s = gl.createShader(type)
		gl.shaderSource(s, source)
		gl.compileShader(s)
		return s
	}
	const program = gl.createProgram()
	gl.attachShader(program, shader(gl.VERTEX_SHADER, vertex))
	gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment))
	gl.linkProgram(program)
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null
	gl.useProgram(program)
	const at = Object.fromEntries(
		uniforms.map((name) => [name, gl.getUniformLocation(program, name)]),
	)
	gl.clearColor(0, 0, 0, 0)
	let blank = false

	return {
		el,
		// `cover` 0–1 rolls the cloud in, `part` 0–1 opens it around `hole` (screen units:
		// height 1, centre 0, y up); `rise` 0–1 is the crane's climb, `time` drift seconds.
		draw({ cover, part, rise, time, hole }) {
			const c = tune.loading.clouds
			const scale = Math.max(0.05, Math.min(1, c.resolution))
			const w = Math.max(1, Math.round(el.clientWidth * devicePixelRatio * scale))
			const h = Math.max(1, Math.round(el.clientHeight * devicePixelRatio * scale))
			if (el.width !== w || el.height !== h) {
				el.width = w
				el.height = h
				gl.viewport(0, 0, w, h)
				blank = false
			}
			if (cover <= 0 || part >= 1) {
				if (!blank) gl.clear(gl.COLOR_BUFFER_BIT)
				blank = true
				return
			}
			blank = false
			const [light, shade] = c.color[map] ?? c.color.overthrow
			gl.uniform2f(at.res, w, h)
			gl.uniform2f(at.hole, hole.x, hole.y)
			gl.uniform2f(at.drift, c.drift[0], c.drift[1])
			gl.uniform1f(at.time, time)
			gl.uniform1f(at.cover, cover)
			gl.uniform1f(at.part, part)
			gl.uniform1f(at.rise, rise)
			gl.uniform1f(at.scale, c.scale)
			gl.uniform1f(at.warp, c.warp)
			gl.uniform1f(at.soft, Math.max(0.005, c.soft))
			gl.uniform1f(at.rough, c.rough)
			gl.uniform1f(at.zoom, c.zoom)
			gl.uniform1f(at.lift, c.lift)
			gl.uniform1f(at.bloom, c.bloom)
			gl.uniform3fv(at.light, rgb(light))
			gl.uniform3fv(at.shade, rgb(shade))
			gl.drawArrays(gl.TRIANGLES, 0, 3)
		},
		dispose() {
			gl.getExtension('WEBGL_lose_context')?.loseContext()
			el.remove()
		},
	}
}
