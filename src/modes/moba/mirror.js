import * as THREE from 'three'
import { FORWARD_LAYER } from '../../core/stylepass.js'

// A polished floor that mirrors what stands on it, like Syd Mead's halls on the Reference shelf:
// the styled scene drawn again from a camera under the floor (the same math as three's Reflector,
// through the style pass), dimmed into a pale stone and broken by faint grid lines so a reflection
// never reads as a second unit. It renders only while its slab is on screen.
//
// `o`: { x, z, size, y, scale (fraction of the screen's resolution), tint, strength, grid, line, ripple }
export function createMirror(scene, renderStyled, o) {
	const target = new THREE.WebGLRenderTarget(2, 2, {
		type: THREE.HalfFloatType,
		minFilter: THREE.LinearFilter,
		magFilter: THREE.LinearFilter,
		generateMipmaps: false,
	})
	const textureMatrix = new THREE.Matrix4()
	const material = new THREE.ShaderMaterial({
		uniforms: {
			uReflection: { value: target.texture },
			uTextureMatrix: { value: textureMatrix },
			uTint: { value: new THREE.Color(o.tint) },
			uStrength: { value: o.strength },
			uGrid: { value: o.grid },
			uLine: { value: o.line },
			uRipple: { value: o.ripple },
			uHalf: { value: o.size / 2 },
			uTime: { value: 0 },
			uLive: { value: 0 },
		},
		vertexShader: /* glsl */ `
uniform mat4 uTextureMatrix;
varying vec4 vMirror;
varying vec2 vLocal;
void main() {
	vMirror = uTextureMatrix * vec4(position, 1.0);
	vLocal = position.xy;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
		fragmentShader: /* glsl */ `
uniform sampler2D uReflection;
uniform vec3 uTint;
uniform float uStrength, uGrid, uLine, uRipple, uHalf, uTime, uLive;
varying vec4 vMirror;
varying vec2 vLocal;
void main() {
	vec2 uv = vMirror.xy / vMirror.w;
	// A slow shimmer across the polish, so the picture in it never holds still like a unit.
	uv.x += sin(vLocal.y * 2.1 + uTime * 0.8) * uRipple;
	uv.y += sin(vLocal.x * 1.7 - uTime * 0.6) * uRipple;
	vec3 seen = texture2D(uReflection, uv).rgb;
	vec3 col = mix(uTint, seen, uStrength * uLive);
	// Thin joints between the polished slabs, and a darker border where the slab meets the court.
	vec2 cell = abs(fract(vLocal / uGrid + 0.5) - 0.5) * uGrid;
	float joint = 1.0 - smoothstep(uLine * 0.5, uLine * 1.5, min(cell.x, cell.y));
	float border = 1.0 - smoothstep(uLine, uLine * 3.0, uHalf - max(abs(vLocal.x), abs(vLocal.y)));
	col *= 1.0 - 0.12 * max(joint, border);
	gl_FragColor = vec4(col, 1.0);
}`,
		depthWrite: false,
	})
	const geometry = new THREE.PlaneGeometry(o.size, o.size)
	const mesh = new THREE.Mesh(geometry, material)
	mesh.rotation.x = -Math.PI / 2
	mesh.position.set(o.x, o.y, o.z)
	mesh.layers.set(FORWARD_LAYER)
	mesh.renderOrder = -3.3
	scene.add(mesh)
	mesh.updateMatrixWorld()

	const virtual = new THREE.PerspectiveCamera()
	const normal = new THREE.Vector3(0, 1, 0)
	const at = new THREE.Vector3(o.x, o.y, o.z)
	const plane = new THREE.Plane()
	const clip = new THREE.Vector4()
	const q = new THREE.Vector4()
	const eye = new THREE.Vector3()
	const view = new THREE.Vector3()
	const look = new THREE.Vector3()
	const aim = new THREE.Vector3()
	const rotation = new THREE.Matrix4()
	const frustum = new THREE.Frustum()
	const box = new THREE.Box3(
		new THREE.Vector3(o.x - o.size / 2, o.y - 0.1, o.z - o.size / 2),
		new THREE.Vector3(o.x + o.size / 2, o.y + 0.1, o.z + o.size / 2),
	)
	const drawing = new THREE.Vector2()
	const viewProjection = new THREE.Matrix4()

	function update(dt, camera, renderer) {
		material.uniforms.uTime.value += dt
		camera.updateMatrixWorld()
		frustum.setFromProjectionMatrix(
			viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
		)
		eye.setFromMatrixPosition(camera.matrixWorld)
		if (!renderStyled || !frustum.intersectsBox(box) || eye.y <= o.y) {
			material.uniforms.uLive.value = 0
			return
		}
		renderer.getDrawingBufferSize(drawing)
		const w = Math.max(2, Math.floor(drawing.x * o.scale))
		const h = Math.max(2, Math.floor(drawing.y * o.scale))
		if (target.width !== w || target.height !== h) target.setSize(w, h)

		// The camera mirrored through the floor's plane.
		view.subVectors(at, eye).reflect(normal).negate().add(at)
		rotation.extractRotation(camera.matrixWorld)
		look.set(0, 0, -1).applyMatrix4(rotation).add(eye)
		aim.subVectors(at, look).reflect(normal).negate().add(at)
		virtual.position.copy(view)
		virtual.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal)
		virtual.lookAt(aim)
		virtual.near = camera.near
		virtual.far = camera.far
		virtual.updateMatrixWorld()
		virtual.matrixWorldInverse.copy(virtual.matrixWorld).invert()
		virtual.projectionMatrix.copy(camera.projectionMatrix)

		textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
		textureMatrix.multiply(virtual.projectionMatrix)
		textureMatrix.multiply(virtual.matrixWorldInverse)
		textureMatrix.multiply(mesh.matrixWorld)

		// Bend the near plane onto the floor so nothing under it shows in the mirror.
		plane.setFromNormalAndCoplanarPoint(normal, at).applyMatrix4(virtual.matrixWorldInverse)
		clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant)
		const e = virtual.projectionMatrix.elements
		q.x = (Math.sign(clip.x) + e[8]) / e[0]
		q.y = (Math.sign(clip.y) + e[9]) / e[5]
		q.z = -1
		q.w = (1 + e[10]) / e[14]
		clip.multiplyScalar(2 / clip.dot(q))
		e[2] = clip.x
		e[6] = clip.y
		e[10] = clip.z + 1
		e[14] = clip.w
		virtual.projectionMatrixInverse.copy(virtual.projectionMatrix).invert()

		mesh.visible = false
		renderStyled(target, virtual)
		mesh.visible = true
		material.uniforms.uLive.value = 1
	}

	return {
		mesh,
		update,
		dispose() {
			scene.remove(mesh)
			target.dispose()
			material.dispose()
			geometry.dispose()
		},
	}
}
