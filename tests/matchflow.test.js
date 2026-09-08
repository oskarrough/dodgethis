import { afterEach, beforeEach, expect, test } from 'bun:test'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { createMatchFlow } from '../src/matchflow.js'
import { buildCourt } from '../src/court.js'
import { tune } from '../src/tune.js'

await RAPIER.init({})

let flow, ctx, overlay, fade, savedSound, savedPause
beforeEach(() => {
	savedSound = tune.fx.sound
	savedPause = tune.physics.paused
	tune.fx.sound = false
	tune.physics.paused = false
	const scene = new THREE.Scene()
	const world = new RAPIER.World({ x: 0, y: tune.physics.gravity, z: 0 })
	world.timestep = 1 / 60
	buildCourt(scene, world, RAPIER)
	ctx = {
		scene,
		world,
		RAPIER,
		eventQueue: new RAPIER.EventQueue(true),
		combat: { push() {} },
		present() {},
	}
	overlay = {
		card: null,
		show(card) {
			this.card = card
		},
		hide() {
			this.card = null
		},
	}
	const classes = new Set()
	fade = {
		textContent: '',
		classList: {
			add: (value) => classes.add(value),
			remove: (value) => classes.delete(value),
			contains: (value) => classes.has(value),
		},
	}
	flow = createMatchFlow({
		ctx,
		overlay,
		fadeEl: fade,
		splashEl: { hidden: false },
		portalOptions: [],
		clearActions() {},
		resetPresentation() {},
		onChange() {},
		onTheme() {},
	})
	flow.startMatch(1, { arrowCount: 2, seed: 17 })
})
afterEach(() => {
	flow?.dispose()
	ctx?.eventQueue.free()
	ctx?.world.free()
	tune.fx.sound = savedSound
	tune.physics.paused = savedPause
})

function winRound() {
	flow.round.removeUnit('B')
	for (let i = 0; i < 180 && flow.phase === 'playing'; i++) flow.round.step(1 / 60, { x: 0, z: 0 })
}

test('a real round result scores once and cannot be restarted for another point', async () => {
	const first = flow.round
	winRound()
	expect(flow.phase).toBe('roundOver')
	expect(flow.match.wins).toEqual({ A: 1, B: 0 })
	flow.endRound('A')
	flow.restartRound()
	await Bun.sleep(220)
	expect(flow.round).toBe(first)
	expect(flow.transitioning).toBe(false)
	expect(flow.match.wins).toEqual({ A: 1, B: 0 })
	expect(flow.match.round).toBe(1)
	// Advancing is a fresh round; winning that round ends this best-of-three.
	overlay.card.actions.find((action) => action.label === 'Next round').onSelect()
	await Bun.sleep(400)
	expect(flow.round).not.toBe(first)
	expect(first.units).toHaveLength(0)
	expect(flow.match.round).toBe(2)
	winRound()
	expect(flow.phase).toBe('matchOver')
	expect(flow.match.wins).toEqual({ A: 2, B: 0 })
	flow.endRound('A')
	expect(flow.match.wins.A).toBe(2)
})

test('pause and resume preserve the live round, held ammo, and player position', () => {
	const round = flow.round
	round.human.place(2, 1, 4)
	const position = { ...round.human.body.translation() }
	const heldArrow = round.human.heldArrow
	flow.togglePause()
	expect(flow.phase).toBe('paused')
	expect(overlay.card.title).toBe('PAUSED')
	expect(flow.round).toBe(round)
	flow.endRound('B') // stale result delivery during pause must not alter the score
	expect(flow.match.wins).toEqual({ A: 0, B: 0 })
	overlay.card.actions.find((action) => action.label === 'Resume').onSelect()
	expect(flow.phase).toBe('playing')
	expect(overlay.card).toBeNull()
	expect(flow.round).toBe(round)
	expect(round.human.body.translation()).toEqual(position)
	expect(round.human.heldArrow).toBe(heldArrow)
	expect(flow.match.round).toBe(1)
})

test('canceling a pending arrival prevents stale scene replacement and unlocks transitions', async () => {
	const original = flow.round
	let staleArrivals = 0
	flow.transition('OLD ARRIVAL', () => {
		staleArrivals++
		flow.startMatch(3)
	})
	expect(flow.transitioning).toBe(true)
	expect(fade.classList.contains('active')).toBe(true)
	flow.cancelTransition()
	flow.transition('NEW ARRIVAL', () => flow.startMatch(2))
	await Bun.sleep(400)
	expect(staleArrivals).toBe(0)
	expect(flow.match.enemies).toBe(2)
	expect(flow.round).not.toBe(original)
	expect(flow.transitioning).toBe(false)
	expect(fade.classList.contains('active')).toBe(false)
})

test('disposing during a transition prevents arrival and releases the live round', async () => {
	const original = flow.round
	let arrivals = 0
	flow.transition('LEAVING', () => arrivals++)
	flow.dispose()
	await Bun.sleep(220)
	expect(arrivals).toBe(0)
	expect(flow.round).toBeNull()
	expect(original.units).toHaveLength(0)
	expect(flow.transitioning).toBe(false)
})
