import * as THREE from 'three'
import { FORWARD_LAYER } from '../../core/stylepass.js'

// The effects kit: short-lived world marks any view composes (ground ring, light column, shell),
// the shell and link helpers for marks a view keeps, and `createImpacts`, which turns an ability's
// `impact` recipe (its tune file) into kit marks, juice, a hit number and distance-scaled shake.
const easeOut = (x) => 1 - (1 - x) ** 3

const shellVert = `
varying vec3 vNormal;
varying vec3 vView;
void main() {
	vec4 world = modelViewMatrix * vec4(position, 1.0);
	vNormal = normalize(normalMatrix * normal);
	vView = normalize(-world.xyz);
	gl_Position = projectionMatrix * world;
}`
const shellFrag = `
uniform vec3 uColor;
uniform float uOpacity;
varying vec3 vNormal;
varying vec3 vView;
void main() {
	float rim = pow(1.0 - abs(dot(vNormal, vView)), 2.0);
	gl_FragColor = vec4(uColor, uOpacity * (0.15 + 0.85 * rim));
}`

// A see-through shell, faint face-on and bright at the rim; `uniforms.uOpacity` fades it.
export function shellMaterial(color, opacity = 1) {
	return new THREE.ShaderMaterial({
		uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
		vertexShader: shellVert,
		fragmentShader: shellFrag,
		transparent: true,
		depthWrite: false,
	})
}

// A see-through flat colour for marks drawn over the style pass.
export function glowMaterial(color, opacity = 1) {
	return new THREE.MeshBasicMaterial({ color, opacity, transparent: true, depthWrite: false })
}

// Stretch a unit box (`linkGeometry`) from one ground point to another at height y.
export const linkGeometry = () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5)
export function link(mesh, from, to, y, width) {
	const dx = to.x - from.x,
		dz = to.z - from.z
	mesh.position.set(from.x, y, from.z)
	mesh.rotation.set(0, Math.atan2(dx, dz), 0)
	mesh.scale.set(width, width, Math.hypot(dx, dz))
	mesh.visible = true
}

export function createEffects(parent) {
	const rings = new Map() // ring width → geometry
	const ringOf = (width) =>
		rings.get(width) ??
		rings.set(width, new THREE.RingGeometry(1 - width, 1, 64).rotateX(-Math.PI / 2)).get(width)
	const column = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0)
	const sphere = new THREE.SphereGeometry(1, 32, 20)
	const live = [] // { mesh, age, life, step(k, mesh) }

	function add(geometry, material, at, life, step) {
		const mesh = new THREE.Mesh(geometry, material)
		mesh.layers.set(FORWARD_LAYER)
		mesh.position.set(at.x, 0, at.z)
		parent.add(mesh)
		const effect = { mesh, age: 0, life, step }
		live.push(effect)
		step(0, mesh)
		return effect
	}

	return {
		// A flat ring that grows from `from` to `to` metres and fades: shockwaves, landings, cracks.
		ring(at, { color, from = 0.5, to = 2, life = 0.4, width = 0.12, y = 0.04, opacity = 1 }) {
			add(ringOf(width), glowMaterial(color), at, life, (k, mesh) => {
				mesh.position.y = y
				mesh.scale.setScalar(from + (to - from) * easeOut(k))
				mesh.material.opacity = opacity * (1 - k)
			})
		},
		// A shaft of light that rises and thins.
		column(at, { color, radius = 0.55, height = 2.4, life = 0.45, opacity = 0.7 }) {
			add(column, glowMaterial(color), at, life, (k, mesh) => {
				const r = radius * (1 - 0.6 * k)
				mesh.scale.set(r, height * (0.4 + 0.6 * easeOut(k)), r)
				mesh.material.opacity = opacity * (1 - k) ** 2
			})
		},
		// A shell that swells and fades: a shield breaking, a blast.
		shell(at, { color, from = 1, to = 1.9, life = 0.35, y = 1, opacity = 1.4 }) {
			add(sphere, shellMaterial(color), at, life, (k, mesh) => {
				mesh.position.y = y
				mesh.scale.setScalar(from + (to - from) * easeOut(k))
				mesh.material.uniforms.uOpacity.value = opacity * (1 - k) ** 2
			})
		},
		update(dt) {
			for (let i = live.length - 1; i >= 0; i--) {
				const effect = live[i]
				effect.age += dt
				const k = Math.min(1, effect.age / effect.life)
				effect.step(k, effect.mesh)
				if (k < 1) continue
				parent.remove(effect.mesh)
				effect.mesh.material.dispose()
				live.splice(i, 1)
			}
		},
		reset() {
			for (const effect of live) {
				parent.remove(effect.mesh)
				effect.mesh.material.dispose()
			}
			live.length = 0
		},
		dispose() {
			this.reset()
			for (const geometry of [...rings.values(), column, sphere]) geometry.dispose()
		},
	}
}

// A hit with an `impact` recipe: the first hit of an ability in a tick is the main one, later ones
// in the same tick (splash) play at `recipe.splash` scale. Periodic ticks play none.
export function createImpacts({ effects, juice, camera, pop }) {
	const main = new Map() // `${source}:${ability}` → tick of its main hit
	return function hit(fact, recipe, { unit, listener, tick }) {
		if (!recipe || fact.periodic || !fact.point) return
		const key = `${fact.source}:${fact.ability}`
		const scale = main.get(key) === tick ? (recipe.splash ?? 1) : 1
		main.set(key, tick)
		const at = unit?.body.mesh?.position ?? fact.point
		for (const ring of recipe.rings ?? [])
			effects?.ring(at, { ...ring, from: ring.from * scale, to: ring.to * scale })
		if (recipe.column) effects?.column(at, recipe.column)
		if (recipe.burst)
			juice.burst(
				{ x: at.x, y: 0.3, z: at.z },
				{ x: 0, y: 1, z: 0 },
				{
					...recipe.burst,
					count: Math.round(recipe.burst.count * scale),
				},
			)
		if (unit && recipe.flash) juice.flash(unit.body.visual, recipe.flash)
		if (unit && recipe.squash) {
			unit.body.squash(recipe.squash * scale)
			unit.body.wobble?.(fact.direction)
		}
		if (recipe.number && fact.damage >= 0.5)
			pop?.(Math.round(fact.damage), at, {
				color: recipe.number.color,
				scale: recipe.number.scale * scale,
				crit: scale === 1,
			})
		if (recipe.shake && listener) {
			const d = Math.hypot(listener.x - at.x, listener.z - at.z)
			const falloff = Math.max(0, 1 - d / recipe.shake.range)
			if (falloff > 0) camera.shake(recipe.shake.amount * scale * falloff)
		}
	}
}
