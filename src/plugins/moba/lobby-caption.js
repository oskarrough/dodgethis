import * as THREE from 'three'
import { PALETTE } from '../../core/style.js'
import { FORWARD_LAYER } from '../../core/stylepass.js'
import { tune } from './tune.js'

// "Choose your hero" beside the hero strip, in the world rather than over it. Five takes for Oskar
// to pick from, switched with `?caption=stamp|brush|tag|emboss|wordless` until one wins; read once
// at load, before the splash rewrites the address.
const STYLE = new URLSearchParams(location.search).get('caption') ?? tune.lobby.strip.caption.style
const TAKES = { stamp, brush, tag, emboss, wordless }
const INK = new THREE.Color(PALETTE.ink).getStyle()
const PX = 96

export function createCaption(parent) {
	const c = tune.lobby.strip.caption
	const group = new THREE.Group()
	parent.add(group)
	const owned = []
	const family =
		getComputedStyle(document.documentElement).getPropertyValue('--ui-font') || 'sans-serif'
	const font = `${PX}px ${family}`
	// Where a row meets the saucer's left lip, so the words follow its curve.
	const floor = tune.lobby.floor
	const lip = (z) => -floor.halfX * Math.sqrt(Math.max(0, 1 - (z / floor.halfZ) ** 2))
	const kit = {
		c,
		font,
		lip,
		words: c.lines.map((w) => w.toUpperCase()),
		// A flat decal on the glaze, `width` long, its left end at x.
		decal(canvas, width, x, z, turn = 0) {
			const height = width * (canvas.height / canvas.width)
			const map = new THREE.CanvasTexture(canvas)
			map.colorSpace = THREE.SRGBColorSpace
			const material = new THREE.MeshBasicMaterial({
				map,
				transparent: true,
				depthWrite: false,
				polygonOffset: true,
				polygonOffsetFactor: -2,
				polygonOffsetUnits: -8,
			})
			const geometry = new THREE.PlaneGeometry(width, height).rotateX(-Math.PI / 2)
			const mesh = new THREE.Mesh(geometry, material)
			mesh.position.set(x + width / 2, tune.map.printLayers.lobby, z)
			mesh.rotation.y = turn
			mesh.layers.set(FORWARD_LAYER)
			mesh.renderOrder = -1.7
			group.add(mesh)
			owned.push(map, material, geometry)
			return mesh
		},
		own: (...items) => owned.push(...items),
		group,
	}
	let gone = false
	document.fonts.load(font).then(() => {
		if (!gone) (TAKES[STYLE] ?? stamp)(kit)
	})
	return {
		dispose() {
			gone = true
			group.removeFromParent()
			for (const item of owned) item.dispose()
		},
	}
}

// A canvas sized to `lines` of text at PX, with `pad` around; `paint(g, line, x, y)` draws each.
function lettering(font, lines, pad, paint, leading = 1.05) {
	const measure = document.createElement('canvas').getContext('2d')
	measure.font = font
	const width = Math.max(...lines.map((l) => measure.measureText(l).width))
	const canvas = document.createElement('canvas')
	canvas.width = Math.ceil(width + pad * 2)
	canvas.height = Math.ceil(lines.length * PX * leading + pad * 2)
	const g = canvas.getContext('2d')
	g.font = font
	g.textBaseline = 'middle'
	lines.forEach((line, i) => paint(g, line, pad, pad + (i + 0.5) * PX * leading))
	return canvas
}

// A seeded scatter, so a take looks the same every visit.
function scatter(seed) {
	let s = seed
	return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

// 1. Rubber-stamped in blue ink: a boxed block, a little crooked, pressed unevenly.
function stamp({ c, font, lip, words, decal }) {
	const s = c.stamp
	const pad = PX * 0.45
	const canvas = lettering(font, words, pad, (g, line, x, y) => {
		g.fillStyle = s.ink
		g.fillText(line, x, y)
	})
	const g = canvas.getContext('2d')
	g.strokeStyle = s.ink
	g.lineWidth = PX * 0.09
	g.beginPath()
	g.roundRect(
		pad * 0.35,
		pad * 0.35,
		canvas.width - pad * 0.7,
		canvas.height - pad * 0.7,
		PX * 0.12,
	)
	g.stroke()
	// Ink that didn't take: a fade across the block and a scatter of bare specks.
	const random = scatter(7)
	g.globalCompositeOperation = 'destination-out'
	const fade = g.createLinearGradient(0, 0, canvas.width, canvas.height)
	fade.addColorStop(0, 'rgba(0,0,0,0)')
	fade.addColorStop(1, `rgba(0,0,0,${s.fade})`)
	g.fillStyle = fade
	g.fillRect(0, 0, canvas.width, canvas.height)
	g.fillStyle = 'black'
	for (let i = 0; i < s.specks; i++) {
		g.globalAlpha = 0.3 + random() * 0.7
		g.beginPath()
		g.arc(random() * canvas.width, random() * canvas.height, 1 + random() * PX * 0.04, 0, 7)
		g.fill()
	}
	const z = c.z + c.step
	decal(canvas, s.width, lip(z) + c.inset, z, s.turn)
}

// 2. Painted with a loaded brush: one ink colour, washes laid over each other, soft edges, no line.
function brush({ c, font, lip, words, decal }) {
	const b = c.brush
	const random = scatter(11)
	const canvas = lettering(font, words, PX * 0.4, (g, line, x, y) => {
		g.fillStyle = b.ink
		for (let i = 0; i < b.washes; i++) {
			g.filter = `blur(${1 + random() * b.blur}px)`
			g.globalAlpha = b.alpha * (0.6 + random() * 0.8)
			g.fillText(line, x + (random() - 0.5) * b.jitter, y + (random() - 0.5) * b.jitter)
		}
	})
	const z = c.z + c.step
	decal(canvas, b.width, lip(z) + c.inset, z, b.turn)
}

// 3. A kraft tag on a stick, pushed into the glaze by the cards and leaning back toward you.
function tag({ c, font, lip, words, own, group }) {
	const t = c.tag
	const pad = PX * 0.5
	const canvas = lettering(font, words, pad, (g, line, x, y) => {
		g.fillStyle = INK
		g.fillText(line, x + PX * 0.35, y)
	})
	canvas.width += PX * 0.35
	const g = canvas.getContext('2d')
	// Repaint after the resize: the card, its notched left end and string hole, then the words.
	const w = canvas.width,
		h = canvas.height,
		notch = h * 0.28
	g.fillStyle = t.paper
	g.strokeStyle = INK
	g.lineWidth = PX * 0.05
	g.beginPath()
	g.moveTo(notch, 4)
	g.lineTo(w - 4, 4)
	g.lineTo(w - 4, h - 4)
	g.lineTo(notch, h - 4)
	g.lineTo(4, h - notch)
	g.lineTo(4, notch)
	g.closePath()
	g.fill()
	g.stroke()
	g.beginPath()
	g.arc(notch * 0.75, h / 2, PX * 0.12, 0, 7)
	g.stroke()
	g.font = font
	g.textBaseline = 'middle'
	g.fillStyle = INK
	words.forEach((line, i) => g.fillText(line, pad + PX * 0.35, pad + (i + 0.5) * PX * 1.05))
	const map = new THREE.CanvasTexture(canvas)
	map.colorSpace = THREE.SRGBColorSpace
	const card = new THREE.MeshBasicMaterial({ map, transparent: true, side: THREE.DoubleSide })
	const height = t.width * (h / w)
	const board = new THREE.PlaneGeometry(t.width, height)
	const stick = new THREE.CylinderGeometry(t.stick, t.stick, t.height, 6)
	const wood = new THREE.MeshBasicMaterial({ color: PALETTE.ink })
	own(map, card, board, stick, wood)
	const z = c.z + c.step
	const post = new THREE.Group()
	post.position.set(lip(z) + c.inset, 0, z)
	post.rotation.x = -t.lean
	post.rotation.z = t.tilt
	const pole = new THREE.Mesh(stick, wood)
	pole.position.y = t.height / 2
	const sign = new THREE.Mesh(board, card)
	sign.position.set(t.width / 2 - t.stick, t.height - height / 2, t.stick)
	for (const m of [pole, sign]) m.layers.set(FORWARD_LAYER)
	post.add(pole, sign)
	group.add(post)
}

// 4. Raised in the same cream glaze: only a lit top-left edge and a soft shadow down-right say so.
function emboss({ c, font, lip, words, decal }) {
	const e = c.emboss
	const glaze = new THREE.Color(tune.lobby.floor.colors.glaze)
	const shade = glaze.clone().lerp(new THREE.Color(PALETTE.ink), e.shadow).getStyle()
	const lift = e.lift * PX
	const canvas = lettering(font, words, PX * 0.4, (g, line, x, y) => {
		g.filter = `blur(${e.blur}px)`
		g.fillStyle = shade
		g.fillText(line, x + lift, y + lift)
		g.fillStyle = e.light
		g.fillText(line, x - lift * 0.6, y - lift * 0.6)
		g.filter = 'none'
		g.fillStyle = glaze.getStyle()
		g.fillText(line, x, y)
	})
	const z = c.z + c.step
	decal(canvas, e.width, lip(z) + c.inset, z)
}

// 5. No words: painted footprints walk from where you arrive to the cards, darkening as they go.
function wordless({ c, lip, decal }) {
	const f = c.wordless
	const foot = document.createElement('canvas')
	foot.width = 64
	foot.height = 128
	const g = foot.getContext('2d')
	g.fillStyle = INK
	g.beginPath()
	g.ellipse(32, 46, 22, 36, 0, 0, 7)
	g.fill()
	g.beginPath()
	g.ellipse(32, 104, 16, 20, 0, 0, 7)
	g.fill()
	const from = tune.lobby.marks.find((m) => m.x < 0) ?? { x: -4, z: 0 }
	const to = { x: lip(f.z) + c.inset, z: f.z }
	const dx = to.x - from.x,
		dz = to.z - from.z
	const length = Math.hypot(dx, dz)
	const steps = Math.floor(length / f.stride)
	// Feet point along the walk; the decal's top is -z, so turn it from there.
	const turn = Math.atan2(-dx, -dz)
	for (let i = 1; i <= steps; i++) {
		const k = i / steps,
			side = i % 2 ? 1 : -1
		const x = from.x + dx * k + (dz / length) * f.gap * side,
			z = from.z + dz * k - (dx / length) * f.gap * side
		const print = decal(foot, f.size, x - f.size / 2, z, turn)
		print.material.opacity = f.alpha * (0.35 + 0.65 * k)
	}
}
