// One-off integration probe: compact guest packets, basics and held-input casting.
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
const root = resolve(import.meta.dir, '../..')
const { bootMoba } = await import(`${root}/tests/moba-harness.js`)
const { createLaneReplica } = await import(`${root}/src/modes/moba/lane-replica.js`)
const { pointClick, POINT_CLICK } = await import(`${root}/src/core/intents.js`)
const { createSkillsView } = await import(`${root}/src/modes/moba/skills-view.js`)
const { HEROES } = await import(`${root}/src/modes/moba/heroes.js`)
const report = { checks: [], presets: [], packets: 0, dashSamples: 0 }
for (const heroId of Object.keys(HEROES).filter((id) => HEROES[id].playable)) {
	const heroes = [
		{ id: 'local', team: 'A', heroId },
		{ id: 'enemy', team: 'B', heroId: 'ibis' },
		{ id: 'friend', team: 'A', heroId: 'ibis' },
	]
	const host = bootMoba({ heroes }),
		guest = bootMoba({ heroes })
	const replica = createLaneReplica(guest.sim, guest.scene)
	const skills = createSkillsView(host.scene)
	try {
		host.sim.setTraining({ waves: false, botsEnabled: false, godMode: false })
		const h = host.sim.find('local'),
			e = host.sim.find('enemy')
		h.body.place(-10, 1.05, 0)
		e.body.place(-7.5, 1.05, 0)
		host.sim.find('friend').body.place(-10, 1.05, 3)
		for (const unit of [null, h])
			skills.update(1 / 60, {
				hero: h.body.position,
				unit,
				aim: null,
				held: {},
				tick: host.sim.tick,
			})
		host.feed('local', { order: { x: -7.5, z: 0 } })
		let sawWind = false,
			sawBack = false
		for (let i = 0; i < 65; i++) {
			if (i === 4) host.feed('local', { order: { x: -7.5, z: 0 } })
			host.step()
			if (h.attack) {
				assert(Number.isFinite(h.attack.total))
				assert(Number.isFinite(h.attack.startedTick))
				sawWind ||= h.attack.phase === 'windup'
				sawBack ||= h.attack.phase === 'backswing'
			}
			if (i % 3 === 0) {
				assert(
					replica.apply(host.sim.snapshot({ wire: true }), host.sim.tick / 60),
					`${heroId}: ${replica.stats.rejectionReason}`,
				)
				replica.update(host.sim.tick / 60 + 0.1)
				report.packets++
			}
		}
		assert(sawWind && sawBack, heroId + ' basic phases')
		if (['mandador', 'salvia', 'undine'].includes(heroId))
			assert(
				host.facts.some((f) => f.type === 'projectile' && f.ability === HEROES[heroId].basic.id),
			)
		host.press('local', 'cancel')
		host.step()
		assert.equal(h.attack, null, heroId + ' cancel restarted attack')
		assert.equal(h.order, null)
		host.press('local', 'stop')
		host.step()
		h.cd.fill(0)
		const slot = Object.entries(h.definition.abilities).find(
			([, a]) => a?.stats.castPoint >= 0.3,
		)?.[0]
		if (heroId === 'salvia') host.sim.find('friend').hp -= 400
		if (slot) {
			host.press('local', slot, {
				x: heroId === 'salvia' ? -10 : -7.5,
				z: heroId === 'salvia' ? 3 : 0,
			})
			host.step(2)
			assert(h.cast, heroId + ' ' + slot + ' ' + JSON.stringify(host.facts.slice(-4)))
			const ability = h.cast.ability
			for (let i = 0; i < 80; i++) {
				host.feed('local', { move: { x: 0, z: 1 } })
				host.step()
			}
			assert.equal(h.cast, null)
			assert(
				!host.facts.some(
					(f) => f.type === 'denied' && f.ability === ability && f.reason === 'cancelled',
				),
			)
		}
		host.feed('local')
		host.step()
		h.cd.fill(0)
		const dash = { ibis: 'slot3', kappa: 'slot3', oolong: 'slot1', undine: 'slot3' }[heroId]
		if (dash) {
			e.body.place(0, 1.05, 0)
			host.press('local', dash, { x: -6, z: 1 })
			for (let i = 0; i < 45; i++) {
				host.step()
				if (h.body.dashing) {
					assert(replica.apply(host.sim.snapshot({ wire: true }), host.sim.tick / 60))
					replica.update(host.sim.tick / 60 + 0.1)
					assert(guest.sim.find('local').body.dashing)
					report.dashSamples++
					report.packets++
				}
			}
		}
		report.checks.push({
			heroId,
			idleView: true,
			basicPhases: true,
			cancelClearsOrder: true,
			heldMovePreservesCast: !!slot,
			dash: !!dash,
		})
	} finally {
		skills.dispose()
		replica.dispose()
		host.dispose()
		guest.dispose()
	}
}
// Exercise the actual sampler with held RMB, keys and pad axes, not neutral frames.
for (const preset of ['moba', 'wasd', 'keyboard', 'pad']) {
	const host = bootMoba({ map: 'floor', heroes: [{ id: 'local', team: 'A', heroId: 'ibis' }] })
	try {
		host.sim.setTraining({ waves: false, botsEnabled: false })
		for (const d of host.sim.dummies) {
			d.sparring = false
			d.body.place(15, 1.05, 18)
		}
		const h = host.sim.find('local')
		h.body.place(-10, 1.05, 8)
		host.step(60)
		let frame = 0
		const key = preset === 'moba' ? 'KeyQ' : 'Digit1'
		const device = {
			consumeSlot: () => null,
			consumePress: () => false,
			consumeRelease: () => false,
			consumeDash: () => false,
			consumeJump: () => false,
			activeDevice: () => (preset === 'pad' ? 'gamepad' : 'keyboard'),
			pad: () =>
				preset === 'pad'
					? {
							axes: [1, 0, 1, 0],
							buttons: Array.from({ length: 16 }, (_, i) => i === 5 && frame >= 4 && frame < 8),
						}
					: null,
			keyHeld: (code) => code === 'KeyD' || (code === key && frame >= 4 && frame < 8),
			consumeKeys: () => (frame === 4 && preset !== 'pad' ? [key] : []),
			consumeKeyUps: () => (frame === 8 && preset !== 'pad' ? [key] : []),
			consumeOrder: () => preset === 'moba' && frame === 0,
			orderDown: () => preset === 'moba',
			now: () => (frame * 1000) / 60,
		}
		const sample = pointClick(device, () => ({ x: 0, z: 8 }), {
			...POINT_CLICK,
			preset: preset === 'pad' ? 'moba' : preset,
			quickCast: false,
			controls: {},
		})
		let rooted = null,
			released = null,
			movementFrames = 0
		for (frame = 0; frame < 40; frame++) {
			const input = sample((dir) => ({
				x: h.body.position.x + (dir?.x ?? 1) * 8,
				z: h.body.position.z + (dir?.z ?? 0) * 8,
			}))
			if (input.order || Math.hypot(input.move.x, input.move.z)) movementFrames++
			host.feed('local', input)
			host.step()
			if (h.cast) {
				rooted ??= { ...h.body.position }
				assert(Math.hypot(h.body.position.x - rooted.x, h.body.position.z - rooted.z) < 0.001)
			}
			if (!released && host.facts.some((f) => f.type === 'projectile' && f.hero === 'local'))
				released = { ...h.body.position }
		}
		assert.equal(movementFrames, 40, preset + ' must hold movement throughout')
		assert.equal(host.facts.filter((f) => f.type === 'cast' && f.hero === 'local').length, 1)
		assert.equal(host.facts.filter((f) => f.type === 'projectile' && f.hero === 'local').length, 1)
		assert(!host.facts.some((f) => f.type === 'denied' && f.reason === 'cancelled'))
		assert(rooted && released && h.body.position.x > released.x, preset + ' resumes movement')
		for (const action of ['stop', 'cancel']) {
			host.feed('local')
			h.cd.fill(0)
			h.cancelUntil.fill(0)
			host.press('local', 'slot1', { x: 0, z: 8 })
			host.step(2)
			assert(h.cast)
			host.press('local', action)
			host.step()
			assert.equal(h.cast, null)
			assert.equal(h.cd[0], 45)
		}
		report.presets.push({
			preset,
			movementFrames,
			casts: 1,
			projectiles: 1,
			rooted: true,
			resumed: true,
			stopAndCancelRefund: true,
		})
	} finally {
		host.dispose()
	}
}
writeFileSync(`${root}/pages/cast-feel/contracts.json`, JSON.stringify(report, null, '\t') + '\n')
console.log(JSON.stringify(report))
