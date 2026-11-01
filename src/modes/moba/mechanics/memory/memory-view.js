import * as THREE from 'three'
import { FORWARD_LAYER } from '../../../../core/stylepass.js'
import { PALETTE } from '../../../../core/style.js'
import { HEROES } from '../../heroes.js'
import { tune } from '../../tune.js'

// What the mesa remembers, kept in this browser only: `runs` holds the falls of the last few runs
// (oldest first, each a flat list of x, z), `names` the heroes who cleared it, in the order carved.
// Storage may be missing, full or refused; the mesa then simply forgets.
const STORE = 'dodgethis.mesa'
const INK = `#${PALETTE.ink.toString(16).padStart(6, '0')}`
const CREAM = `#${PALETTE.cream.toString(16).padStart(6, '0')}`
const INK_RGB = new THREE.Color(PALETTE.ink).toArray()

function recall() {
	try {
		const kept = JSON.parse(globalThis.localStorage?.getItem(STORE) ?? 'null')
		const runs = Array.isArray(kept?.runs)
			? kept.runs.filter((run) => Array.isArray(run) && run.every(Number.isFinite))
			: []
		const names = Array.isArray(kept?.names) ? kept.names.filter((id) => HEROES[id]) : []
		return { runs, names }
	} catch {
		return { runs: [], names: [] }
	}
}
function keep(memory) {
	try {
		globalThis.localStorage?.setItem(STORE, JSON.stringify(memory))
	} catch {
		// A private window or a full disk: the mesa forgets, and the run goes on.
	}
}

// One stroke of a scratched cross: a thin quad from `a` to `b`, tapering toward its ends.
function stroke(positions, colors, a, b, width, alpha) {
	const dx = b.x - a.x,
		dz = b.z - a.z
	const len = Math.hypot(dx, dz) || 1
	const nx = (-dz / len) * (width / 2),
		nz = (dx / len) * (width / 2)
	const corners = [
		[a.x + nx * 0.4, a.z + nz * 0.4],
		[a.x - nx * 0.4, a.z - nz * 0.4],
		[b.x - nx, b.z - nz],
		[b.x + nx, b.z + nz],
	]
	for (const i of [0, 1, 2, 0, 2, 3]) {
		positions.push(corners[i][0], 0, corners[i][1])
		colors.push(...INK_RGB, alpha)
	}
}
// A fall's cross keeps its own slant, the same every visit: a hash of where it lies.
const slant = (x, z) => {
	const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453
	return s - Math.floor(s)
}

// Chalk where a hero fell on this run, fainter for every run before; and round the last
// encounter's dial (Gnomon's), the names of the heroes who have cleared the mesa.
export function view(scene) {
	const c = () => tune.memory.chalk
	const n = () => tune.memory.names
	const memory = recall()
	// This run's falls go into a run of their own, made only when the first hero falls, so a clean
	// run pushes no older chalk off the mesa.
	let falls = null
	let disposed = false
	const owned = []

	const chalkMaterial = new THREE.MeshBasicMaterial({
		vertexColors: true,
		transparent: true,
		depthWrite: false,
		side: THREE.DoubleSide,
	})
	const chalk = new THREE.Mesh(new THREE.BufferGeometry(), chalkMaterial)
	chalk.layers.set(FORWARD_LAYER)
	chalk.frustumCulled = false
	scene.add(chalk)
	owned.push(chalkMaterial)

	function drawChalk() {
		const positions = [],
			colors = []
		const runs = memory.runs
		runs.forEach((run, r) => {
			const current = run === falls
			// The oldest kept run is faintest; the one just before this is `faded`.
			const before = runs.length - (falls ? 1 : 0)
			const age = before <= 1 ? 1 : r / (before - 1)
			const alpha = current ? c().opacity : c().faintest + (c().faded - c().faintest) * age
			for (let i = 0; i + 1 < run.length; i += 2) {
				const x = run[i],
					z = run[i + 1]
				const turn = slant(x, z) * Math.PI
				const half = c().size / 2
				for (const arm of [turn + Math.PI / 4, turn - Math.PI / 4 + 0.2]) {
					const ux = Math.cos(arm) * half,
						uz = Math.sin(arm) * half
					stroke(
						positions,
						colors,
						{ x: x - ux, z: z - uz },
						{ x: x + ux, z: z + uz },
						c().width,
						alpha,
					)
				}
			}
		})
		chalk.geometry.dispose()
		chalk.geometry = new THREE.BufferGeometry()
		chalk.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
		chalk.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4))
		chalk.position.y = tune.map.printLayers.seams + c().lift
	}
	drawChalk()

	// The names, cut round the dial like the legend on a coin: across the top they read clockwise
	// with their tops outward, across the bottom anticlockwise with their tops inward, so every name
	// reads left to right from the match camera.
	const canvas = document.createElement('canvas')
	canvas.width = canvas.height = 1024
	const texture = new THREE.CanvasTexture(canvas)
	texture.colorSpace = THREE.SRGBColorSpace
	const dialMaterial = new THREE.MeshBasicMaterial({
		map: texture,
		transparent: true,
		depthWrite: false,
	})
	const dialPlane = new THREE.PlaneGeometry(1, 1)
	const dial = new THREE.Mesh(dialPlane, dialMaterial)
	dial.rotation.x = -Math.PI / 2
	dial.layers.set(FORWARD_LAYER)
	dial.visible = false
	scene.add(dial)
	owned.push(texture, dialMaterial, dialPlane)

	function carve() {
		const span = (n().radius + n().letter) * 2
		const px = canvas.width / span
		const context = canvas.getContext('2d')
		context.clearRect(0, 0, canvas.width, canvas.height)
		const names = memory.names.slice(-n().cap).map((id) => HEROES[id].name.toUpperCase())
		dial.visible = names.length > 0
		if (!names.length) return
		const size = n().letter * px
		const radius = n().radius * px
		const centre = canvas.width / 2
		context.font = `${size}px 'Apfel Grotezk', 'Josefin Sans', sans-serif`
		context.textAlign = 'center'
		context.textBaseline = 'middle'
		const track = size * 0.18
		// Evenly round the dial from the top, never closer than six to a turn.
		const slots = Math.max(6, names.length)
		names.forEach((name, i) => {
			const middle = -Math.PI / 2 + (i / slots) * Math.PI * 2
			const widths = [...name].map((ch) => context.measureText(ch).width + track)
			const arc = widths.reduce((a, b) => a + b, 0) / radius
			const top = Math.sin(middle) <= 0
			let at = top ? middle - arc / 2 : middle + arc / 2
			;[...name].forEach((ch, k) => {
				const step = widths[k] / radius
				const angle = top ? at + step / 2 : at - step / 2
				at = top ? at + step : at - step
				context.save()
				context.translate(centre + Math.cos(angle) * radius, centre + Math.sin(angle) * radius)
				context.rotate(top ? angle + Math.PI / 2 : angle - Math.PI / 2)
				// A cut letter: its pale lower lip first, then the groove in ink over it.
				context.globalAlpha = n().lip
				context.fillStyle = CREAM
				context.fillText(ch, size * 0.04, size * 0.06)
				context.globalAlpha = 1
				context.fillStyle = INK
				context.fillText(ch, 0, 0)
				context.restore()
			})
		})
		texture.needsUpdate = true
		dial.scale.set(span, span, 1)
		dialMaterial.opacity = n().opacity
	}
	carve()
	// The carving font may arrive after the first cut; cut again once it has.
	document.fonts?.load(`64px 'Apfel Grotezk'`).then(
		() => !disposed && carve(),
		() => {},
	)

	// Heroes by id, from the last look, so a death fact can tell a hero's fall from a pack's.
	let heroIds = new Set()
	let carved = false
	return {
		// Chalk goes where the killing blow landed: by the time the next frame looks, the body is gone.
		present(fact) {
			if (fact.type !== 'death' || !fact.point || !heroIds.has(fact.target)) return
			if (!falls) {
				falls = []
				memory.runs.push(falls)
				memory.runs.splice(0, Math.max(0, memory.runs.length - c().runs))
			}
			const round = (v) => Math.round(v * 10) / 10
			falls.push(round(fact.point.x), round(fact.point.z))
			falls.splice(0, Math.max(0, falls.length - c().perRun * 2))
			keep(memory)
			drawChalk()
		},
		update(sim, _blend, local) {
			if (!sim.dungeon) return
			const last = sim.dungeon.encounters.find((e) => e.last)
			if (last) dial.position.set(last.spot.x, tune.map.printLayers.seams + n().lift, last.spot.z)
			if (heroIds.size !== sim.heroes.length) heroIds = new Set(sim.heroes.map((h) => h.id))
			// The run is won: carve the hero you played, once, if the mesa doesn't know it yet.
			if (!carved && sim.dungeon.run.endedTick != null && sim.lane?.match.winner === 'A') {
				carved = true
				const heroId = sim.heroes.find((h) => h.id === local)?.heroId
				if (heroId && HEROES[heroId] && !memory.names.includes(heroId)) {
					memory.names.push(heroId)
					memory.names.splice(0, Math.max(0, memory.names.length - n().cap))
					keep(memory)
					carve()
				}
			}
		},
		dispose() {
			disposed = true
			scene.remove(chalk, dial)
			chalk.geometry.dispose()
			for (const o of owned) o.dispose()
		},
	}
}
