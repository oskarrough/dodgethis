import { createJuice } from '../../core/juice.js'
import { ARENA, onCourt } from './arena.js'
import { tune } from './tune.js'

// Dodgeball's fact switch: gameplay sends copied facts, main supplies the retired target's visual handle, and the core juice kit does the drawing.
export function createFeedback(scene, { sfx, confirm, addShake = () => {}, kickFov = () => {} }) {
	const juice = createJuice(scene, {
		deathPace: () => tune.fx.deathTime,
		hitFlash: () => tune.fx.hitFlash,
	})

	function onFloor(point) {
		const footY = point.y - tune.player.radius - tune.player.halfHeight
		return Math.abs(footY - ARENA.top) <= 0.15
	}

	// Dash: two long scratches trailing the feet. Land: two short ticks either side of the feet. Near miss: two long cream streaks along the flight line. Landed arrow: a fan of three ticks.
	function courtMarks(event) {
		const dash = event.type === 'dash'
		const land = event.type === 'land'
		const near = event.outcome === 'nearMiss'
		if (dash || land) {
			if (!onFloor(event.point)) return
		} else if (near) {
			if (!onCourt(event.point.x, event.point.z, ARENA.inset.rim)) return
		} else if (event.outcome !== 'landed' || event.surface !== 'court') return
		const { x, z } = event.direction
		const heading = land ? 0 : Math.atan2(x, z) // landing ticks sit either side of the feet along +X
		const fan = !(dash || land || near)
		const count = fan ? 3 : 2
		for (let i = 0; i < count; i++) {
			const angle = heading + (fan ? (i - 1) * 0.8 : 0)
			const length = dash
				? 0.55 - i * 0.12
				: near
					? 0.7 - i * 0.1
					: land
						? 0.16
						: 0.22 + (i % 2) * 0.08
			const side = dash ? (i - 0.5) * 0.25 : near ? (i - 0.5) * 0.3 : land ? (i - 0.5) * 0.5 : 0
			const reach = dash ? -0.22 : near ? 0.1 : land ? 0 : 0.19
			const px = event.point.x + Math.sin(angle) * reach + Math.cos(angle) * side
			const pz = event.point.z + Math.cos(angle) * reach - Math.sin(angle) * side
			// Keep the entire stroke inside the paint; the conservative radius also covers rotated strokes.
			if (!onCourt(px, pz, ARENA.inset.rim + length * 0.6)) continue
			juice.mark(px, ARENA.top + 0.026, pz, angle, {
				width: dash ? 0.055 : near ? 0.08 : land ? 0.06 : 0.07,
				length,
				life: dash ? 0.7 : near ? 0.9 : land ? 0.5 : 1.1,
				cream: near, // cream streaks read brighter than shoe ink
			})
		}
	}
	let confirmationTime = 0
	let humanOut = false

	function present(event, mesh) {
		if (event.type === 'shot') {
			if (event.kind === 'bowl') sfx.roll(event.point)
			else sfx.loose((event.source.isLocal ?? event.source.isHuman) ? 1 : 0.45, event.point)
			if (event.perfect) sfx.perfect(event.point)
			if (event.perfect && (event.source.isLocal ?? event.source.isHuman)) kickFov(1.5)
			if (event.source.isLocal ?? event.source.isHuman)
				addShake(event.kind === 'bowl' ? 0.35 : event.perfect ? 0.4 : 0.22)
			if (!event.source.isHuman) sfx.taunt(event.point)
			return
		}
		if (event.type === 'pickup') {
			sfx.grab(event.point, (event.source.isLocal ?? event.source.isHuman) ? 1 : 0.35)
			return
		}
		if (event.type === 'land') {
			const human = event.source?.isLocal ?? event.source?.isHuman
			sfx.thud(event.point, event.speed, human ? 1 : 0.4)
			if (human && event.speed > 6) addShake(0.08)
			courtMarks(event)
			return
		}
		if (event.outcome === 'nearMiss') {
			// The dodge reward: it zipped past your ear.
			if (event.target?.isLocal ?? event.target?.isHuman) {
				sfx.whoosh(event.point, 1 - Math.min(1, (event.distance ?? 0) / 1.5))
				addShake(0.18)
				kickFov(0.6)
			}
			if (event.source?.isLocal ?? event.source?.isHuman) {
				sfx.close(event.point)
				courtMarks(event)
			}
			return
		}
		if (event.type === 'dash') sfx.dash(event.point)
		if (event.outcome === 'recovered') return // ammo rescue is not a wall impact
		if (event.outcome === 'eliminated') {
			kickFov(2.5)
			if (mesh)
				juice.retire(mesh, { fell: event.type === 'fall', radius: mesh.geometry.parameters.radius })
			if (event.type === 'fall') sfx.fall(event.point)
			else sfx.hit(event.point)
			addShake(
				event.type === 'fall' ? ((event.target.isLocal ?? event.target.isHuman) ? 0.6 : 0.3) : 0.7,
			)
			// A mutual hit must not overwrite YOU'RE OUT with a kill cheer.
			if (event.target.isLocal ?? event.target.isHuman) humanOut = true
			if (
				(event.target.isLocal ?? event.target.isHuman) ||
				((event.source?.isLocal ?? event.source?.isHuman) && !humanOut)
			) {
				confirm(humanOut ? "YOU'RE OUT" : 'OUT!')
				confirmationTime = 0.65
			}
		} else if (event.outcome === 'deflected') sfx.deflect(event.point)
		else if (event.outcome === 'landed') sfx.land(event.point)
		else if (event.outcome === 'hurt') {
			sfx.hit(event.point)
			addShake(event.target.isHuman ? 0.35 : 0.2)
			kickFov(1)
			if (event.target.isHuman) {
				confirm('HIT')
				confirmationTime = 0.4
			}
		}

		const dash = event.type === 'dash'
		if (!dash && event.type !== 'impact') return
		courtMarks(event)
		const lethal = event.outcome === 'eliminated'
		const count = lethal
			? 12
			: dash || event.outcome === 'deflected' || event.outcome === 'hurt'
				? 6
				: 3
		juice.burst(event.point, event.direction, {
			count,
			speed: lethal ? 3 : 1,
			life: lethal ? 0.4 : 0.25,
			lifeStep: lethal ? 0.06 : 0,
			size: lethal ? 0.1 : 0.06,
			sizeStep: lethal ? 0.025 : 0,
			streak: dash,
		})
	}

	function update(dt) {
		juice.update(dt)
		if (confirmationTime > 0) {
			confirmationTime -= Math.min(Math.max(dt, 0), 0.1)
			if (confirmationTime <= 0) confirm('')
		}
	}

	function reset() {
		juice.reset()
		humanOut = false
		confirmationTime = 0
		confirm('')
	}

	function dispose() {
		reset()
		juice.dispose()
	}

	return { present, update, reset, dispose }
}
