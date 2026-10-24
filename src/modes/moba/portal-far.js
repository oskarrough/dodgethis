import * as THREE from 'three'
import { FORWARD_LAYER } from '../../core/stylepass.js'
import { tune } from './tune.js'
import { createMatchTerrain } from './match-terrain.js'
import { overthrowLayout } from './maps/overthrow/overthrow-layout.js'
import { flagfallLayout } from './maps/flagfall/flagfall-layout.js'
import { scenery } from './maps/overthrow/overthrow-scenery.js'

function skyDome(top, horizon, bottom) {
	const mesh = new THREE.Mesh(
		new THREE.SphereGeometry(100, 32, 16),
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

export function createPortalFar(map) {
	const scene = new THREE.Scene()
	const world = new THREE.Group()
	world.scale.setScalar(tune.lobby.portal.farScale)
	world.position.z = -tune.lobby.portal.farTarget
	scene.add(world)
	scene.add(
		skyDome(
			...(map === 'overthrow'
				? ['#a7c2e3', '#f2cdbd', '#e6b9bf']
				: ['#100e26', '#393352', '#171327']),
		),
	)
	let update = () => {}
	let disposeTerrain = () => {}
	const depth = new THREE.MeshBasicMaterial({ colorWrite: false })
	const layout = map === 'flagfall' ? flagfallLayout() : overthrowLayout()
	const court = new THREE.Group()
	court.position.x =
		-layout.structures.find((s) => s.kind === 'core' && s.team === 'A').x -
		tune.lobby.portal.farBaseInset
	world.add(court)
	const terrain = {
		...tune.overthrowTerrain,
		chalkWidth: tune.lobby.portal.farChalkWidth,
		...(map === 'flagfall' ? { colors: tune.flagfall.colors, light: tune.flagfall.light } : {}),
	}
	const m = tune.map
	const b = layout.bounds
	const chalk = { lines: [], circles: [] }
	const line = (width, length, x, z) => chalk.lines.push({ width, length, x, z })
	for (const side of [-1, 1]) {
		line(
			(b.halfX - terrain.courtInset) * 2,
			terrain.chalkWidth,
			0,
			side * (b.halfZ - terrain.courtInset),
		)
		line(
			terrain.chalkWidth,
			(b.halfZ - terrain.courtInset) * 2,
			side * (b.halfX - terrain.courtInset),
			0,
		)
	}
	line(terrain.chalkWidth, (b.halfZ - terrain.courtInset) * 2, 0, 0)
	if (m.plazaRadius) chalk.circles.push({ radius: m.plazaRadius, x: 0, z: 0 })
	const unterrain = createMatchTerrain(court, layout, terrain, chalk, {
		scenery: map === 'overthrow' ? scenery : null,
		casts: { hedge: m.hedgeHeight, wall: m.wallHeight, pillar: m.pillarHeight + m.capHeight },
	})
	update = unterrain.update
	disposeTerrain = unterrain
	// The game's deferred pass lays the court's depth; here its layer-0 twin writes depth first.
	court.traverse((object) => {
		if (!object.isMesh || object.layers.isEnabled(FORWARD_LAYER)) return
		object.material = depth
		object.layers.set(FORWARD_LAYER)
		object.renderOrder = -50
	})

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
		solid(
			new THREE.CylinderGeometry(p.r, p.r * 1.1, m.pillarHeight, 9),
			pillar,
			p.x,
			m.pillarHeight / 2,
			p.z,
		)
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
		scene.add(light)
	}
	return {
		scene,
		update,
		dispose() {
			disposeTerrain()
			const resources = new Set([depth])
			scene.traverse((object) => {
				if (object.geometry) resources.add(object.geometry)
				for (const material of [object.material].flat()) if (material) resources.add(material)
			})
			for (const resource of resources) resource.dispose()
			scene.clear()
		},
	}
}
