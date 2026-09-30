import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { createPips } from '../src/plugins/moba/pips.js'

test('Ball and local hero markers read rendered positions, disappear on screen and clean up on expiry', () => {
	const oldDocument = globalThis.document
	const nodes = []
	globalThis.document = {
		body: { append() {} },
		createElement() {
			const node = {
				style: {},
				dataset: {},
				hidden: false,
				removed: false,
				textContent: '',
				append() {},
				setAttribute() {},
				remove() {
					this.removed = true
				},
			}
			nodes.push(node)
			return node
		},
	}
	const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200)
	camera.position.set(0, 20, 12.5)
	camera.lookAt(0, 0, 0)
	camera.updateMatrixWorld(true)
	const pips = createPips()
	const hero = {
		id: 'second-seat',
		team: 'B',
		dead: false,
		body: { position: { x: 0, z: 0 }, mesh: { position: new THREE.Vector3(-30, 0, 0) } },
	}
	const ball = new THREE.Vector3(30, 0, 0)
	try {
		pips.update(camera, [], 'B', { hero, ball })
		const you = nodes.find((n) => n.dataset.marker === 'You')
		const objective = nodes.find((n) => n.dataset.marker === 'Ball')
		expect(you.hidden).toBe(false)
		expect(you.textContent).toBe('← You')
		expect(objective.textContent).toBe('→ Ball')
		expect(objective.style.left).toContain('clamp(')
		pips.update(camera, [], 'B', { hero, carrying: true })
		expect(you.textContent).toBe('← You + Ball')
		hero.body.mesh.position.set(0, 0, 0)
		pips.update(camera, [], 'B', { hero, ball: null })
		expect(you.hidden).toBe(true)
		expect(objective.removed).toBe(true)
		hero.dead = true
		pips.update(camera, [], 'B', { hero })
		expect(you.removed).toBe(true)
	} finally {
		pips.dispose()
		if (oldDocument === undefined) delete globalThis.document
		else globalThis.document = oldDocument
	}
})
