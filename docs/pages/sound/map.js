import {
	library,
	numbersOf,
	place,
	folderOf,
	fileName,
	shortlist,
	gainFor,
	deck,
	pileFiles,
	candidate,
	where,
	preview,
	stopPreview,
	deckTo,
	setPile,
	on,
} from './state.js'

// A black screen with neon line work (the board's Teenage Engineering look). The axes wear their encoder
// colours: orange brightness, blue length.
const paper = '#0c0c0d'
const ink = '#f1f1ef'
const gold = '#ff5a1f'
const palette = [
	'#3fa9f5',
	'#2bd67b',
	'#ff5a1f',
	'#a07bff',
	'#ffd23f',
	'#ff4f9a',
	'#5ee6e6',
	'#f1f1ef',
	'#9be15d',
	'#ff8a3d',
	'#7b8cff',
	'#e86cff',
	'#4fd1a5',
	'#ffb3a1',
	'#c2c2bd',
	'#00b3ff',
	'#ff3b3b',
]
const font = 'system-ui, sans-serif'
const clamp = (n, low, high) => Math.max(low, Math.min(high, n))

// All geometry stays in CSS pixels. Only the canvas backing store uses device pixels.
const LONG = place({ centroid: 1000, length: 4000 }).y

export function createMap(container) {
	const root = document.createElement('div')
	root.style.cssText = `position:absolute;inset:0;overflow:hidden;background:${paper};color:${ink};font:12px ${font}`
	const canvas = document.createElement('canvas')
	canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none'
	canvas.setAttribute('role', 'img')
	canvas.setAttribute(
		'aria-label',
		'Sound library by brightness and length. Hover to listen, click to audition, wheel to zoom, drag to pan, double-click to reset.',
	)
	root.append(canvas)
	container.append(root)
	const ctx = canvas.getContext('2d')

	const points = library.flatMap((path) => {
		const n = numbersOf(path)
		const p = place(n)
		if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return []
		// Anything over 4 s (ambience loops) sits along the top edge, so game-length sounds get the room.
		return [
			{
				path,
				n,
				...p,
				y: Math.min(p.y, LONG),
				folder: folderOf(path).split('/')[0] || 'loose files',
			},
		]
	})
	const folders = [
		...new Set(library.map((path) => folderOf(path).split('/')[0] || 'loose files')),
	].sort()
	const colours = new Map(folders.map((folder, i) => [folder, palette[i % palette.length]]))
	const domain = {
		left: -0.025,
		right: Math.max(1, ...points.map((p) => p.x)) + 0.025,
		bottom: -0.025,
		top: LONG + 0.025,
	}
	const legend = document.createElement('div')
	legend.style.cssText =
		'position:absolute;left:24px;right:24px;top:18px;display:flex;flex-wrap:wrap;align-content:flex-start;gap:4px 6px;max-height:25%;overflow:auto'
	const chips = new Map()
	for (const folder of folders) {
		const chip = document.createElement('button')
		chip.type = 'button'
		chip.style.cssText = `display:flex;align-items:center;gap:6px;border:1px solid transparent;border-radius:5px;padding:4px 7px;background:transparent;color:${ink};font:11px ${font};cursor:pointer;white-space:nowrap`
		const swatch = document.createElement('span')
		swatch.style.cssText = `width:6px;height:6px;border-radius:50%;background:${colours.get(folder)};flex:none`
		chip.append(swatch, document.createTextNode(folder))
		chip.addEventListener('click', () => setPile(folder === 'loose files' ? '' : folder))
		legend.append(chip)
		chips.set(folder, chip)
	}
	root.append(legend)

	let width = 0
	let height = 0
	let ratio = 0
	let plot = { left: 78, top: 90, width: 1, height: 1 }
	let frame = 0
	let zoom = 1
	let panX = 0
	let panY = 0
	let hovered = null
	let pointer = null
	let drag = null
	let use = null
	let active = new Set()
	let recommended = new Set()
	let chosen = null

	function invalidate() {
		if (!frame) frame = requestAnimationFrame(draw)
	}
	function update() {
		use = where().use
		active = new Set(pileFiles(use))
		recommended = new Set(shortlist(use).map((item) => item.file))
		chosen = candidate()
		for (const [folder, chip] of chips) {
			const selected = deck.pile === (folder === 'loose files' ? '' : folder)
			chip.setAttribute('aria-pressed', String(selected))
			chip.style.borderColor = selected ? '#ffffff55' : 'transparent'
			chip.style.background = selected ? '#ffffff14' : 'transparent'
		}
		invalidate()
	}
	const screen = (p) => ({
		x:
			plot.left + (((p.x - domain.left) / (domain.right - domain.left)) * zoom + panX) * plot.width,
		y: plot.top + (((domain.top - p.y) / (domain.top - domain.bottom)) * zoom + panY) * plot.height,
	})
	const inside = (p) =>
		p &&
		p.x >= plot.left &&
		p.x <= plot.left + plot.width &&
		p.y >= plot.top &&
		p.y <= plot.top + plot.height
	function hit(at) {
		if (!inside(at)) return null
		let best = null
		let distance = 12 ** 2
		for (const p of points) {
			const s = screen(p)
			if (!inside(s)) continue
			const d = (s.x - at.x) ** 2 + (s.y - at.y) ** 2
			if (d < distance) {
				distance = d
				best = p
			}
		}
		return best
	}
	function hover(at, listen = true) {
		const next = hit(at)
		if (next === hovered) return
		hovered = next
		canvas.style.cursor = drag?.moved ? 'grabbing' : next ? 'pointer' : 'grab'
		if (next && listen) preview(next.path, gainFor(use, next.path))
		invalidate()
	}
	function limitPan() {
		panX = clamp(panX, 1 - zoom, 0)
		panY = clamp(panY, 1 - zoom, 0)
	}
	function resize() {
		const box = root.getBoundingClientRect()
		const dpr = window.devicePixelRatio || 1
		const top = legend.offsetTop + legend.offsetHeight + 26
		if (width === box.width && height === box.height && ratio === dpr && plot.top === top) return
		width = box.width
		height = box.height
		ratio = dpr
		canvas.width = Math.round(width * ratio)
		canvas.height = Math.round(height * ratio)
		plot = {
			left: 78,
			top,
			width: Math.max(1, width - 108),
			height: Math.max(1, height - top - 74),
		}
		if (pointer) hover(pointer, false)
		invalidate()
	}
	const observer = new ResizeObserver(resize)
	observer.observe(root)
	observer.observe(legend)
	window.addEventListener('resize', resize)
	// A monitor change can change pixel density without changing the container's CSS size.
	function watchDensity() {
		matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`).addEventListener(
			'change',
			() => {
				resize()
				watchDensity()
			},
			{ once: true },
		)
	}
	watchDensity()

	function circle(x, y, radius, colour, stroke = false) {
		ctx.beginPath()
		ctx.arc(x, y, radius, 0, Math.PI * 2)
		if (stroke) {
			ctx.strokeStyle = colour
			ctx.stroke()
		} else {
			ctx.fillStyle = colour
			ctx.fill()
		}
	}
	function fit(text, max) {
		if (ctx.measureText(text).width <= max) return text
		while (text.length && ctx.measureText(text + '…').width > max) text = text.slice(0, -1)
		return text + '…'
	}
	function axes() {
		ctx.font = `10px ${font}`
		ctx.lineWidth = 1
		const bottom = plot.top + plot.height
		const right = plot.left + plot.width
		ctx.strokeStyle = '#ffffff30'
		ctx.beginPath()
		ctx.moveTo(plot.left, plot.top)
		ctx.lineTo(plot.left, bottom)
		ctx.lineTo(right, bottom)
		ctx.stroke()
		const ticks = [
			...[0.2, 0.5, 1, 2, 5, 10].map((khz) => ({
				x: screen(place({ centroid: khz * 1000, length: 20 })).x,
				label: `${khz}`,
				axis: 'x',
			})),
			...[50, 100, 250, 500, 1000, 2000, 4000].map((ms) => ({
				y: screen(place({ centroid: 100, length: ms })).y,
				label: ms < 1000 ? `${ms} ms` : ms === 4000 ? '4 s +' : `${ms / 1000} s`,
				axis: 'y',
			})),
		]
		for (const tick of ticks) {
			const horizontal = tick.axis === 'x'
			if (horizontal ? tick.x < plot.left || tick.x > right : tick.y < plot.top || tick.y > bottom)
				continue
			ctx.strokeStyle = '#ffffff12'
			ctx.beginPath()
			ctx.moveTo(horizontal ? tick.x : plot.left, horizontal ? plot.top : tick.y)
			ctx.lineTo(horizontal ? tick.x : right, horizontal ? bottom : tick.y)
			ctx.stroke()
			ctx.fillStyle = '#8a8a86'
			ctx.textAlign = horizontal ? 'center' : 'right'
			ctx.fillText(
				tick.label,
				horizontal ? tick.x : plot.left - 12,
				horizontal ? bottom + 19 : tick.y + 3,
			)
		}
		ctx.font = `700 10px ${font}`
		ctx.textAlign = 'center'
		ctx.fillStyle = '#ff5a1f'
		ctx.fillText('BRIGHT · kHz', plot.left + plot.width / 2, bottom + 40)
		ctx.save()
		ctx.translate(18, plot.top + plot.height / 2)
		ctx.rotate(-Math.PI / 2)
		ctx.fillStyle = '#3fa9f5'
		ctx.fillText('LENGTH', 0, 0)
		ctx.restore()
	}
	function tooltip(point) {
		const s = screen(point)
		const maxWidth = Math.max(40, Math.min(310, width - 32))
		ctx.font = `12px ${font}`
		const name = fit(fileName(point.path), maxWidth - 24)
		const nameWidth = ctx.measureText(name).width
		ctx.font = `10px ${font}`
		const folder = fit(folderOf(point.path) + '/', maxWidth - 24)
		const stats = `${point.n.length} ms  ·  ${(point.n.centroid / 1000).toFixed(2)} kHz`
		const boxWidth = Math.min(
			maxWidth,
			Math.max(ctx.measureText(folder).width, ctx.measureText(stats).width, nameWidth) + 24,
		)
		const x = clamp(s.x + 16, 8, width - boxWidth - 8)
		const y = clamp(s.y - 78, plot.top, Math.max(plot.top, height - 78))
		ctx.shadowColor = '#00000080'
		ctx.shadowBlur = 14
		ctx.shadowOffsetY = 3
		ctx.fillStyle = '#1c1c1e'
		ctx.beginPath()
		ctx.roundRect(x, y, boxWidth, 68, 6)
		ctx.fill()
		ctx.shadowBlur = 0
		ctx.shadowOffsetY = 0
		ctx.strokeStyle = '#ffffff22'
		ctx.stroke()
		ctx.textAlign = 'left'
		ctx.font = `10px ${font}`
		ctx.fillStyle = colours.get(point.folder)
		ctx.fillText(folder, x + 12, y + 17)
		ctx.font = `12px ${font}`
		ctx.fillStyle = ink
		ctx.fillText(name, x + 12, y + 35)
		ctx.font = `10px ${font}`
		ctx.fillStyle = '#8a8a86'
		ctx.fillText(stats, x + 12, y + 53)
	}
	function draw() {
		frame = 0
		if (!width || !height) return // Tool tabs hide the map; the observer redraws when it returns.
		ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
		ctx.globalAlpha = 1
		ctx.fillStyle = paper
		ctx.fillRect(0, 0, width, height)
		axes()
		ctx.save()
		ctx.beginPath()
		ctx.rect(plot.left, plot.top, plot.width, plot.height)
		ctx.clip()
		// Quiet files first, so a faded neighbour never paints over a file in the pile.
		for (const strong of [false, true]) {
			for (const p of points) {
				if ((!use || active.has(p.path)) !== strong) continue
				const s = screen(p)
				if (!inside(s)) continue
				ctx.globalAlpha = strong ? 0.95 : 0.22
				circle(s.x, s.y, strong ? 3 : 2.5, colours.get(p.folder))
			}
		}
		ctx.globalAlpha = 1
		ctx.lineWidth = 1.4
		for (const p of points) {
			if (!recommended.has(p.path)) continue
			const s = screen(p)
			if (inside(s)) circle(s.x, s.y, 6, gold, true)
		}
		const selected = points.find((p) => p.path === chosen)
		if (selected) {
			const s = screen(selected)
			if (inside(s)) {
				ctx.lineWidth = 2
				circle(s.x, s.y, 10, ink, true)
				circle(s.x, s.y, 3.5, colours.get(selected.folder))
				ctx.font = `12px ${font}`
				ctx.textAlign = 'left'
				const label = fit(fileName(selected.path), Math.max(30, plot.width - 36))
				const labelWidth = ctx.measureText(label).width
				const x = clamp(s.x + 16, plot.left + 6, plot.left + plot.width - labelWidth - 6)
				const y = clamp(s.y - 14, plot.top + 16, plot.top + plot.height - 6)
				ctx.lineWidth = 5
				ctx.strokeStyle = paper
				ctx.strokeText(label, x, y)
				ctx.fillStyle = ink
				ctx.fillText(label, x, y)
			}
		}
		if (hovered) {
			const s = screen(hovered)
			ctx.lineWidth = 1.5
			circle(s.x, s.y, 8, ink, true)
			circle(s.x, s.y, 4, colours.get(hovered.folder))
		}
		ctx.restore()
		ctx.font = `10px ${font}`
		ctx.fillStyle = '#8a8a86'
		ctx.textAlign = 'left'
		ctx.fillText(
			`${points.length} sounds${points.length < library.length ? ` · ${library.length - points.length} unmeasured` : ''}`,
			plot.left,
			height - 12,
		)
		ctx.textAlign = 'right'
		ctx.fillText(
			`${zoom > 1 ? `${zoom.toFixed(1)}× · ` : ''}Hover to listen · Scroll to zoom · Drag to pan · Double-click to reset`,
			width - 30,
			height - 12,
		)
		if (hovered) tooltip(hovered)
	}

	const position = (event) => {
		const rect = canvas.getBoundingClientRect()
		return { x: event.clientX - rect.left, y: event.clientY - rect.top }
	}
	canvas.addEventListener('pointermove', (event) => {
		if (drag && event.pointerId !== drag.id) return
		pointer = position(event)
		if (drag) {
			if (Math.hypot(pointer.x - drag.start.x, pointer.y - drag.start.y) > 4) drag.moved = true
			if (drag.moved) {
				panX = drag.panX + (pointer.x - drag.start.x) / plot.width
				panY = drag.panY + (pointer.y - drag.start.y) / plot.height
				limitPan()
				hovered = null
				canvas.style.cursor = 'grabbing'
				invalidate()
			}
		} else hover(pointer)
	})
	canvas.addEventListener('pointerleave', () => {
		if (drag) return
		pointer = null
		hovered = null
		invalidate()
	})
	canvas.addEventListener('pointerdown', (event) => {
		if (drag || event.button !== 0 || !inside(position(event))) return
		pointer = position(event)
		drag = { id: event.pointerId, start: pointer, panX, panY, moved: false }
		canvas.setPointerCapture(event.pointerId)
	})
	canvas.addEventListener('pointerup', (event) => {
		if (!drag || event.pointerId !== drag.id) return
		const moved = drag.moved
		drag = null
		canvas.releasePointerCapture(event.pointerId)
		pointer = position(event)
		if (!moved && event.detail < 2) {
			const point = hit(pointer)
			if (point) {
				if (where().use) {
					stopPreview()
					deckTo(point.path)
				} else preview(point.path, gainFor(null, point.path))
			}
		}
		hover(pointer, false)
		canvas.style.cursor = hovered ? 'pointer' : 'grab'
		invalidate()
	})
	canvas.addEventListener('lostpointercapture', () => {
		drag = null
	})
	canvas.addEventListener('pointercancel', () => {
		drag = null
		hovered = null
		pointer = null
		canvas.style.cursor = 'grab'
		invalidate()
	})
	canvas.addEventListener(
		'wheel',
		(event) => {
			const at = position(event)
			if (!inside(at)) return
			event.preventDefault()
			const delta =
				event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? plot.height : 1)
			const next = clamp(zoom * Math.exp(-clamp(delta, -240, 240) * 0.003), 1, 64)
			const x = (at.x - plot.left) / plot.width
			const y = (at.y - plot.top) / plot.height
			panX = x - ((x - panX) * next) / zoom
			panY = y - ((y - panY) * next) / zoom
			zoom = next
			limitPan()
			pointer = at
			hover(at, false)
			invalidate()
		},
		{ passive: false },
	)
	canvas.addEventListener('dblclick', (event) => {
		event.preventDefault()
		zoom = 1
		panX = panY = 0
		hovered = null
		invalidate()
	})
	on('change', update)
	on('select', update)
	resize()
	update()
	return { update }
}
