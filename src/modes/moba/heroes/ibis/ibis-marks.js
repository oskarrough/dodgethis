import * as THREE from 'three'
import { STEP } from '../../../../core/app.js'
import { PALETTE } from '../../../../core/style.js'
import { tune } from '../../tune.js'
import { createEffects } from '../../effects.js'

export function extras(scene) {
	const group = new THREE.Group()
	scene.add(group)
	const effects = createEffects(group)
	const seen = new Map()
	let last = -Infinity
	function clear() {
		seen.clear()
		effects.reset()
	}
	return {
		update({ units = [], unit, tick, alpha = 0 }) {
			const now = tick + alpha
			if (now < last) clear()
			effects.update(Number.isFinite(last) && now >= last ? (now - last) * STEP : 0)
			last = now
			const live = new Set()
			for (const hero of units) {
				if (hero.heroId !== 'ibis' || hero.dead) continue
				live.add(hero.id)
				const prior = seen.get(hero.id) ?? {}
				const state = hero.abilityState ?? {}
				const point = hero.body.mesh?.position ?? hero.body.position
				const landing = state.vault?.landed
				const v = tune.vault.view
				if (
					landing != null &&
					landing !== prior.landed &&
					now >= landing &&
					(now - landing) * STEP < v.life
				) {
					effects.spokes(state.vault.to, {
						color: PALETTE.cream,
						ink: PALETTE.ink,
						count: v.count,
						from: v.from,
						to: v.to,
						life: v.life,
						width: v.width,
						y: tune.map.printLayers.seams + v.ground,
					})
					effects.streak(state.vault.from, state.vault.to, {
						color: PALETTE.cream,
						ink: PALETTE.ink,
						width: v.width,
						life: v.life,
						opacity: v.opacity,
						y: tune.map.printLayers.seams + v.ground,
					})
				}
				const momentum = state.ibis?.momentumTick
				const m = tune.loose.view
				if (
					hero.team === unit?.team &&
					momentum != null &&
					momentum !== prior.momentum &&
					now >= momentum &&
					(now - momentum) * STEP < m.life
				) {
					for (const side of [-1, 1])
						effects.streak(
							{ x: point.x + side * m.width, z: point.z },
							{ x: point.x + side * m.radius, z: point.z + m.spacing },
							{
								color: PALETTE.cream,
								ink: PALETTE.ink,
								width: m.width,
								life: m.life,
								y: m.ground,
								toY: m.height,
							},
						)
				}
				seen.set(hero.id, { landed: landing, momentum })
			}
			for (const id of seen.keys()) if (!live.has(id)) seen.delete(id)
		},
		dispose() {
			clear()
			effects.dispose()
			scene.remove(group)
		},
	}
}
