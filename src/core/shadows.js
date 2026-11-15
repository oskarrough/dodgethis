import * as THREE from 'three'
import { FORWARD_LAYER, makeStyleMaterial } from './stylepass.js'

// Pooled printed discs restore height cues without shadow-map cost or per-round allocation.

const POOL = 512
const LIFT = 0.014 // above the court line, below the ammo marker
const SOFT_LIFT = 0.08 // soft shadows clear a map's printed roads and seams, under its ground markers

// A soft shape printed on a flat quad. `falloff` shapes alpha from the quad's uv.
const soft = (falloff) =>
	new THREE.ShaderMaterial({
		transparent: true,
		depthWrite: false,
		uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 0 } },
		vertexShader: /* glsl */ `
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
		}`,
		fragmentShader: /* glsl */ `
		uniform vec3 uColor;
		uniform float uOpacity;
		varying vec2 vUv;
		void main() {
			vec2 p = (vUv - 0.5) * 2.0;
			gl_FragColor = vec4(uColor, uOpacity * (${falloff}));
		}`,
	})

// `onGround(x, z)` says where a disc has something to fall on.
// `sun()` (optional) returns a map's light ({ dir, shadow, shadowLength }) and `look` how its
// units are grounded ({ contact, contactReach, contactPad, cast, castWidth, castMax }). Each unit then prints two soft
// shapes instead of one hard disc: a dark contact shadow under its feet, and one cast shadow
// leaning away from the sun in the map's shadow colour. Still pooled prints; no shadow map.
export function createShadows(scene, { onGround = () => true, sun = null, look = {} } = {}) {
	const lit = !!sun
	const geometry = lit
		? new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)
		: new THREE.CircleGeometry(1, 18).rotateX(-Math.PI / 2)
	const layer = (material, order) => {
		const mesh = new THREE.InstancedMesh(geometry, material, POOL)
		mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
		mesh.frustumCulled = false // bounds change with the live roster
		mesh.count = 0
		mesh.visible = false
		if (lit) {
			mesh.layers.set(FORWARD_LAYER)
			mesh.renderOrder = order // over the floor print and its decals, under every mark
		}
		scene.add(mesh)
		return mesh
	}
	// The cast shadow is densest at the feet and thins toward its tip; the contact shadow is a
	// small dark core that fades out just past the foot disc.
	const casts = lit
		? layer(soft('smoothstep(1.0, 0.72, length(p)) * mix(1.0, 0.6, vUv.x)'), -3.2)
		: null
	const discs = layer(
		lit
			? soft('smoothstep(1.0, 0.55, length(p))')
			: makeStyleMaterial('courtShade', { flat: true }),
		-3.1,
	)
	const pose = new THREE.Object3D()
	const dark = new THREE.Color()

	let used = 0
	// `height` is how tall the caster stands; only a sun casts by it.
	function cast(x, y, z, radius, height = 0) {
		if (used >= POOL || !onGround(x, z)) return // nothing to fall on out over the void
		// Shrink with height so high shots still read when caster and shadow overlap.
		const lift = Math.min(Math.max(y, 0) / 8, 1)
		const r = Math.max(0.05, radius * (1 - lift * 0.35))
		pose.rotation.y = 0
		const l = lit ? sun() : null
		const flat = l ? Math.hypot(l.dir[0], l.dir[2]) || 1 : 1
		const ux = l ? -l.dir[0] / flat : 0
		const uz = l ? -l.dir[2] / flat : 0
		// The contact shadow sits a touch downsun, so it runs into the cast shadow.
		pose.position.set(x + ux * r * 0.2, lit ? SOFT_LIFT : LIFT, z + uz * r * 0.2)
		pose.scale.setScalar(lit ? r * (look.contactReach ?? 1.3) + (look.contactPad ?? 0.35) : r)
		pose.updateMatrix()
		discs.setMatrixAt(used, pose.matrix)
		if (lit) {
			const ly = l.dir[1]
			// From under the feet to where the head's shadow lands; a lifted caster's shadow slides away.
			// A low sun would throw it across the court, so it stops at `castMax` times the caster's height.
			const reach = Math.min((l.shadowLength / Math.max(0.05, ly)) * flat, look.castMax ?? 1.2)
			const half = (reach * height) / 2 + r * 0.5
			const slide = reach * Math.max(y, 0)
			pose.position.set(
				x + ux * (half - r * 0.6 + slide),
				SOFT_LIFT,
				z + uz * (half - r * 0.6 + slide),
			)
			pose.rotation.y = Math.atan2(-uz, ux)
			pose.scale.set(half, 1, r * (look.castWidth ?? 1))
			pose.updateMatrix()
			casts.setMatrixAt(used, pose.matrix)
		}
		used++
	}

	// Called once per frame; `draw(cast)` casts this frame's discs, or is null for an empty scene.
	function update(draw) {
		used = 0
		if (lit) {
			const l = sun()
			casts.material.uniforms.uColor.value.set(l.shadow)
			casts.material.uniforms.uOpacity.value = look.cast ?? 0.5
			// The contact shadow is the cast colour pulled most of the way to black.
			discs.material.uniforms.uColor.value.copy(dark.set(l.shadow).multiplyScalar(0.3))
			discs.material.uniforms.uOpacity.value = look.contact ?? 0.6
		}
		draw?.(cast)
		for (const mesh of [discs, casts]) {
			if (!mesh) continue
			mesh.count = used
			mesh.visible = used > 0
			if (used) mesh.instanceMatrix.needsUpdate = true
		}
	}

	function dispose() {
		for (const mesh of [discs, casts]) {
			if (!mesh) continue
			scene.remove(mesh)
			mesh.dispose()
			mesh.material.dispose()
		}
		geometry.dispose()
	}

	return { update, dispose }
}
