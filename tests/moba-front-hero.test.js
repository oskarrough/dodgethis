import { expect, test } from 'bun:test'
import * as THREE from 'three'
import {
	heroStats,
	travelAt,
	escapeTime,
	kitLines,
	numberLines,
} from '../src/plugins/moba/front/stats.js'
import { createControls } from '../src/plugins/moba/front/controls.js'
import { createPreview } from '../src/plugins/moba/front/preview.js'
import { tune as kit } from '../src/plugins/moba/tune.js'
import { tune } from '../src/plugins/moba/front/tune.js'

const copy = () => structuredClone(kit)
test('all kit numbers are pure and live; level scaling is additive and warning is not flight', () => {
	const values = copy()
	const before = structuredClone(values)
	const one = heroStats(values, tune)
	const ten = heroStats(values, tune, 10)
	expect(values).toEqual(before)
	expect(one.q.warning).toBe(values.loose.castPoint)
	expect(one.q.flight).toBeCloseTo(8 / values.loose.speed, 10)
	expect(one.q.steady).toBeCloseTo(0.15, 10)
	expect(one.e.steady).toBeCloseTo(0.59, 10)
	expect(one.e.margin).toBeCloseTo(0.104444444444444, 10)
	expect(ten.hp).toBeCloseTo(1904, 10)
	expect(ten.q.damage).toBeCloseTo(190.4, 10)
	expect(ten.e.damage).toBeCloseTo(244.8, 10)
	expect(ten.r.damage).toBeCloseTo(435.2, 10)
	expect(ten.q.warning).toBe(one.q.warning)
	values.loose.damage = 230
	expect(kitLines(heroStats(values, tune))[1]).toContain('230 damage')
	expect(numberLines(heroStats(values, tune, 10), 8).join(' ')).toContain('313 damage')
})

test('Q and Rain clearance thresholds pass from both sides, with 60 Hz acceleration', () => {
	const s = heroStats(copy(), tune)
	for (const [distance, time, steady] of [
		[s.q.clear, s.q.sidestep, s.q.steady],
		[s.e.clear, s.e.escape, s.e.steady],
	]) {
		expect(time).toBeGreaterThan(steady)
		expect(time).toBeCloseTo(steady + 1 / 180, 10)
		expect(travelAt(time - 1e-6, kit.hero)).toBeLessThan(distance)
		expect(travelAt(time + 1e-6, kit.hero)).toBeGreaterThan(distance)
		expect(travelAt(time, kit.hero)).toBeCloseTo(distance, 10)
	}
	const v = copy()
	// Solve speed against the body's one-tick acceleration deficit (speed / 180).
	const speed = (v.rain.radius + v.hero.radius) / (v.rain.delay - 1 / 180)
	v.hero.speed = speed - 1e-5
	expect(heroStats(v, tune).e.margin).toBeLessThan(0)
	v.hero.speed = speed + 1e-5
	expect(heroStats(v, tune).e.margin).toBeGreaterThan(0)
	expect(escapeTime(0, v.hero)).toBe(0)
	expect(escapeTime(1, { ...v.hero, speed: 0 })).toBe(Infinity)
})

test('held B survives a screen rebind, and every kit control confirms only itself', () => {
	const activated = []
	let backs = 0
	const controls = createControls({
		count: 8,
		focus() {},
		device() {},
		activate: (i) => activated.push(i),
		back: () => backs++,
		initialBackHeld: true,
	})
	controls.pad({ move: 0, confirm: false }, { buttons: [false, true] })
	expect(backs).toBe(0)
	controls.pad({ move: 0, confirm: false }, { buttons: [false, false] })
	controls.pad({ move: 0, confirm: false }, { buttons: [false, true] })
	expect(backs).toBe(1)
	for (let i = 0; i < 8; i++) {
		controls.point(i)
		controls.key({ code: 'Tab', preventDefault() {} })
		controls.key({ code: 'Tab', shiftKey: true, preventDefault() {} })
		controls.key({ code: 'Enter', preventDefault() {} })
	}
	expect(activated).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
})

test('preview timers interpolate at 144 Hz, switch cleanly and dispose mid-cast without touching physics', () => {
	const saved = [globalThis.innerWidth, globalThis.innerHeight, globalThis.matchMedia]
	globalThis.innerWidth = 1440
	globalThis.innerHeight = 900
	globalThis.matchMedia = () => ({ matches: false })
	try {
		const scene = new THREE.Scene()
		const outside = new THREE.Group()
		scene.add(outside)
		const camera = new THREE.PerspectiveCamera(35, 1440 / 900, 0.1, 200)
		camera.position.set(0, 3.5, 8)
		camera.lookAt(0, 1, 0)
		camera.updateMatrixWorld()
		let sounds = 0
		let restored = 0
		const app = {
			scene,
			setPalette() {},
			camera: { view: camera, update() {} },
			audio: { blip: () => sounds++ },
		}
		const run = { setStylePreset: () => () => restored++, camera: { frame: () => () => {} } }
		for (const slot of ['Q', 'W', 'E', 'R']) {
			const preview = createPreview(app, run)
			expect(outside.visible).toBe(false)
			const before = sounds
			preview.start(slot)
			for (let i = 0; i < 180; i++) preview.update(1 / 144)
			expect(sounds).toBe(before + 1)
			preview.start('E')
			preview.update(tune.preview.hold + kit.rain.delay / 2)
			let fill
			scene.traverse((object) => {
				if (
					object.geometry?.type === 'CircleGeometry' &&
					object.parent.parent?.scale.x === tune.preview.zoneScale
				)
					fill = object
			})
			const previous = fill.scale.x
			preview.update(1 / 144)
			expect(fill.scale.x).toBeGreaterThan(previous)
			expect(fill.scale.x - previous).toBeCloseTo(kit.rain.radius / kit.rain.delay / 144, 10)
			expect(sounds).toBe(before + 2)
			preview.dispose()
			expect(scene.children).toEqual([outside])
			expect(outside.visible).toBe(true)
		}
		expect(restored).toBe(4)
	} finally {
		;[globalThis.innerWidth, globalThis.innerHeight, globalThis.matchMedia] = saved
	}
})
