import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { makeStyleMaterial } from '../../../../core/stylepass.js'
import { flower, sandstone } from './altamesa-stone.js'

// Four ink draws around the cliff. Every vertex stays beyond its rim tangent;
// no decoration changes the court, its colliders or the routes through it.
export function scenery({ s, own, forward, outward, count, rand, rings, points }) {
	const r = s.rim
	if (!r) return
	const parts = { ruin: [], wood: [], bone: [], moss: [] }
	const roles = { ruin: 'courtShade', wood: 'ink', bone: 'cream', moss: 'court' }
	const up = new THREE.Vector3(0, 1, 0)
	for (let n = 0; n < count * r.density; n++) {
		const i = n % count
		const roll = rand()
		if (roll >= r.ruins + r.trees + r.bones) continue
		const size = r.ruinSize * (0.8 + rand() * 0.6)
		const drop = 0.8 + rand() * r.depth + Math.floor(n / count) * 3
		let k = 1
		while (k < rings.length - 1 && rings[k].drop < drop) k++
		const normal = outward[i]
		const facing = Math.atan2(normal.x, normal.z)
		const rim = points[0][i]
		const out = size * 0.65 + rand() * r.reach
		const at = new THREE.Vector3(
			points[k][i].x + normal.x * out,
			s.groundY - drop,
			points[k][i].z + normal.z * out,
		)
		const put = (geometry, role = 'ruin') => {
			if (geometry.index) {
				const indexed = geometry
				geometry = indexed.toNonIndexed()
				indexed.dispose()
			}
			geometry.deleteAttribute('uv')
			geometry.rotateY(facing).translate(at.x, at.y, at.z)
			const p = geometry.attributes.position
			for (let j = 0; j < p.count; j++) {
				const distance = (p.getX(j) - rim.x) * normal.x + (p.getZ(j) - rim.z) * normal.z
				if (distance < 0.15)
					p.setXYZ(
						j,
						p.getX(j) + normal.x * (0.15 - distance),
						p.getY(j),
						p.getZ(j) + normal.z * (0.15 - distance),
					)
			}
			parts[role].push(geometry)
		}
		// Long, chipped strata overlap the cliff face, stepping back as they descend.
		for (let layer = 0; layer < 3; layer++) {
			const height = size * (layer === 2 ? 2.4 : 0.65)
			put(
				sandstone(
					size * (2.7 - layer * 0.22),
					height,
					size * (1.45 - layer * 0.16),
					0.16,
				).translate(
					size * (rand() - 0.5) * 0.25,
					-size * layer * 0.65 - height / 2,
					-size * (0.4 + layer * 0.1),
				),
			)
		}
		const patch = (x, y, z, radius) => {
			for (let lobe = 0; lobe < 5; lobe++) {
				const a = (lobe * Math.PI * 2) / 5
				put(
					new THREE.SphereGeometry(radius * (0.65 + rand() * 0.25), 7, 5)
						.scale(1, 0.48, 0.85)
						.translate(
							x + Math.cos(a) * radius * 0.55,
							y + (rand() - 0.5) * radius * 0.2,
							z + Math.sin(a) * radius * 0.55,
						),
					'moss',
				)
			}
		}
		patch(-size * 0.8, 0.05, size * 0.12, size * 0.43)
		patch(size * 0.9, -size * 0.3, size * 0.35, size * 0.38)
		patch(size * 0.8, -size * 0.85, size * 0.2, size * 0.3)
		if (roll < r.ruins) {
			const kind = n % 4
			if (kind === 0) {
				// A toppled flower block, its carved face tilted toward the sky.
				const place = (g) =>
					put(
						g
							.rotateX(-0.65)
							.rotateZ(0.22)
							.translate(0, size * 0.55, 0),
					)
				place(sandstone(size * 1.3, size * 1.3, size * 0.7, 0.08))
				place(flower(size * 0.5, size * 0.1).translate(0, 0, size * 0.355))
				for (const side of [-1, 1]) {
					place(
						sandstone(size * 1.18, size * 0.09, size * 0.1).translate(
							0,
							side * size * 0.56,
							size * 0.38,
						),
					)
					place(
						sandstone(size * 0.09, size, size * 0.1).translate(side * size * 0.56, 0, size * 0.38),
					)
				}
			} else if (kind === 1) {
				// A fractured column, with the fallen capital beside it.
				put(sandstone(size * 1.1, size * 0.24, size * 1.1).translate(0, size * 0.12, 0))
				for (let course = 0; course < r.ruinCourses; course++)
					put(
						new THREE.CylinderGeometry(size * 0.35, size * 0.4, size * 0.48, 8)
							.rotateZ(course * 0.04)
							.translate(-course * size * 0.015, size * (0.5 + course * 0.49), 0),
					)
				put(
					sandstone(size * 0.9, size * 0.3, size * 0.9, 0.1)
						.rotateZ(0.6)
						.translate(size * 0.85, size * 0.28, size * 0.1),
				)
				put(flower(size * 0.23, size * 0.07).translate(0, size * 0.75, size * 0.37))
			} else if (kind === 2) {
				// A stair runs along the ledge and stops abruptly over the drop.
				for (let step = 0; step < 5; step++) {
					const h = size * (0.22 + step * 0.23)
					put(
						sandstone(size * 0.48, h, size * 0.95, 0.04).translate(
							(step - 2) * size * 0.46,
							h / 2,
							0,
						),
					)
				}
			} else {
				// Voussoirs turn out from one surviving jamb; the crown is missing.
				put(sandstone(size * 0.75, size * 0.25, size * 0.9).translate(-size * 0.7, size * 0.125, 0))
				for (let course = 0; course < 3; course++)
					put(
						sandstone(size * 0.52, size * 0.43, size * 0.65, 0.04).translate(
							-size * 0.7,
							size * (0.48 + course * 0.44),
							0,
						),
					)
				for (let wedge = 0; wedge < 4; wedge++) {
					const a = Math.PI - wedge * 0.29
					put(
						sandstone(size * 0.49, size * 0.39, size * 0.68, 0.03)
							.rotateZ(a)
							.translate(Math.cos(a) * size * 0.7, size * 1.52 + Math.sin(a) * size * 0.7, 0),
					)
				}
				put(flower(size * 0.2, size * 0.07).translate(-size * 0.7, size * 0.92, size * 0.33))
			}
			patch(-size * 0.55, size * 0.2, -size * 0.2, size * 0.3)
		} else if (roll < r.ruins + r.trees) {
			// A thick bent trunk, two crooked boughs and short snapped fingers.
			const limb = (from, to, bottom, top) => {
				const direction = to.clone().sub(from)
				put(
					new THREE.CylinderGeometry(top, bottom, direction.length(), 6)
						.translate(0, direction.length() / 2, 0)
						.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction.normalize()))
						.translate(from.x, from.y, from.z),
					'wood',
				)
			}
			const h = r.treeHeight * (0.9 + rand() * 0.5)
			const root = new THREE.Vector3(0, 0, 0)
			const elbow = new THREE.Vector3(h * 0.08, h * 0.65, h * 0.27)
			const fork = new THREE.Vector3(-h * 0.12, h * 1.08, h * 0.48)
			limb(root, elbow, h * 0.11, h * 0.075)
			limb(elbow, fork, h * 0.075, h * 0.05)
			for (const side of [-1, 1]) {
				const joint = new THREE.Vector3(side * h * 0.48, h * 1.13, h * 0.55)
				const tip = new THREE.Vector3(side * h * 0.7, h * 1.48, h * 0.68)
				limb(fork, joint, h * 0.05, h * 0.032)
				limb(joint, tip, h * 0.032, h * 0.012)
				limb(joint, new THREE.Vector3(side * h * 0.87, h * 1.18, h * 0.43), h * 0.025, h * 0.008)
				limb(root, new THREE.Vector3(side * h * 0.35, 0.03, h * 0.2), h * 0.1, h * 0.025)
			}
		} else {
			// A small rib cage lies along the shelf, with an angular skull at its end.
			for (let bone = 0; bone < 7; bone++) {
				const x = (bone - 3) * size * 0.25
				put(sandstone(size * 0.19, size * 0.16, size * 0.21).translate(x, size * 0.15, 0), 'bone')
				if (bone > 0 && bone < 6)
					put(
						new THREE.TorusGeometry(
							size * (0.42 - Math.abs(bone - 3) * 0.04),
							size * 0.055,
							4,
							9,
							Math.PI,
						)
							.rotateY(Math.PI / 2)
							.translate(x, size * 0.13, 0),
						'bone',
					)
			}
			put(
				sandstone(size * 0.43, size * 0.32, size * 0.32, 0.08)
					.rotateZ(-0.2)
					.translate(size, size * 0.2, 0),
				'bone',
			)
		}
	}
	for (const [name, list] of Object.entries(parts)) {
		if (!list.length) continue
		const merged = own(mergeGeometries(list))
		for (const g of list) g.dispose()
		const mesh = forward(
			new THREE.Mesh(merged, own(makeStyleMaterial(roles[name]))),
			`altamesa-rim-${name}`,
		)
		mesh.layers.set(0)
	}

	// Airbrushed apricot on the sunward cloud sea. Kept below all playable ground;
	// this forward veil never enters the ink pass or changes another map's sky.
	const sun = new THREE.Vector2(s.light.dir[0], s.light.dir[2]).normalize()
	const glow = own(
		new THREE.ShaderMaterial({
			transparent: true,
			depthWrite: false,
			uniforms: {
				sun: { value: sun },
				apricot: { value: new THREE.Color('#ffb87e') },
				cream: { value: new THREE.Color('#ffe6c0') },
			},
			vertexShader: /* glsl */ `
		varying vec2 world;
		void main() {
			vec4 p = modelMatrix * vec4(position, 1.0);
			world = p.xz;
			gl_Position = projectionMatrix * viewMatrix * p;
		}`,
			fragmentShader: /* glsl */ `
		uniform vec2 sun;
		uniform vec3 apricot, cream;
		varying vec2 world;
		void main() {
			float along = dot(world, sun);
			float across = dot(world, vec2(-sun.y, sun.x));
			float halo = exp(-pow((along - 95.0) / 135.0, 2.0) - pow(across / 170.0, 2.0));
			float heart = exp(-pow((along - 125.0) / 65.0, 2.0) - pow(across / 100.0, 2.0));
			gl_FragColor = vec4(mix(apricot, cream, heart), halo * 0.78);
		}`,
		}),
	)
	const sky = forward(
		new THREE.Mesh(
			own(new THREE.PlaneGeometry(s.clouds.size, s.clouds.size).rotateX(-Math.PI / 2)),
			glow,
		),
		'altamesa-sun-haze',
	)
	// Draw after the sight haze; the copied world depth still masks court and ruins.
	sky.renderOrder = 2
	sky.position.y = -12
}
