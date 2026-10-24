import * as THREE from 'three'
import { FORWARD_LAYER } from '../../core/stylepass.js'

// The effects kit: short-lived world marks any view composes (ground ring, light column, shell, airbrushed flare, smear),
// the shell and link helpers for marks a view keeps, and `createImpacts`, which turns an ability's
// `impact` recipe (its tune file) into kit marks, juice, a hit number and distance-scaled shake.
const easeOut = (x) => 1 - (1 - x) ** 3

// Airbrush on canvas: a round spray for the glow and a long thin one for the flare's streak. Drawn once, shared.
let sprays = null
function airbrush() {
	if (sprays) return sprays
	const paint = (w, h, draw) => {
		const canvas = document.createElement('canvas')
		canvas.width = w
		canvas.height = h
		draw(canvas.getContext('2d'), w, h)
		const texture = new THREE.CanvasTexture(canvas)
		texture.colorSpace = THREE.SRGBColorSpace
		return texture
	}
	sprays = {
		glow: paint(128, 128, (g, w) => {
			const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2)
			r.addColorStop(0, 'rgba(255,255,255,1)')
			r.addColorStop(0.12, 'rgba(255,255,255,0.85)')
			r.addColorStop(0.4, 'rgba(255,255,255,0.28)')
			r.addColorStop(1, 'rgba(255,255,255,0)')
			g.fillStyle = r
			g.fillRect(0, 0, w, w)
		}),
		streak: paint(256, 16, (g, w, h) => {
			const x = g.createLinearGradient(0, 0, w, 0)
			x.addColorStop(0, 'rgba(255,255,255,0)')
			x.addColorStop(0.5, 'rgba(255,255,255,1)')
			x.addColorStop(1, 'rgba(255,255,255,0)')
			const y = g.createLinearGradient(0, 0, 0, h)
			y.addColorStop(0, 'rgba(0,0,0,0)')
			y.addColorStop(0.5, 'rgba(0,0,0,1)')
			y.addColorStop(1, 'rgba(0,0,0,0)')
			g.fillStyle = x
			g.fillRect(0, 0, w, h)
			g.globalCompositeOperation = 'destination-in'
			g.fillStyle = y
			g.fillRect(0, 0, w, h)
		}),
	}
	return sprays
}
const sprayMaterial = (map, color) =>
	new THREE.SpriteMaterial({
		map,
		color,
		transparent: true,
		depthTest: false,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
	})

// A crescent strip from angle `from` to `to` (radians about +y, 0 along +z), `segments` long; u runs along it.
function arcGeometry(segments = 32) {
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute(
		'position',
		new THREE.Float32BufferAttribute(new Float32Array((segments + 1) * 6), 3),
	)
	const index = []
	for (let i = 0; i < segments; i++) {
		const k = i * 2
		index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
	}
	geometry.setIndex(index)
	return geometry
}

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

// Stretch a unit box (`linkGeometry`) from one ground point at height y to another at height toY.
export const linkGeometry = () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5)
export function link(mesh, from, to, y, width, toY = y) {
	const dx = to.x - from.x,
		dy = toY - y,
		dz = to.z - from.z
	mesh.position.set(from.x, y, from.z)
	mesh.rotation.set(-Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(dx, dz), 0, 'YXZ')
	mesh.scale.set(width, width, Math.hypot(dx, dy, dz))
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
		const mesh = geometry ? new THREE.Mesh(geometry, material) : new THREE.Sprite(material)
		mesh.frustumCulled = false
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
		// `delay` holds it back, so a few rings with growing delays ripple like a stone dropped in water.
		ring(
			at,
			{ color, from = 0.5, to = 2, life = 0.4, width = 0.12, y = 0.04, opacity = 1, delay = 0 },
		) {
			const total = life + delay
			add(ringOf(width), glowMaterial(color), at, total, (t, mesh) => {
				const k = (t * total - delay) / life
				mesh.visible = k >= 0
				mesh.position.y = y
				mesh.scale.setScalar(from + (to - from) * easeOut(Math.max(0, k)))
				mesh.material.opacity = opacity * (1 - Math.max(0, k))
			})
		},
		// An airbrushed glow at a point of contact with one hard horizontal flare through it, added as light.
		// It blooms in the first fifth of its life and fades out after; `streak` is the flare's length in metres.
		flare(at, { color = '#fff2cc', size = 1.6, streak = 3, life = 0.28, y = 0.9, opacity = 1 }) {
			const { glow, streak: line } = airbrush()
			const body = add(null, sprayMaterial(glow, color), at, life, (k, sprite) => {
				const bloom = k < 0.2 ? easeOut(k / 0.2) : 1
				sprite.position.y = y
				sprite.scale.setScalar(size * (0.5 + 0.5 * bloom) * (1 + 0.15 * k))
				sprite.material.opacity = opacity * (k < 0.2 ? bloom : (1 - (k - 0.2) / 0.8) ** 2)
			})
			add(null, sprayMaterial(line, color), at, life * 0.7, (k, sprite) => {
				sprite.position.y = y
				sprite.scale.set(streak * (0.4 + 0.6 * easeOut(Math.min(1, k * 3))), size * 0.08, 1)
				sprite.material.opacity = opacity * (1 - k) ** 1.5
			})
			return body
		},
		// The smear a swing leaves: a crescent around `at` facing `heading` (radians, 0 along +z), fat at its head
		// and thin at its tail, drawn on over the first third of its life and wiped off from behind.
		smear(
			at,
			heading,
			{
				color = '#fff7e6',
				ink = '#26445f',
				radius = 1.1,
				width = 0.45,
				sweep = 2.2,
				life = 0.2,
				y = 0.8,
				opacity = 0.95,
			},
		) {
			const segments = 32
			const from = heading - sweep / 2
			// Two strips: an ink one a touch wider underneath, the light one on top, so it reads on a pale floor.
			for (const [tone, rim, lift] of [
				[ink, 0.09, 0],
				[color, 0, 0.01],
			]) {
				const geometry = arcGeometry(segments)
				add(geometry, glowMaterial(tone, opacity), at, life, (k, mesh) => {
					mesh.position.y = y + lift
					const head = Math.min(1, k * 3)
					const tail = Math.max(0, (k - 0.3) / 0.7)
					const position = geometry.attributes.position
					for (let i = 0; i <= segments; i++) {
						const u = tail + (head - tail) * (i / segments) // along the drawn part, tail to head
						const a = from + sweep * u
						const half = (width * (0.15 + 0.85 * (i / segments))) / 2 + rim
						for (const [j, r] of [radius - half, radius + half].entries())
							position.setXYZ(i * 2 + j, Math.sin(a) * r, 0, Math.cos(a) * r)
					}
					position.needsUpdate = true
					mesh.material.opacity = opacity * (1 - tail)
				}).owned = geometry
			}
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
				effect.owned?.dispose()
				live.splice(i, 1)
			}
		},
		reset() {
			for (const effect of live) {
				parent.remove(effect.mesh)
				effect.mesh.material.dispose()
				effect.owned?.dispose()
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
// `feel` (look.juice.impact) scales the light, weight and camera parts; 0 turns them off.
// Everything here is presentation: holds, skids and nudges move what is drawn, never the sim.
export function createImpacts({ effects, juice, camera, pop, feel = () => ({}) }) {
	const main = new Map() // `${source}:${ability}` → tick of its main hit
	return function hit(fact, recipe, { unit, source, listener, tick, mine = false }) {
		if (!recipe || fact.periodic || !fact.point) return
		const key = `${fact.source}:${fact.ability}`
		const scale = main.get(key) === tick ? (recipe.splash ?? 1) : 1
		main.set(key, tick)
		const { scale: f = 1, reference = 100 } = feel()
		const at = unit?.body.mesh?.position ?? fact.point
		const direction = fact.direction ?? { x: 0, y: 0, z: 0 }
		// Bigger blows read bigger, gently: a tenth of the reference damage is about half size.
		const weight = Math.min(1.8, Math.max(0.5, ((fact.damage ?? reference) / reference) ** 0.35))
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
		const near = (range) =>
			listener ? Math.max(0, 1 - Math.hypot(listener.x - at.x, listener.z - at.z) / range) : 0
		if (recipe.shake) {
			const falloff = near(recipe.shake.range)
			if (falloff > 0) camera.shake(recipe.shake.amount * scale * falloff)
		}
		if (!(f > 0)) return
		const s = scale * f
		if (recipe.flare) {
			const size = recipe.flare.size * weight * s
			// Sits on the struck side of the body, toward whoever struck it.
			const flareAt = { x: at.x - direction.x * 0.3, z: at.z - direction.z * 0.3 }
			effects?.flare(flareAt, {
				...recipe.flare,
				size,
				streak: (recipe.flare.streak ?? 3) * weight * s,
			})
		}
		for (let i = 0; i < (recipe.ripples?.count ?? 0); i++) {
			const r = recipe.ripples
			effects?.ring(at, {
				color: r.color ?? '#fffdf4',
				from: r.from * s,
				to: r.to * s * (1 + i * 0.35),
				life: r.life,
				width: r.width ?? 0.04,
				opacity: r.opacity ?? 0.9,
				delay: i * (r.gap ?? 0.06),
			})
		}
		if (recipe.smear && source?.body?.mesh) {
			const from = source.body.mesh.position
			effects?.smear(from, Math.atan2(at.x - from.x, at.z - from.z), {
				...recipe.smear,
				radius: (recipe.smear.radius ?? 1.1) * Math.min(1, s),
			})
		}
		if (recipe.skid) unit?.body.skid?.(direction, recipe.skid * weight * s)
		if (recipe.dust)
			juice.puff?.(at, direction, {
				...recipe.dust,
				count: Math.round(recipe.dust.count * Math.min(1, s)),
			})
		if (recipe.crack && scale === 1)
			juice.crack?.(at, { ...recipe.crack, reach: recipe.crack.reach * f, seed: tick })
		if (recipe.hold && scale === 1) {
			const hold = recipe.hold * Math.min(1.5, f)
			unit?.body.hold?.(hold)
			// The striker freezes with it when it struck from close by, as in a fighting game.
			const p = source?.body?.mesh?.position
			if (p && Math.hypot(p.x - at.x, p.z - at.z) < 3) source.body.hold?.(hold)
		}
		if (recipe.nudge) {
			const falloff = near(recipe.nudge.range ?? 14)
			if (falloff > 0) camera.nudge?.(direction, recipe.nudge.amount * s * falloff)
		}
		if (recipe.frame && mine && scale === 1) camera.impactFrame?.(recipe.frame)
	}
}
