import * as THREE from 'three'
import { sfx } from './audio.js'
import { hex } from './style.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { makeStyleMaterial, FORWARD_LAYER } from './stylepass.js'

// A portal is a comic sticker-style court pad whose trigger starts a match; it avoids dizzying rotation and instead wakes with breathing, label bobbing, rising sparkles, and squash-stretch.
const PORTAL_ROLES = { 1: 'portalChill', 2: 'portalSpicy', 3: 'portalChaos' }
const PORTAL_WORDS = { 1: 'CHILL', 2: 'SPICY', 3: 'CHAOS' }
const INK = hex('ink')
const CREAM = hex('cream')

// Canvas label uses cream and ink strokes around a colored difficulty number and word.
function makeLabel(enemies, color) {
	const c = document.createElement('canvas')
	c.width = 256
	c.height = 256
	const g = c.getContext('2d')
	g.textAlign = 'center'
	g.textBaseline = 'middle'
	g.lineJoin = 'round'

	g.font = '150px "Ranchers", "Darumadrop One", system-ui, sans-serif'
	g.lineWidth = 30
	g.strokeStyle = CREAM
	g.strokeText(String(enemies), 128, 100)
	g.lineWidth = 14
	g.strokeStyle = INK
	g.strokeText(String(enemies), 128, 100)
	g.fillStyle = color
	g.fillText(String(enemies), 128, 100)

	const word = PORTAL_WORDS[enemies] || ''
	g.font = '44px "Ranchers", "Darumadrop One", system-ui, sans-serif'
	g.lineWidth = 14
	g.strokeStyle = CREAM
	g.strokeText(word, 128, 200)
	g.fillStyle = INK
	g.fillText(word, 128, 200)

	const tex = new THREE.CanvasTexture(c)
	tex.colorSpace = THREE.SRGBColorSpace
	const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }))
	sprite.layers.set(FORWARD_LAYER)
	sprite.scale.set(2.6, 2.6, 1)
	sprite.position.y = 2.3
	return sprite
}

// One shared 4-point-star texture for every sparkle on every portal.
let _starTex = null
function starTexture() {
	if (_starTex) return _starTex
	const c = document.createElement('canvas')
	c.width = 64
	c.height = 64
	const g = c.getContext('2d')
	g.fillStyle = '#ffffff'
	g.beginPath()
	g.moveTo(32, 2)
	g.quadraticCurveTo(36, 28, 62, 32)
	g.quadraticCurveTo(36, 36, 32, 62)
	g.quadraticCurveTo(28, 36, 2, 32)
	g.quadraticCurveTo(28, 28, 32, 2)
	g.fill()
	_starTex = new THREE.CanvasTexture(c)
	return _starTex
}

// Build the static sticker as four semantic batches, independent of canvas labels.
export function buildPortalPad(enemies) {
	const group = new THREE.Group()
	const batches = new Map()
	function flat(geometry, role, y, x = 0, z = 0) {
		geometry.rotateX(-Math.PI / 2)
		geometry.translate(x, y, z)
		if (!batches.has(role)) batches.set(role, [])
		batches.get(role).push(geometry)
	}
	for (let i = 0; i < 8; i++) {
		const a = (i / 8) * Math.PI * 2
		flat(new THREE.CircleGeometry(0.29, 20), 'cream', 0.001, Math.cos(a) * 1.46, Math.sin(a) * 1.46)
	}
	flat(new THREE.CircleGeometry(1.5, 48), 'cream', 0.002)
	flat(new THREE.CircleGeometry(1.16, 48), 'hole', 0.003)
	flat(new THREE.RingGeometry(1.29, 1.37, 48), 'ink', 0.004)
	flat(new THREE.RingGeometry(0.9, 0.96, 48), 'ink', 0.004)
	flat(new THREE.RingGeometry(0.96, 1.29, 48), PORTAL_ROLES[enemies] || 'portalSpicy', 0.005)
	for (const [role, geometries] of batches) {
		const mesh = new THREE.Mesh(
			mergeGeometries(geometries),
			makeStyleMaterial(role, { flat: true }),
		)
		mesh.name = `portal-${role}`
		group.add(mesh)
		for (const geometry of geometries) geometry.dispose()
	}
	return group
}

export function createPortal(scene, { x, z, enemies }) {
	const color = hex(PORTAL_ROLES[enemies] || 'portalSpicy')
	const group = buildPortalPad(enemies)
	group.position.set(x, 0.05, z)

	// Star sparkles drifting up out of the hole — upward motion, zero rotation.
	const sparkles = []
	const N_SPARK = 6
	for (let i = 0; i < N_SPARK; i++) {
		const mat = new THREE.SpriteMaterial({
			map: starTexture(),
			color: i % 2 ? '#ffffff' : color,
			transparent: true,
			opacity: 0,
			depthWrite: false,
		})
		const sprite = new THREE.Sprite(mat)
		sprite.layers.set(FORWARD_LAYER)
		const size = 0.14 + Math.random() * 0.14
		sprite.scale.set(size, size, 1)
		const sp = { sprite, y: 0, max: 1, speed: 1, angle: 0, r: 0 }
		resetSparkle(sp, Math.random() * 1.4) // stagger initial heights
		sparkles.push(sp)
		group.add(sprite)
	}
	function resetSparkle(sp, y = 0.05) {
		sp.angle = Math.random() * Math.PI * 2
		sp.r = 0.15 + Math.random() * 0.7
		sp.y = y
		sp.max = 1.2 + Math.random() * 0.6
		sp.speed = 0.35 + Math.random() * 0.4
		sp.sprite.position.set(Math.cos(sp.angle) * sp.r, sp.y, Math.sin(sp.angle) * sp.r)
	}

	const label = makeLabel(enemies, color)
	group.add(label)

	scene.add(group)

	const R = 1.25 // trigger radius — a hair wider than the visual hole
	function trigger(px, pz) {
		const dx = px - x
		const dz = pz - z
		return dx * dx + dz * dz < R * R
	}

	// Inside the wake zone, a fast lerp pops the label and accelerates sparkles, then relaxes on exit.
	const NEAR = 3.6
	const phase = Math.random() * Math.PI * 2 // desync the breathing across portals
	let t = 0
	let wake = 0
	let wasNear = false

	function update(dt, playerPos) {
		t += dt
		let near = false
		if (playerPos) {
			const dx = playerPos.x - x
			const dz = playerPos.z - z
			near = dx * dx + dz * dz < NEAR * NEAR
		}
		if (near && !wasNear) sfx.hover() // soft click the instant it wakes
		wasNear = near

		wake += ((near ? 1 : 0) - wake) * Math.min(1, dt * 9)

		// The label bobs, lifts, and grows on wake while the pad stays fixed to avoid coplanar overlap.
		label.position.y = 2.25 + 0.1 * Math.sin(t * 2 + phase) + wake * 0.3
		const ls = 2.6 * (1 + wake * 0.18)
		label.scale.set(ls, ls, 1)

		for (const sp of sparkles) {
			sp.y += dt * sp.speed * (1 + wake * 1.6)
			if (sp.y > sp.max) resetSparkle(sp)
			sp.sprite.position.y = sp.y
			const fade = 1 - sp.y / sp.max
			sp.sprite.material.opacity = fade * (0.55 + wake * 0.45)
		}
	}

	function dispose() {
		scene.remove(group)
		group.traverse((obj) => {
			if (obj.geometry) obj.geometry.dispose()
			if (obj.material) {
				// The star texture is shared across portals — never dispose it here.
				if (obj.material.map && obj.material.map !== _starTex) obj.material.map.dispose()
				obj.material.dispose()
			}
		})
	}

	return { enemies, trigger, update, dispose }
}
