// Gates over drune: five gates around where you start; crossing one starts a
// timer, crossing the next records the split. No end, no laps, just splits.
// drune's engine is untouched; we read its wasm memory each frame.

const CAR = 8258 // f64 slot of the car's position, counted from io (found by diffing memory while driving)
const FRAME = 65 // io slot holding the byte address of the per-frame uniform block
const GATES = 5
const WIDTH = 28 // metres between posts
const COLORS = ['#ff5a4e', '#ffb03a', '#3fd17a', '#3aa8ff', '#c46bff']
const STORE = 'drune-gates'

const load = (key, fallback) => {
	try {
		return JSON.parse(localStorage.getItem(key)) ?? fallback
	} catch {
		return fallback
	}
}
const save = (key, value) => localStorage.setItem(key, JSON.stringify(value))

while (!window.drune) await new Promise((r) => setTimeout(r, 50))
const l = window.drune

// Everything is read fresh each frame: the wasm memory can grow and replace its buffers.
const frame = () => {
	const b = l.f64[l.io + FRAME] / 4
	const f = l.f32
	return {
		m: f.subarray(b, b + 16),
		ox: f[b + 36],
		oz: f[b + 37],
		cam: [f[b + 32], f[b + 33], f[b + 34]],
	}
}
// The renderer works near a moving origin; world = render + offset. Gates live in world space.
const carWorld = (fr) => {
	const i = l.io + CAR
	return { x: l.f64[i] + fr.ox, y: l.f64[i + 1], z: l.f64[i + 2] + fr.oz }
}

const rand = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 2 ** 32)

const makeCourse = (at) => {
	const seed = (Math.random() * 2 ** 32) >>> 0
	const r = rand(seed)
	const gates = []
	for (let i = 0; i < GATES; i++) {
		const a = (i / GATES) * Math.PI * 2 + (r() - 0.5) * 0.7
		const d = 260 + r() * 260
		// Posts lie along the radius, so a lap around the ring drives through them.
		gates.push({
			x: at.x + Math.cos(a) * d,
			z: at.z + Math.sin(a) * d,
			y: at.y,
			yaw: a,
			seen: false,
		})
	}
	return { id: seed.toString(36), gates }
}

let state = load(STORE, null)
const course = () => state.courses[state.current]
if (!state) {
	const c = makeCourse(carWorld(frame()))
	state = { current: c.id, courses: { [c.id]: c }, best: {} }
	save(STORE, state)
}

const posts = (g) => {
	const dx = (Math.cos(g.yaw) * WIDTH) / 2
	const dz = (Math.sin(g.yaw) * WIDTH) / 2
	return [
		{ x: g.x - dx, z: g.z - dz },
		{ x: g.x + dx, z: g.z + dz },
	]
}

// Segment p→q crosses segment a→b.
const crosses = (p, q, a, b) => {
	const side = (o, s, t) => (s.x - o.x) * (t.z - o.z) - (s.z - o.z) * (t.x - o.x)
	return side(p, q, a) * side(p, q, b) < 0 && side(a, b, p) * side(a, b, q) < 0
}

// --- overlay ---

const canvas = document.createElement('canvas')
canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2'
document.body.appendChild(canvas)
const ctx = canvas.getContext('2d')
let W = 0
let H = 0
const resize = () => {
	const dpr = devicePixelRatio
	W = innerWidth
	H = innerHeight
	canvas.width = W * dpr
	canvas.height = H * dpr
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}
addEventListener('resize', resize)
resize()

const project = (fr, x, y, z) => {
	const m = fr.m
	const rx = x - fr.ox
	const rz = z - fr.oz
	const cx = m[0] * rx + m[4] * y + m[8] * rz + m[12]
	const cy = m[1] * rx + m[5] * y + m[9] * rz + m[13]
	const cw = m[3] * rx + m[7] * y + m[11] * rz + m[15]
	if (cw < 0.5) return null
	return { x: (cx / cw / 2 + 0.5) * W, y: (0.5 - cy / cw / 2) * H, w: cw }
}

const fmt = (ms) => {
	const s = ms / 1000
	const m = Math.floor(s / 60)
	const rest = (s % 60).toFixed(2)
	return m ? `${m}:${rest.padStart(5, '0')}` : rest
}

const font = (px, weight = 600) =>
	`${weight} ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`
const text = (str, x, y, px, color = '#fff', align = 'center', weight) => {
	ctx.font = font(px, weight)
	ctx.textAlign = align
	ctx.lineWidth = Math.max(2, px / 6)
	ctx.strokeStyle = 'rgba(30,30,25,.45)'
	ctx.strokeText(str, x, y)
	ctx.fillStyle = color
	ctx.fillText(str, x, y)
}

const drawGate = (fr, g, i, hot) => {
	const color = COLORS[i]
	const [a, b] = posts(g)
	// Until you've been near a gate its ground height is a guess, so it stands as a tall beacon.
	const low = g.seen ? g.y - 2 : g.y - 60
	const high = g.seen ? g.y + 22 : g.y + 50
	const pa = [project(fr, a.x, low, a.z), project(fr, a.x, high, a.z)]
	const pb = [project(fr, b.x, low, b.z), project(fr, b.x, high, b.z)]
	const label = project(fr, g.x, high + 6, g.z)
	if (pa.every(Boolean) && pb.every(Boolean)) {
		const thick = Math.min(14, Math.max(1.5, 900 / pa[0].w))
		ctx.lineCap = 'round'
		ctx.globalAlpha = hot ? 1 : 0.85
		ctx.strokeStyle = color
		ctx.lineWidth = thick
		for (const [lo, hi] of [pa, pb]) {
			ctx.beginPath()
			ctx.moveTo(lo.x, lo.y)
			ctx.lineTo(hi.x, hi.y)
			ctx.stroke()
		}
		ctx.lineWidth = thick * 0.6
		ctx.beginPath()
		ctx.moveTo(pa[1].x, pa[1].y)
		ctx.lineTo(pb[1].x, pb[1].y)
		ctx.stroke()
		ctx.globalAlpha = 0.35
		ctx.lineWidth = thick * 0.4
		ctx.beginPath()
		ctx.moveTo(pa[0].x, pa[0].y)
		ctx.lineTo(pb[0].x, pb[0].y)
		ctx.stroke()
		ctx.globalAlpha = 1
	}
	return label
}

const car = { last: null, from: null, since: 0 }
let flash = null
let board = false

const cross = (i, now) => {
	if (car.from !== null) {
		const ms = now - car.since
		// Wiggling back through the gate you just left isn't a lap.
		if (car.from !== i || ms > 8000) {
			const key = `${course().id}:${car.from}-${i}`
			const prev = state.best[key]
			const pb = prev === undefined || ms < prev
			if (pb) state.best[key] = Math.round(ms)
			save(STORE, state)
			flash = { from: car.from, to: i, ms, prev, pb, at: now }
		} else return
	}
	car.from = i
	car.since = now
}

const loop = (now) => {
	requestAnimationFrame(loop)
	const fr = frame()
	const pos = carWorld(fr)
	const gates = course().gates

	if (car.last) {
		const step = Math.hypot(pos.x - car.last.x, pos.z - car.last.z)
		// A long jump is a teleport (travel, assist reset): never counts as a crossing.
		if (step < 40)
			gates.forEach((g, i) => {
				const [a, b] = posts(g)
				if (crosses(car.last, pos, a, b)) cross(i, now)
			})
	}
	car.last = pos

	// Learn each gate's ground height as you pass near it, so the posts sit on the ground.
	gates.forEach((g) => {
		if (!g.seen && Math.hypot(pos.x - g.x, pos.z - g.z) < 15) {
			g.y = pos.y
			g.seen = true
			save(STORE, state)
		}
	})

	ctx.clearRect(0, 0, W, H)
	const labels = gates.map((g, i) => drawGate(fr, g, i, car.from === i))
	gates.forEach((g, i) => {
		const d = Math.hypot(pos.x - g.x, pos.z - g.z)
		const p = labels[i]
		if (p && p.x > 0 && p.x < W) {
			p.y = Math.max(30, Math.min(H - 60, p.y))
			text(String(i + 1), p.x, p.y, 22, COLORS[i], 'center', 800)
			text(`${Math.round(d)} m`, p.x, p.y + 16, 12)
		} else {
			// Off screen: pin a marker to the screen edge, in the gate's direction seen from above.
			const m = fr.m
			const dx = g.x - fr.ox - fr.cam[0]
			const dz = g.z - fr.oz - fr.cam[2]
			const ahead = m[3] * dx + m[11] * dz
			const right = m[0] * dx + m[8] * dz
			const ang = Math.atan2(-ahead, right)
			const x = W / 2 + Math.cos(ang) * (W / 2 - 30)
			const y = H / 2 + Math.sin(ang) * (H / 2 - 30)
			ctx.fillStyle = COLORS[i]
			ctx.globalAlpha = 0.85
			ctx.beginPath()
			ctx.arc(x, y, 12, 0, Math.PI * 2)
			ctx.fill()
			ctx.globalAlpha = 1
			text(String(i + 1), x, y + 5, 14, '#fff', 'center', 800)
		}
	})

	// Running split.
	if (car.from !== null) {
		text(`from ${car.from + 1}`, W / 2, 40, 14, COLORS[car.from])
		text(fmt(now - car.since), W / 2, 72, 30, '#fff', 'center', 700)
	} else text('drive through any gate', W / 2, 48, 16)

	if (flash && now - flash.at < 3500) {
		const { from, to, ms, prev, pb } = flash
		const delta = prev === undefined ? 'first time' : `${pb ? '−' : '+'}${fmt(Math.abs(ms - prev))}`
		text(`${from + 1} → ${to + 1}   ${fmt(ms)}`, W / 2, 112, 22, '#fff', 'center', 700)
		text(
			pb ? `best! ${delta}` : `best ${fmt(prev)}  ${delta}`,
			W / 2,
			136,
			15,
			pb ? '#3fd17a' : '#ffd0c8',
		)
	}

	text('Tab times · G new gates here', W - 14, H - 14, 12, 'rgba(255,255,255,.8)', 'right', 500)
	if (board) drawBoard()
}

const drawBoard = () => {
	const cell = 64
	const x0 = W / 2 - (cell * (GATES + 1)) / 2
	const y0 = H / 2 - (cell * (GATES + 1)) / 2 / 1.6
	ctx.fillStyle = 'rgba(30,30,25,.55)'
	ctx.fillRect(x0 - 16, y0 - 40, cell * (GATES + 1) + 32, (cell / 1.6) * (GATES + 1) + 60)
	text('best splits, from ↓ to →', W / 2, y0 - 16, 14)
	const rowH = cell / 1.6
	for (let j = 0; j < GATES; j++)
		text(String(j + 1), x0 + cell * (j + 1.5), y0 + rowH * 0.6, 16, COLORS[j], 'center', 800)
	for (let i = 0; i < GATES; i++) {
		const y = y0 + rowH * (i + 1.6)
		text(String(i + 1), x0 + cell * 0.5, y, 16, COLORS[i], 'center', 800)
		for (let j = 0; j < GATES; j++) {
			const t = state.best[`${course().id}:${i}-${j}`]
			text(t === undefined ? '·' : fmt(t), x0 + cell * (j + 1.5), y, 13, '#fff', 'center', 500)
		}
	}
}

addEventListener('keydown', (e) => {
	if (e.code === 'Tab') {
		e.preventDefault()
		board = true
	}
	if (e.code === 'KeyG' && !e.repeat) {
		const c = makeCourse(carWorld(frame()))
		state.courses[c.id] = c
		state.current = c.id
		save(STORE, state)
		car.from = null
		flash = null
	}
})
addEventListener('keyup', (e) => {
	if (e.code === 'Tab') board = false
})

requestAnimationFrame(loop)
