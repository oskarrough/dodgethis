import { afterEach, beforeEach, expect, mock, test } from 'bun:test'
import * as THREE from 'three'
import { createFeedback } from '../src/feedback.js'

let scene, feedback, mesh, sfx, confirm, addShake
beforeEach(() => {
	scene = new THREE.Scene()
	mesh = new THREE.Mesh(
		new THREE.CapsuleGeometry(0.4, 1.2),
		new THREE.MeshStandardMaterial({ color: 0xff5d5d }),
	)
	mesh.position.y = 1
	mesh.visible = false // gameplay has removed the unit
	scene.add(mesh)
	sfx = {
		hit: mock(),
		land: mock(),
		deflect: mock(),
		fall: mock(),
		loose: mock(),
		roll: mock(),
		perfect: mock(),
		taunt: mock(),
		grab: mock(),
		dash: mock(),
	}
	confirm = mock()
	addShake = mock()
	feedback = createFeedback(scene, { sfx, confirm, addShake })
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

test('contact immediately marks the target out, then finishes the exit and confirmation', () => {
	const color = mesh.material.color.clone()
	feedback.present(impact(), mesh)
	expect(mesh.visible).toBe(true)
	expect(mesh.scale.y).toBe(0.65)
	expect(mesh.material.color.equals(color)).toBe(false)
	expect(sfx.hit).toHaveBeenCalledTimes(1)
	expect(confirm).toHaveBeenLastCalledWith('OUT!')
	expect(addShake).toHaveBeenCalledWith(0.7)
	feedback.update(0.05)
	const chips = scene.getObjectByName('impact-ink')
	expect(chips.visible).toBe(true)
	const matrix = new THREE.Matrix4()
	chips.getMatrixAt(0, matrix)
	expect(matrix.elements[12]).toBeGreaterThan(0) // incoming +X, not radial-only scatter
	for (let i = 0; i < 30; i++) feedback.update(0.1)
	expect(mesh.visible).toBe(false)
	expect(chips.visible).toBe(false)
	expect(confirm).toHaveBeenLastCalledWith('')
})

test('action feedback shares the event point and reuses the chip pool for dash streaks', () => {
	const event = { ...impact(), type: 'shot', perfect: true, outcome: undefined }
	feedback.present(event)
	expect(sfx.loose).toHaveBeenCalledWith(1, event.point)
	expect(sfx.perfect).toHaveBeenCalledWith(event.point)
	expect(sfx.taunt).not.toHaveBeenCalled()
	feedback.present({ ...event, type: 'pickup' })
	expect(sfx.grab).toHaveBeenCalledWith(event.point, 1)
	feedback.present({ ...event, type: 'dash' })
	feedback.update(0.01)
	expect(sfx.dash).toHaveBeenCalledWith(event.point)
	expect(scene.getObjectByName('impact-ink').visible).toBe(true)
	expect(scene.getObjectByName('impact-ink').count).toBe(64)
	for (let i = 0; i < 3; i++) feedback.update(0.1)
	expect(scene.getObjectByName('impact-ink').visible).toBe(false)
	expect(confirm).not.toHaveBeenCalled()
})

test('misses and godmode deflections never confirm a kill; recovery makes no impact', () => {
	feedback.present(impact('landed'))
	feedback.present(impact('deflected'))
	feedback.present(impact('recovered'))
	expect(sfx.land).toHaveBeenCalledTimes(1)
	expect(sfx.deflect).toHaveBeenCalledTimes(1)
	expect(sfx.hit).not.toHaveBeenCalled()
	expect(confirm).not.toHaveBeenCalled()
	expect(mesh.visible).toBe(false)
})

test('only the local shooter gets a kill confirmation, and a mutual hit prioritizes being out', () => {
	const allyHit = impact()
	allyHit.source.isHuman = false
	feedback.present(allyHit)
	expect(confirm).not.toHaveBeenCalled()
	const humanHit = impact()
	humanHit.target.isHuman = true
	humanHit.source.isHuman = false
	feedback.present(humanHit)
	feedback.present(impact())
	expect(confirm).toHaveBeenLastCalledWith("YOU'RE OUT")
})

test('fall has its own sound and downward exit, without a contact burst', () => {
	const event = { ...impact(), type: 'fall', source: undefined, direction: { x: 0, y: -1, z: 0 } }
	feedback.present(event, mesh)
	const y = mesh.position.y
	feedback.update(0.1)
	expect(mesh.position.y).toBeLessThan(y)
	expect(sfx.fall).toHaveBeenCalledTimes(1)
	expect(sfx.hit).not.toHaveBeenCalled()
	expect(scene.getObjectByName('impact-ink').visible).toBe(false)
})

test('contact spam reuses a fixed pool, and reset clears effects before the next round', () => {
	const chips = scene.getObjectByName('impact-ink')
	const matrices = chips.instanceMatrix
	const geometry = chips.geometry
	const material = chips.material
	for (let i = 0; i < 100; i++) feedback.present(impact('landed'))
	feedback.present(impact(), mesh)
	feedback.update(0.01)
	expect(chips.count).toBe(64)
	expect(chips.instanceMatrix).toBe(matrices)
	expect(chips.geometry).toBe(geometry)
	expect(chips.material).toBe(material)
	expect(scene.children).toHaveLength(3)
	feedback.reset()
	const position = mesh.position.clone()
	feedback.update(10) // no stale death animation touches a retired round's mesh
	expect(mesh.position.equals(position)).toBe(true)
	expect(chips.visible).toBe(false)
	expect(confirm).toHaveBeenLastCalledWith('')
})

test('court feedback distinguishes directional dash scratches from landing ticks', () => {
	const marks = scene.getObjectByName('court-ink')
	const matrix = new THREE.Matrix4()
	feedback.present({ ...impact(), type: 'dash', outcome: undefined })
	feedback.update(0.01)
	expect(marks.visible).toBe(true)
	marks.getMatrixAt(0, matrix)
	expect(matrix.elements[8]).toBeCloseTo(0.55) // long stroke follows incoming +X
	expect(matrix.elements[13]).toBeCloseTo(0.026) // court surface, not capsule centre
	marks.getMatrixAt(2, matrix)
	expect(matrix.elements[0]).toBe(0) // only the two shoe scratches
	feedback.reset()
	feedback.present({ ...impact('landed'), surface: 'court', point: { x: 0, y: 0, z: 0 } })
	feedback.update(0.01)
	marks.getMatrixAt(2, matrix)
	expect(new THREE.Vector3().setFromMatrixScale(matrix).z).toBeCloseTo(0.22)
	for (let i = 0; i < 12; i++) feedback.update(0.1)
	expect(marks.visible).toBe(false)
})

test('marks never project aerial hits, off-court recovery, airborne dashes, or rim contacts onto the floor', () => {
	feedback.present(impact())
	feedback.present(impact('deflected'))
	feedback.present({ ...impact('recovered'), surface: 'void' })
	feedback.present({ ...impact(), type: 'dash', outcome: undefined, point: { x: 0, y: 3, z: 0 } })
	feedback.present({ ...impact('landed'), surface: 'court', point: { x: 5.4, y: 0, z: 0 } })
	feedback.update(0.01)
	expect(scene.getObjectByName('court-ink').visible).toBe(false)
})

test('court marks stay bounded under spam and reset without resurrecting old strokes', () => {
	const marks = scene.getObjectByName('court-ink')
	const matrices = marks.instanceMatrix
	const event = { ...impact('landed'), surface: 'court', point: { x: 0, y: 0, z: 0 } }
	for (let i = 0; i < 100; i++) feedback.present(event)
	feedback.update(0.01)
	expect(marks.count).toBe(48)
	expect(marks.instanceMatrix).toBe(matrices)
	expect(marks.visible).toBe(true)
	feedback.reset()
	expect(marks.visible).toBe(false)
	feedback.present(event)
	feedback.update(0.01)
	const matrix = new THREE.Matrix4()
	marks.getMatrixAt(3, matrix)
	expect(new THREE.Vector3().setFromMatrixScale(matrix).length()).toBe(0)
	const geometryDisposed = mock()
	const materialDisposed = mock()
	marks.geometry.addEventListener('dispose', geometryDisposed)
	marks.material.addEventListener('dispose', materialDisposed)
	feedback.dispose()
	expect(scene.getObjectByName('court-ink')).toBeUndefined()
	expect(geometryDisposed).toHaveBeenCalledTimes(1)
	expect(materialDisposed).toHaveBeenCalledTimes(1)
})
