import * as THREE from 'three'
import { FORWARD_LAYER } from '../../../../core/stylepass.js'
import { controls, onPreset } from '../../../../core/controls.js'
import { PRESETS, presetKeys } from '../../../../core/intents.js'
import { look } from '../../look.js'
import { tune } from '../../tune.js'
import { drawGlyph } from './hints-view.js'

// The controls card: the moment the player switches presets (the top-right tile), the new scheme is
// printed on the floor around their hero in the hints' own glyphs. How you walk lies on the left,
// how you attack on the right, and your ability keys in a row at your feet. It stays where it was
// printed and fades after a few seconds, or as soon as you walk out of it.
const W = 1024
const H = 640
const HERO = { x: W / 2, y: 250 } // where the hero stands on the card, in canvas pixels
const GLYPH = 256

// What each preset asks of the hands, as glyphs: walk, attack (one or two glyphs), and the slot keys.
function schemeOf(preset) {
	const p = PRESETS[preset] ?? PRESETS.moba
	const walk =
		p.mouse === 'orders'
			? { kind: 'mouse', button: 'right' }
			: { kind: 'walk', ...(p.arrows ? { keys: ['↑', '←', '↓', '→'] } : {}) }
	const space = Object.entries(p.taps).some(([code, a]) => code === 'Space' && a === 'primary')
	// MOBA arms an attack with A and lands it with a click; WASD attacks with a click; the keyboard with Space.
	const attack =
		p.mouse === 'orders'
			? [
					{ kind: 'key', label: 'A' },
					{ kind: 'mouse', button: 'left' },
				]
			: space
				? [{ kind: 'key', label: 'Space' }]
				: [{ kind: 'mouse', button: 'left' }]
	return { walk, attack, keys: presetKeys(preset) }
}

function drawCard(canvas, scheme, slots) {
	const g = canvas.getContext('2d')
	g.clearRect(0, 0, W, H)
	const glyph = document.createElement('canvas')
	glyph.width = glyph.height = GLYPH
	const put = (spec, x, y, size) => {
		drawGlyph(glyph, spec, false)
		g.drawImage(glyph, x, y, size, size)
	}
	// Glyphs sit in a 256 px square with margins; these places put their ink just clear of the hero.
	put(scheme.walk, 110, 100, 300)
	const [first, second] = scheme.attack
	if (second) {
		put(first, 590, 150, 200)
		put(second, 730, 120, 260)
	} else if (first.label === 'Space') put(first, 600, 82, 360)
	else put(first, 538, 100, 300)
	const shown = slots.map((has, i) => has && scheme.keys[i]).filter(Boolean)
	const step = 160
	const size = 190
	const left = W / 2 - ((shown.length - 1) * step + size) / 2
	shown.forEach((label, i) => put({ kind: 'key', label }, left + i * step, 328, size))
}

export function schemeCard({ scene, hero, slots = 4 }) {
	const t = tune.hints
	const s = t.scheme
	const canvas = document.createElement('canvas')
	canvas.width = W
	canvas.height = H
	const texture = new THREE.CanvasTexture(canvas)
	texture.colorSpace = THREE.SRGBColorSpace
	texture.anisotropy = 4
	const geometry = new THREE.PlaneGeometry(1, H / W).rotateX(-Math.PI / 2)
	const material = new THREE.MeshBasicMaterial({
		map: texture,
		transparent: true,
		depthWrite: false,
		depthTest: false, // like the hints, a print on the floor that the floor's depth can't hide
		opacity: 0,
	})
	const plate = new THREE.Mesh(geometry, material)
	plate.name = 'moba-controls-card'
	plate.layers.set(FORWARD_LAYER)
	plate.renderOrder = 2
	plate.visible = false
	scene.add(plate)

	const kit = () =>
		Array.from({ length: 4 }, (_, i) => i < slots && !!hero.definition?.abilities?.[`slot${i + 1}`])
	let wanted = false
	let shown = null // { at, age, ending }
	let fade = 0
	let drawn = ''
	const draw = () => {
		const slotsNow = kit()
		const key = `${controls.preset}:${slotsNow}`
		if (key === drawn) return
		drawn = key
		drawCard(canvas, schemeOf(controls.preset), slotsNow)
		texture.needsUpdate = true
	}
	// The face may land after the first card is drawn; draw it again once it does.
	Promise.all([document.fonts?.load('700 64px "Apfel Grotezk"'), document.fonts?.ready]).then(
		() => {
			drawn = ''
			if (shown) draw()
		},
	)
	const off = onPreset(() => (wanted = true))

	const toCamera = new THREE.Vector3()
	return {
		update({ camera, dt, device, frozen = false }) {
			if (wanted) {
				wanted = false
				// The pad and touch ignore presets, so there is nothing new to show them.
				if (device !== 'gamepad' && device !== 'touch' && !hero.dead) {
					draw()
					const p = hero.body.mesh?.position ?? hero.body.position
					shown = { at: { x: p.x, z: p.z }, age: 0, ending: false }
				}
			}
			if (shown && !shown.ending) {
				if (!frozen) shown.age += dt
				const p = hero.body.position
				const walked = Math.hypot(p.x - shown.at.x, p.z - shown.at.z)
				if (shown.age >= s.hold || walked >= s.leave || hero.dead) shown.ending = true
			}
			const target = shown && !shown.ending ? 1 : 0
			fade =
				target > fade
					? Math.min(1, fade + dt / Math.max(1e-3, t.fadeIn))
					: Math.max(0, fade - dt / Math.max(1e-3, t.fadeOut))
			if (shown?.ending && fade <= 0) shown = null
			plate.visible = !!shown && fade > 0
			if (!plate.visible) return

			// Upright on screen like a hint: the card's top edge points away from the camera.
			camera.getWorldDirection(toCamera)
			toCamera.y = 0
			if (toCamera.lengthSq() < 1e-6) toCamera.set(0, 0, -1)
			toCamera.normalize().negate()
			const toward = ((H / 2 - HERO.y) / W) * s.width // card centre sits this far camera-side of the hero
			plate.position.set(
				shown.at.x + toCamera.x * toward,
				look.out.stampY + 0.012,
				shown.at.z + toCamera.z * toward,
			)
			plate.rotation.y = Math.atan2(toCamera.x, toCamera.z)
			plate.scale.setScalar(s.width * (shown.ending ? 1 - 0.06 * (1 - fade) : 1))
			material.opacity = t.opacity * fade
		},
		dispose() {
			off()
			plate.removeFromParent()
			geometry.dispose()
			material.dispose()
			texture.dispose()
		},
	}
}
