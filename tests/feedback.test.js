import { afterEach, beforeEach, expect, mock, test } from 'bun:test'
import * as THREE from 'three'
import { createFeedback } from '../src/plugins/dodgeball/feedback.js'

// Presentation values (colours, shake, chip counts, wording) are design choices and deliberately untested; what must hold is that feedback owns a corpse only while animating it, and that its pools are fixed and released.
const CUES = [
	'hit',
	'land',
	'deflect',
	'fall',
	'loose',
	'roll',
	'perfect',
	'taunt',
	'grab',
	'dash',
	'whoosh',
	'close',
	'thud',
]
let scene, feedback, mesh
beforeEach(() => {
	scene = new THREE.Scene()
	mesh = new THREE.Mesh(
		new THREE.CapsuleGeometry(0.4, 1.2),
		new THREE.MeshStandardMaterial({ color: 0xff5d5d }),
	)
	mesh.position.y = 1
	mesh.visible = false // gameplay has removed the unit
	scene.add(mesh)
	const sfx = Object.fromEntries(CUES.map((cue) => [cue, () => {}]))
	feedback = createFeedback(scene, { sfx, confirm() {}, addShake() {}, kickFov() {} })
})
afterEach(() => {
	feedback.dispose()
	mesh.geometry.dispose()
	mesh.material.dispose()
})

function impact(outcome = 'eliminated') {
	return {
		type: 'impact',
		outcome,
		kind: 'arrow',
		perfect: false,
		point: { x: 0, y: 1, z: 0 },
		direction: { x: 1, y: 0, z: 0 },
		source: { id: 0, team: 'A', isHuman: true },
		target: { id: 1, team: 'B', isHuman: false },
	}
}

test('a contact owns the corpse until its exit finishes; a survived hit never starts one', () => {
	feedback.present(impact(), mesh)
	expect(mesh.visible).toBe(true) // feedback, not gameplay, shows the body out
	for (let i = 0; i < 30; i++) feedback.update(0.1)
	expect(mesh.visible).toBe(false)

	// A wounded unit is still playing: nothing may animate or hide its mesh.
	const hurt = impact('hurt')
	hurt.hp = 1
	hurt.maxHp = 2
	feedback.present(hurt, mesh)
	const position = mesh.position.clone()
	feedback.update(0.1)
	expect(mesh.visible).toBe(false)
	expect(mesh.position.equals(position)).toBe(true)
})

test('remote humans do not own local confirmations or bot taunts', () => {
	feedback.dispose()
	const confirm = mock()
	const sfx = Object.fromEntries(CUES.map((cue) => [cue, mock()]))
	feedback = createFeedback(scene, { sfx, confirm })
	const event = impact()
	event.source = { id: 1, team: 'A', isHuman: true, isLocal: false }
	event.target = { id: 2, team: 'B', isHuman: true, isLocal: false }
	feedback.present(event, mesh)
	expect(confirm).not.toHaveBeenCalled()
	feedback.present({ ...event, type: 'shot' })
	expect(sfx.taunt).not.toHaveBeenCalled()
	feedback.present({ ...event, target: { ...event.target, isLocal: true } })
	expect(confirm).toHaveBeenLastCalledWith("YOU'RE OUT")
})
