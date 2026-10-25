import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { makeStyleMaterial } from '../../../../core/stylepass.js'
import { cliffPillar, chippedBlock } from '../../carve.js'
import { paint } from '../../restyle.js'
import { tune } from '../../tune.js'

// Salt works sit wholly past the collision rim. Their crust, timber and iron each draw once.
export function saltWorks({ own, forward, outline, rand }) {
	const s = tune.salinas
	const w = s.workings,
		parts = { courtShade: [], scenery: [], leaf: [], leafDeep: [] },
		water = []
	const halfX = Math.max(...outline.map((p) => Math.abs(p.x)))
	const halfZ = Math.max(...outline.map((p) => Math.abs(p.z)))
	const put = (g, role, origin) => {
		g.translate(...origin)
		parts[role].push(g)
	}
	const beam = (a, b, width, role, origin) => {
		const from = new THREE.Vector3(...a),
			to = new THREE.Vector3(...b),
			delta = to.clone().sub(from)
		const g = new THREE.BoxGeometry(width, delta.length(), width)
		g.applyQuaternion(
			new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()),
		)
		g.translate(...from.add(to).multiplyScalar(0.5).toArray())
		put(g, role, origin)
	}
	for (const [side, fraction, drop, size, pump, outset] of w.sites) {
		const origin = [side * (halfX + size * 0.85 + outset), -drop, fraction * halfZ]
		put(cliffPillar(size, w.shelfDepth, s.rim.pillars, rand), 'courtShade', origin)
		put(
			new THREE.CylinderGeometry(size * 0.91, size * 0.94, 0.28, 7).translate(0, 0.06, 0),
			'scenery',
			origin,
		)
		// Low rectangular evaporation pans, with pale lips and quiet poured brine.
		const pan = size * 0.96
		water.push(
			new THREE.PlaneGeometry(pan, pan * 0.72)
				.rotateX(-Math.PI / 2)
				.translate(origin[0], origin[1] + 0.22, origin[2] + size * 0.27),
		)
		for (const sign of [-1, 1]) {
			put(
				chippedBlock(pan + 0.24, 0.18, 0.16, s.carving, rand).translate(
					0,
					0.24,
					size * 0.27 + sign * pan * 0.36,
				),
				'scenery',
				origin,
			)
			put(
				chippedBlock(0.16, 0.18, pan * 0.72, s.carving, rand).translate(
					sign * pan * 0.5,
					0.24,
					size * 0.27,
				),
				'scenery',
				origin,
			)
		}
		if (pump) {
			// A low gabled salt-raker's shed, its rough boards visible in the match view.
			const sx = -side * size * 0.25,
				sz = -size * 0.42,
				width = w.shedWidth,
				h = w.shedHeight
			put(new THREE.BoxGeometry(width, h, width * 0.7).translate(sx, h / 2, sz), 'leaf', origin)
			for (const sign of [-1, 1]) {
				put(
					new THREE.BoxGeometry(width * 0.66, 0.12, width * 0.86)
						.rotateZ(sign * 0.48)
						.translate(sx + sign * width * 0.27, h + width * 0.12, sz),
					'leafDeep',
					origin,
				)
				for (let board = 0; board < 7; board++)
					put(
						new THREE.BoxGeometry(0.045, h * 0.96, 0.045).translate(
							sx - width * 0.45 + board * width * 0.15,
							h / 2,
							sz + sign * width * 0.36,
						),
						'leafDeep',
						origin,
					)
			}
			put(
				new THREE.BoxGeometry(width * 0.25, h * 0.7, 0.055).translate(
					sx,
					h * 0.35,
					sz + width * 0.36,
				),
				'leafDeep',
				origin,
			)
		}
		// Broad salt heaps, not glitter or collectible crystals.
		for (let i = 0; i < 2; i++)
			put(
				new THREE.ConeGeometry(size * (0.18 + i * 0.035), size * 0.2, 7).translate(
					side * size * 0.48,
					size * 0.1,
					-size * 0.3 + i * 0.7,
				),
				'scenery',
				origin,
			)
		if (!pump) continue
		const px = side * size * 0.35,
			pz = -size * 0.43,
			H = w.pumpHeight
		for (const x of [-1, 1])
			for (const z of [-1, 1]) {
				beam(
					[px + x * 0.65, 0.2, pz + z * 0.65],
					[px + x * 0.22, H, pz + z * 0.22],
					w.beam,
					'leafDeep',
					origin,
				)
				for (let tier = 0; tier < 3; tier++) {
					const y = 0.3 + (tier * H) / 3,
						spread = 0.62 - tier * 0.13
					beam(
						[px + x * spread, y, pz + z * spread],
						[px - x * (spread - 0.13), y + H / 3, pz + z * (spread - 0.13)],
						w.beam * 0.65,
						'leafDeep',
						origin,
					)
				}
			}
		const wheel = [origin[0] + px, origin[1] + H, origin[2] + pz + 0.3]
		put(new THREE.CylinderGeometry(0.23, 0.23, 0.28, 8).rotateX(Math.PI / 2), 'leafDeep', wheel)
		for (let blade = 0; blade < w.blades; blade++) {
			const angle = (blade * Math.PI * 2) / w.blades,
				r = w.pumpRadius
			const shape = new THREE.Shape()
			shape.moveTo(0.36, -0.06)
			shape.lineTo(r, -0.25)
			shape.lineTo(r * 0.94, 0.3)
			shape.lineTo(0.55, 0.16)
			shape.closePath()
			put(
				new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false }).rotateZ(angle),
				'leaf',
				wheel,
			)
			beam(
				[0, 0, 0.08],
				[Math.cos(angle) * r, Math.sin(angle) * r, 0.08],
				w.beam * 0.45,
				'leafDeep',
				wheel,
			)
		}
	}
	const batch = (list, mat, name, opaque) => {
		if (!list.length) return
		const ready = list.map((g) => {
			const n = g.index ? g.toNonIndexed() : g
			n.deleteAttribute('uv')
			if (n !== g) g.dispose()
			return n
		})
		const geometry = own(mergeGeometries(ready))
		for (const g of ready) g.dispose()
		const mesh = forward(new THREE.Mesh(geometry, own(mat)), name)
		if (opaque) mesh.layers.set(0)
	}
	for (const [role, list] of Object.entries(parts))
		batch(list, makeStyleMaterial(role), `salinas-works-${role}`, true)
	const brine = new THREE.ShaderMaterial({
		uniforms: {
			lit: { value: paint(w, 'brine') },
			shade: { value: paint(w, 'brineShade') },
			ripple: { value: paint(w, 'ripple') },
		},
		vertexShader:
			'varying vec2 at; void main(){at=position.xz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
		fragmentShader: `varying vec2 at; uniform vec3 lit,shade,ripple;
		void main(){float band=sin(at.x*1.8+sin(at.y*2.3));float line=smoothstep(.96,.99,sin(at.y*7.0+sin(at.x*1.5)));vec3 col=mix(shade,lit,step(-.2,band));gl_FragColor=vec4(mix(col,ripple,line*.35),1.0);}`,
	})
	batch(water, brine, 'salinas-brine', false)
}
