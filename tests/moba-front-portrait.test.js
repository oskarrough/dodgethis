import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { createPreview } from '../src/plugins/moba/front/preview.js'
import { heroStats, travelAt, numberLines } from '../src/plugins/moba/front/stats.js'
import { tune as kit } from '../src/plugins/moba/tune.js'
import { tune } from '../src/plugins/moba/front/tune.js'
import { PALETTE } from '../src/core/style.js'

function portrait(check) {
	const old = [globalThis.innerWidth, globalThis.innerHeight, globalThis.matchMedia]
	globalThis.innerWidth = 1440
	globalThis.innerHeight = 900
	globalThis.matchMedia = () => ({ matches: false })
	const scene = new THREE.Scene()
	const camera = new THREE.PerspectiveCamera(35, 1440 / 900, 0.1, 200)
	camera.position.set(0, 5, 10)
	camera.lookAt(0, 1, 0)
	camera.updateMatrixWorld()
	const sounds = []
	let palette
	const preview = createPreview(
		{
			scene,
			setPalette: (next) => {
				palette = next
			},
			camera: { view: camera, update() {} },
			audio: { blip: (cue) => sounds.push(cue) },
		},
		{ setStylePreset: () => () => {}, camera: { frame: () => () => {} } },
	)
	try {
		check({ preview, scene, sounds, palette })
	} finally {
		preview.dispose()
		;[globalThis.innerWidth, globalThis.innerHeight, globalThis.matchMedia] = old
	}
}

test('portrait starts idle, keeps full-strength team colour, hides shoes and faces three-quarters', () => {
	portrait(({ preview, scene, palette, sounds }) => {
		preview.update(1 / 144)
		expect(preview.state.slot).toBe(null)
		expect(preview.state.phase).toBe('idle')
		expect(preview.state.bolt).toBe(false)
		expect(preview.state.tell).toBe(false)
		expect(palette.teamA).toBe(PALETTE.teamA)
		const hero = scene.getObjectByName('front-fletcher')
		expect(hero.getObjectByName('shoes').visible).toBe(false)
		expect(hero.rotation.y).toBeGreaterThan(Math.PI / 2)
		expect(hero.rotation.y).toBeLessThan(Math.PI)
		expect(sounds).toHaveLength(0)
	})
})

test('hover followed by a click during aim does not restart or add a second cue', () => {
	portrait(({ preview, sounds }) => {
		expect(preview.start('Q')).toBe(true)
		preview.update(0.25)
		expect(preview.start('Q')).toBe(false)
		expect(preview.state.elapsed).toBeCloseTo(0.25, 12)
		preview.update(tune.preview.hold + kit.loose.castPoint + 0.15 - 0.25)
		expect(preview.state.phase).toBe('flight')
		expect(preview.state.bolt).toBe(true)
		expect(sounds).toEqual([kit.sounds.loose])
		const frame = preview.state
		preview.freeze()
		preview.update(0.1)
		expect(preview.state).toEqual(frame)
		preview.freeze(false)
		preview.update(0.01)
		expect(sounds).toHaveLength(1)
	})
})

test('Q uses the enemy tell only during its cast point, with both boundary sides covered', () => {
	portrait(({ preview, scene }) => {
		preview.start('Q')
		preview.update(tune.preview.hold - 0.001)
		expect(preview.state.phase).toBe('aim')
		expect(preview.state.tell).toBe(false)
		preview.update(0.002)
		expect(preview.state.phase).toBe('cast')
		expect(preview.state.tell).toBe(true)
		const tell = scene.getObjectByName('moba-enemy-tell')
		expect(tell.children[0].scale.x).toBe(kit.loose.radius * 2)
		expect(tell.children[0].scale.z).toBe(kit.loose.range)
		preview.update(kit.loose.castPoint - 0.002)
		expect(preview.state.tell).toBe(true)
		preview.update(0.002)
		expect(preview.state.tell).toBe(false)
		expect(preview.state.bolt).toBe(true)
	})
})

test('Trait is inert on focus and confirm; cancelling Volley for Numbers returns a neutral portrait', () => {
	portrait(({ preview, sounds }) => {
		preview.start('Trait')
		preview.update(1)
		preview.start('Trait')
		expect(preview.state.phase).toBe('idle')
		expect(sounds).toHaveLength(0)
		preview.start('R')
		preview.update(0.9)
		expect(preview.state.rotation[2]).toBeGreaterThan(0)
		preview.stop()
		preview.update(1 / 144)
		expect(preview.state.phase).toBe('idle')
		expect(preview.state.rotation).toEqual([0, 0, 0])
		expect(preview.state.tell).toBe(false)
		expect(preview.state.bolt).toBe(false)
	})
})

test('Q margin includes flight, excludes the demonstration hold, and crosses zero from both sides', () => {
	const values = structuredClone(kit)
	const front = structuredClone(tune)
	const s = heroStats(values, front)
	expect(s.q.margin).toBeCloseTo(0.5444444444444444, 10)
	expect(numberLines(s, 8).join(' ')).toContain('0.544 s to spare at 8 m')
	const threshold = (s.q.sidestep - s.q.warning) * values.loose.speed
	front.preview.distance = threshold - 1e-5
	const short = heroStats(values, front)
	expect(short.q.margin).toBeLessThan(0)
	expect(travelAt(short.q.warning + short.q.flight, values.hero)).toBeLessThan(short.q.clear)
	expect(numberLines(short, front.preview.distance).join(' ')).toContain('too late')
	front.preview.distance = threshold + 1e-5
	const long = heroStats(values, front)
	expect(long.q.margin).toBeGreaterThan(0)
	expect(travelAt(long.q.warning + long.q.flight, values.hero)).toBeGreaterThan(long.q.clear)
	front.preview.hold = 10
	expect(heroStats(values, front).q.margin).toBe(long.q.margin)
})
