import * as THREE from 'three'
import { sfx } from './audio.js'

// A portal is a warp pad sunk into the court floor — a chunky "sticker" in the
// same comic language as the DOM UI: cream scalloped edge, fat colored donut
// with navy ink outlines, dark hole in the middle. Step into its trigger zone
// to teleport into a match.
//
// Motion rule: nothing spins (continuous rotation reads as a vortex and makes
// people dizzy). Instead the pad breathes (slow scale pulse), the label bobs,
// star sparkles rise out of the hole, and the whole thing POPS awake with a
// squash-stretch snap when the player walks near.
const PORTAL_COLORS = { 1: '#1b9f5a', 2: '#ff9f1c', 3: '#ff4f6d' }
const PORTAL_WORDS = { 1: 'CHILL', 2: 'SPICY', 3: 'CHAOS' }
const INK = '#26445f'
const CREAM = '#fffdf4'
const HOLE = '#16233a'

// Canvas-texture sprite: chunky outlined number + difficulty word, sticker style
// (cream outer stroke → ink stroke → colored fill).
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

export function createPortal(scene, { x, z, enemies }) {
	const color = PORTAL_COLORS[enemies] || '#ff9f1c'
	const group = new THREE.Group()
	group.position.set(x, 0.05, z)

	// Flat sticker stack, outside in. Tiny y offsets dodge z-fighting.
	function flat(geom, matColor, y, opts = {}) {
		const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: matColor, ...opts }))
		mesh.rotation.x = -Math.PI / 2
		mesh.position.y = y
		group.add(mesh)
		return mesh
	}

	// Scalloped flower edge: a ring of cream bumps peeking out from the base disc.
	// Sized so neighbouring pads (3.5 apart) never touch: outer reach ≈ 1.75.
	const SCALLOPS = 8
	for (let i = 0; i < SCALLOPS; i++) {
		const a = (i / SCALLOPS) * Math.PI * 2
		const bump = flat(new THREE.CircleGeometry(0.29, 20), CREAM, 0.001)
		bump.position.x = Math.cos(a) * 1.46
		bump.position.z = Math.sin(a) * 1.46
	}
	flat(new THREE.CircleGeometry(1.5, 48), CREAM, 0.002) // sticker base
	flat(new THREE.CircleGeometry(1.16, 48), HOLE, 0.003) // the hole
	flat(new THREE.RingGeometry(1.29, 1.37, 48), INK, 0.004) // outer ink line
	flat(new THREE.RingGeometry(0.9, 0.96, 48), INK, 0.004) // inner ink line
	flat(new THREE.RingGeometry(0.96, 1.29, 48), color, 0.005) // fat colored donut

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

	// The wake zone: inside it the pad pops up ~14% and sparkles hurry. The pop
	// is a fast lerp (snappy in), the release relaxes on the same curve.
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
		const breath = 1 + 0.025 * Math.sin(t * 1.8 + phase)
		const s = breath * (1 + wake * 0.14)
		group.scale.set(s, 1, s)

		// Label: gentle bob, lifts + grows when the pad wakes.
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
