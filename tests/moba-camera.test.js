import { expect, test } from 'bun:test'
import { createFollow, viewFootprint } from '../src/plugins/moba/follow.js'
import { createCameraControls } from '../src/plugins/moba/camera-controls.js'
import { createCursor } from '../src/plugins/moba/cursor.js'
import { FLOOR } from '../src/plugins/moba/map.js'
import { tune } from '../src/plugins/moba/tune.js'

function key(target, code, type = 'keydown', extra = {}) {
	const e = new Event(type, { cancelable: true })
	Object.assign(e, { code, repeat: false, ...extra })
	target.dispatchEvent(e)
	return e
}

test('arrows pan freely, release stays put, Space recentres and holds on the moving hero', () => {
	const target = new EventTarget()
	const controller = new AbortController()
	const follow = createFollow()
	const controls = createCameraControls(target, controller.signal, follow)
	const hero = { x: 2, z: 3 }
	const frame = (dt = 0.1) => follow.frame(dt, hero, null, controls.read()).target
	expect({ ...frame() }).toMatchObject(hero)
	expect(key(target, 'ArrowRight').defaultPrevented).toBe(true)
	frame()
	expect(frame().x).toBeCloseTo(6)
	key(target, 'ArrowRight', 'keyup')
	hero.x = 12
	expect(frame().x).toBeCloseTo(6)
	key(target, 'Space')
	expect(frame().x).toBe(12)
	hero.x = 14
	for (let i = 0; i < 10; i++) frame()
	expect(frame().x).toBeCloseTo(14)
	key(target, 'Space', 'keyup')
	hero.x = 16
	for (let i = 0; i < 10; i++) frame()
	expect(frame().x).toBeCloseTo(14) // restore the free mode set by panning
	key(target, 'Space')
	expect(frame().x).toBe(16)
	key(target, 'Space', 'keyup')
	hero.x = 18
	expect(frame().x).toBe(16)
	controller.abort()
})

test('a Space tap from follow mode keeps following after release', () => {
	const target = new EventTarget()
	const controller = new AbortController()
	const follow = createFollow()
	const controls = createCameraControls(target, controller.signal, follow)
	const hero = { x: 2, z: 3 }
	const frame = () => follow.frame(0.1, hero, null, controls.read()).target
	frame()
	key(target, 'Space')
	expect(frame().x).toBe(2)
	key(target, 'Space', 'keyup')
	hero.x = 8
	for (let i = 0; i < 10; i++) frame()
	expect(frame().x).toBeCloseTo(8)
	controller.abort()
})

test('pan speed is tunable and clamps at all floor edges', () => {
	const follow = createFollow({ ...tune.follow, pan: 10 })
	const hero = { x: 0, z: 0 }
	follow.frame(0, hero, null)
	expect(follow.frame(0.1, hero, null, { pan: { x: 1, z: 0 } }).target.x).toBe(1)
	expect(follow.frame(100, hero, null, { pan: { x: 1, z: 1 } }).target).toMatchObject({
		x: FLOOR.halfX - viewFootprint(tune.follow, 1).halfX - tune.follow.viewPadding,
		z: FLOOR.halfZ - viewFootprint(tune.follow, 1).maxZ - tune.follow.viewPadding,
	})
	expect(follow.frame(100, hero, null, { pan: { x: -1, z: -1 } }).target).toMatchObject({
		x: -FLOOR.halfX + viewFootprint(tune.follow, 1).halfX + tune.follow.viewPadding,
		z: -FLOOR.halfZ - viewFootprint(tune.follow, 1).minZ + tune.follow.viewPadding,
	})
	expect(follow.frame(1, hero, null).target).toMatchObject({
		x: -FLOOR.halfX + viewFootprint(tune.follow, 1).halfX + tune.follow.viewPadding,
		z: -FLOOR.halfZ - viewFootprint(tune.follow, 1).minZ + tune.follow.viewPadding,
	})
})

test('diagonal pan has the same speed, Space wins over arrows, blur releases keys', () => {
	const target = new EventTarget()
	const controller = new AbortController()
	const follow = createFollow()
	const controls = createCameraControls(target, controller.signal, follow)
	const hero = { x: 0, z: 3.4 }
	follow.frame(0, hero, null)
	key(target, 'ArrowRight')
	key(target, 'ArrowUp')
	const at = follow.frame(0.04, hero, null, controls.read()).target
	expect(Math.hypot(at.x - hero.x, at.z - hero.z)).toBeCloseTo(0.8)
	key(target, 'Space')
	expect(follow.frame(0.1, hero, null, controls.read()).target).toMatchObject(hero)
	target.dispatchEvent(new Event('blur'))
	expect(controls.read()).toEqual({ centred: false, pan: { x: 0, z: 0 } })
	controller.abort()
	key(target, 'ArrowDown')
	expect(controls.read().pan.z).toBe(0)
})

test('mouse follow stays on the hero, pad retains held-aim framing and ignores pan', () => {
	const follow = createFollow()
	const hero = { x: 2, z: 3 }
	for (let i = 0; i < 100; i++) {
		expect(follow.frame(1 / 144, hero, { x: i * 10, z: -i }).target).toMatchObject(hero)
	}
	follow.snap()
	const at = follow.frame(0.1, hero, { x: 6, z: 3 }, { pad: true, pan: { x: 1, z: 1 } }).target
	expect(at).toMatchObject({ x: 3, z: 3 })
})

test('mouse follow has no extra lag and suspended menus cannot pan or recenter', () => {
	const target = new EventTarget()
	const controller = new AbortController()
	const follow = createFollow()
	let enabled = true
	const controls = createCameraControls(target, controller.signal, follow, () => enabled)
	const hero = { x: 0, z: 0 }
	follow.frame(0, hero, null)
	hero.x = 4
	expect(follow.frame(1 / 144, hero, null).target.x).toBe(4)
	key(target, 'ArrowRight')
	enabled = false
	key(target, 'ArrowRight', 'keyup')
	key(target, 'ArrowLeft')
	key(target, 'Space')
	expect(controls.read()).toEqual({ centred: false, pan: { x: 0, z: 0 } })
	controller.abort()
})

test('native cursor selects move, attack, targeting; restores on pause, pad and disposal', () => {
	const canvas = { style: { cursor: 'auto' } }
	const cursor = createCursor(canvas)
	cursor.update()
	expect(canvas.style.cursor).toContain('move.svg')
	expect(canvas.style.cursor).toContain('5 4')
	cursor.update({ enemy: true })
	expect(canvas.style.cursor).toContain('attack.svg')
	cursor.update({ enemy: true, aiming: true })
	expect(canvas.style.cursor).toContain('target.svg')
	expect(canvas.style.cursor).toContain('24 24')
	cursor.update({ paused: true })
	expect(canvas.style.cursor).toBe('auto')
	cursor.update({ pad: true, aiming: true })
	expect(canvas.style.cursor).toBe('auto')
	cursor.update()
	cursor.dispose()
	expect(canvas.style.cursor).toBe('auto')
})
