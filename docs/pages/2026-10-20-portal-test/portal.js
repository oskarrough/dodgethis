import * as THREE from 'three'
import { FORWARD_LAYER } from '/src/core/stylepass.js'
import { createPortal } from '/src/core/portal.js'
import { tune } from '/src/plugins/moba/tune.js'
import { createLobbyFloor } from '/src/plugins/moba/lobby-floor.js'
import { createMatchTerrain } from '/src/plugins/moba/match-terrain.js'
import { overthrowLayout } from '/src/plugins/moba/maps/overthrow/overthrow-layout.js'
import { scenery } from '/src/plugins/moba/maps/overthrow/overthrow-scenery.js'

// Two worlds share one coordinate frame: the lobby saucer and Overthrow's court, isle and falls.
// The tear itself is src/core/portal.js. Crossing: while the camera is in the hole and facing it,
// the far world is drawn full-screen; the worlds swap when the camera passes the plane.

const CENTER_Y = 2.0
const EYE = 2.0
const AHEAD = 4.5

const canvas = document.querySelector('canvas')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))

const camera = new THREE.PerspectiveCamera(60, 1, 0.02, 900)
camera.layers.set(FORWARD_LAYER)
camera.rotation.order = 'YXZ'

// --- Worlds ---------------------------------------------------------------------------------

function skyDome(top, horizon, bottom) {
	const mesh = new THREE.Mesh(
		new THREE.SphereGeometry(500, 32, 16),
		new THREE.ShaderMaterial({
			uniforms: {
				uTop: { value: new THREE.Color(top) },
				uHorizon: { value: new THREE.Color(horizon) },
				uBottom: { value: new THREE.Color(bottom) },
			},
			vertexShader: /* glsl */ `
				varying vec3 vDir;
				void main() {
					vDir = position;
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				}`,
			fragmentShader: /* glsl */ `
				uniform vec3 uTop, uHorizon, uBottom;
				varying vec3 vDir;
				void main() {
					float h = normalize(vDir).y;
					vec3 c = h > 0.0 ? mix(uHorizon, uTop, pow(h, 0.55)) : mix(uHorizon, uBottom, pow(-h, 0.45));
					gl_FragColor = vec4(c, 1.0);
					#include <colorspace_fragment>
				}`,
			side: THREE.BackSide,
			depthWrite: false,
		}),
	)
	mesh.layers.set(FORWARD_LAYER)
	mesh.renderOrder = -100
	mesh.frustumCulled = false
	return mesh
}

function makeWorld(name, label, sky) {
	const scene = new THREE.Scene()
	const dome = skyDome(...sky)
	scene.add(dome)
	return { name, label, scene, dome, update: () => {} }
}

const lobby = makeWorld('lobby', 'In the lobby', ['#8478bd', '#f6dcd3', '#c9a6c4'])
createLobbyFloor(lobby.scene, renderer)

const match = makeWorld('overthrow', 'On Overthrow', ['#a7c2e3', '#f2cdbd', '#e6b9bf'])
{
	// The lane runs away from you along -z; you land just in front of team A's base.
	const court = new THREE.Group()
	court.rotation.y = Math.PI / 2
	court.position.z = -36
	match.scene.add(court)
	const layout = overthrowLayout()
	const terrain = { ...tune.overthrowTerrain }
	const m = tune.map
	const b = layout.bounds
	const chalk = { lines: [], circles: [] }
	const line = (width, length, x, z) => chalk.lines.push({ width, length, x, z })
	for (const side of [-1, 1]) {
		line((b.halfX - terrain.courtInset) * 2, terrain.chalkWidth, 0, side * (b.halfZ - terrain.courtInset))
		line(terrain.chalkWidth, (b.halfZ - terrain.courtInset) * 2, side * (b.halfX - terrain.courtInset), 0)
	}
	line(terrain.chalkWidth, (b.halfZ - terrain.courtInset) * 2, 0, 0)
	if (m.plazaRadius) chalk.circles.push({ radius: m.plazaRadius, x: 0, z: 0 })
	const unterrain = createMatchTerrain(court, layout, terrain, chalk, {
		scenery,
		casts: { hedge: m.hedgeHeight, wall: m.wallHeight, pillar: m.pillarHeight + m.capHeight },
	})
	match.update = (dt) => unterrain.update(dt)
	// The game's deferred pass lays the court's depth; here its layer-0 twin writes depth first.
	court.traverse((object) => {
		if (!object.isMesh || object.layers.isEnabled(FORWARD_LAYER)) return
		object.material = new THREE.MeshBasicMaterial({ colorWrite: false })
		object.layers.set(FORWARD_LAYER)
		object.renderOrder = -50
	})

	// Stand-ins for the real stone cover and towers (map.js builds those with the whole match).
	const c = terrain.colors
	const lambert = (color) => new THREE.MeshLambertMaterial({ color })
	const hedge = lambert(c.moss),
		wall = lambert(c.stone),
		pillar = lambert(c.stoneLit),
		teams = { A: lambert('#e5ad9c'), B: lambert('#8fb4d8') }
	const solid = (geometry, material, x, y, z) => {
		const mesh = new THREE.Mesh(geometry, material)
		mesh.position.set(x, y, z)
		mesh.layers.set(FORWARD_LAYER)
		court.add(mesh)
	}
	for (const box of layout.boxes) {
		const h = box.kind === 'hedge' ? m.hedgeHeight : m.wallHeight
		solid(
			new THREE.BoxGeometry(box.halfX * 2, h, box.halfZ * 2),
			box.kind === 'hedge' ? hedge : wall,
			box.x,
			h / 2,
			box.z,
		)
	}
	for (const p of layout.pillars)
		solid(new THREE.CylinderGeometry(p.r, p.r * 1.1, m.pillarHeight, 9), pillar, p.x, m.pillarHeight / 2, p.z)
	for (const s of layout.structures) {
		const h = s.kind === 'core' ? 3.4 : 4.6
		solid(new THREE.CylinderGeometry(1.1, 1.5, h, 8), wall, s.x, h / 2, s.z)
		solid(new THREE.ConeGeometry(1.4, 1.2, 8), teams[s.team] ?? pillar, s.x, h + 0.6, s.z)
	}
	const hemi = new THREE.HemisphereLight('#fff4e8', '#7a6fae', 1.7)
	const sun = new THREE.DirectionalLight('#ffe9c8', 1.6)
	sun.position.set(...terrain.light.dir).multiplyScalar(10)
	for (const light of [hemi, sun]) {
		light.layers.set(FORWARD_LAYER)
		match.scene.add(light)
	}
}

// --- The tear -------------------------------------------------------------------------------

const portal = createPortal(renderer, { scene: match.scene, layer: FORWARD_LAYER, floor: CENTER_Y })

// --- State ----------------------------------------------------------------------------------

const state = {
	world: lobby,
	pos: new THREE.Vector3(),
	prev: new THREE.Vector3(),
	yaw: 0,
	pitch: 0,
	covering: false,
	walk: null, // scripted walk through: { points, start, crossed }
	time: 0,
}
const keys = new Set()
const other = () => (state.world === lobby ? match : lobby)

function enter(world) {
	state.world = world
	portal.scene = other().scene
	world.scene.add(portal.object)
}

function reset() {
	state.pos.set(0, EYE, 7.5)
	state.prev.copy(state.pos)
	state.yaw = 0
	state.pitch = -0.08
	state.walk = null
	portal.collapse()
	enter(lobby)
}

const forward = () => new THREE.Vector3(-Math.sin(state.yaw), 0, -Math.cos(state.yaw))

function toggle() {
	if (portal.isOpen) return portal.collapse()
	if (portal.phase === 'closed') {
		const at = state.pos.clone().addScaledVector(forward(), AHEAD).setY(CENTER_Y)
		portal.place(at, forward().negate())
	}
	portal.open()
}

function stepThrough() {
	if (!portal.isOpen) toggle()
	const centre = portal.object.position.clone().setY(EYE)
	const facing = new THREE.Vector3(0, 0, 1).transformDirection(portal.object.matrixWorld)
	const side = Math.sign(facing.dot(state.pos.clone().sub(centre)) || 1)
	const beyond = centre.clone().addScaledVector(facing, -side * 3.5)
	const wait = portal.openness < 0.6 ? 1.2 : 0
	state.walk = { points: [centre, beyond], start: state.time + wait, crossed: false }
}

// --- Loop -----------------------------------------------------------------------------------

function tick(dt) {
	state.time += dt
	state.prev.copy(state.pos)

	// Moving: scripted walk, else WASD.
	if (state.walk && state.time >= state.walk.start) {
		const next = state.walk.points[0]
		if (next) {
			const to = next.clone().sub(state.pos).setY(0)
			const dist = to.length()
			const yaw = Math.atan2(-to.x, -to.z)
			const dy = ((yaw - state.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI
			state.yaw += dy * Math.min(1, dt * 6)
			state.pitch += (-0.04 - state.pitch) * Math.min(1, dt * 4)
			const step = Math.min(dist, 2.6 * dt * (Math.abs(dy) < 0.6 ? 1 : 0.3))
			if (dist > 1e-4) state.pos.addScaledVector(to.normalize(), step)
			if (dist - step < 0.02) state.walk.points.shift()
		} else {
			// Landed: the tear seals behind you.
			if (state.walk.crossed) portal.collapse()
			state.walk = null
		}
	} else if (!state.walk) {
		// WASD strafes; the left and right arrows turn instead.
		if (keys.has('ArrowLeft')) state.yaw += 2.4 * dt
		if (keys.has('ArrowRight')) state.yaw -= 2.4 * dt
		const f = forward(),
			r = new THREE.Vector3(-f.z, 0, f.x)
		const move = new THREE.Vector3()
		if (keys.has('KeyW') || keys.has('ArrowUp')) move.add(f)
		if (keys.has('KeyS') || keys.has('ArrowDown')) move.sub(f)
		if (keys.has('KeyD')) move.add(r)
		if (keys.has('KeyA')) move.sub(r)
		const run = keys.has('ShiftLeft') || keys.has('ShiftRight')
		if (move.lengthSq() > 0) state.pos.addScaledVector(move.normalize(), (run ? 7 : 3.2) * dt)
	}

	if (portal.crossed(state.prev, state.pos)) {
		enter(other())
		if (state.walk) state.walk.crossed = true
	}
	camera.position.copy(state.pos)
	camera.rotation.set(state.pitch, state.yaw, 0)
	camera.updateMatrixWorld()
	state.covering = portal.covers(camera)
	lobby.update(dt)
	match.update(dt)
	for (const world of [lobby, match]) world.dome.position.copy(camera.position)
	portal.update(dt, camera, { far: !state.covering })
}

function render() {
	const shown = state.covering ? other() : state.world
	shown.scene.add(portal.object)
	renderer.render(shown.scene, camera)
	where.textContent = state.world.label
}

function resize() {
	renderer.setSize(innerWidth, innerHeight, false)
	camera.aspect = innerWidth / innerHeight
	camera.updateProjectionMatrix()
}

// --- Input ----------------------------------------------------------------------------------

const where = document.querySelector('.where')
const actions = { open: toggle, step: stepThrough, reset }
addEventListener('keydown', (event) => {
	if (event.repeat) return
	keys.add(event.code)
	if (event.code === 'KeyO') toggle()
	else if (event.code === 'Space') stepThrough()
	else if (event.code === 'KeyR') reset()
	else return
	event.preventDefault()
})
addEventListener('keyup', (event) => keys.delete(event.code))
addEventListener('blur', () => keys.clear())
for (const button of document.querySelectorAll('[data-act]'))
	button.addEventListener('click', (event) => {
		actions[button.dataset.act]()
		event.currentTarget.blur()
	})
canvas.addEventListener('click', () => canvas.requestPointerLock?.())
addEventListener('mousemove', (event) => {
	if (document.pointerLockElement !== canvas) return
	state.yaw -= event.movementX * 0.0022
	state.pitch = Math.max(-1.3, Math.min(1.3, state.pitch - event.movementY * 0.0022))
	if (state.walk) state.walk = null
})
addEventListener('resize', resize)

reset()
resize()
let last = performance.now()
renderer.setAnimationLoop((now) => {
	const dt = Math.min(0.05, (now - last) / 1000)
	last = now
	tick(dt)
	render()
})

window.portal = {
	open: toggle,
	step: stepThrough,
	reset,
	state: () => ({
		world: state.world.name,
		phase: portal.phase,
		open: portal.openness,
		covering: state.covering,
		pos: state.pos.toArray(),
	}),
}
