import * as THREE from 'three'
import { STEP } from '../../../../core/app.js'
import { PALETTE } from '../../../../core/style.js'
import { makeStyleMaterial } from '../../../../core/stylepass.js'
import { createEffects } from '../../effects.js'
import { tune } from '../../tune.js'
import { wardenFigure } from './dungeon-figures.js'
import './dungeon-ceremony.css'

const clamp = (n) => Math.max(0, Math.min(1, n))
const active = (phase) => !['idle', 'ended', 'reset'].includes(phase)
const encounterId = (id) => (['tinaja', 'botijo'].includes(id) ? 'tinajaBotijo' : id)

// Presentation only. Facts also reach guests, whose inherited encounter state does not step.
// No timers, simulation writes, camera cuts or input locks. The ending clock carries Gnomon's fall
// after the winning tick, when the simulation has stopped.
export function wardenCeremony(scene) {
	const effects = createEffects(scene)
	const records = new Map()
	const fallen = new Map()
	const puzzles = new Map()
	const rooms = new Map()
	const pending = []
	const card = document.createElement('aside')
	card.className = 'warden-card'
	card.hidden = true
	card.setAttribute('role', 'status')
	card.innerHTML = '<small></small><h2></h2><p></p>'
	document.body.append(card)
	let caption = null
	let previous = null
	const rubbleMaterial = makeStyleMaterial('scenery')
	const rubbleGeometry = new THREE.DodecahedronGeometry(0.65, 0)
	const shardGeometry = new THREE.CylinderGeometry(0.9, 0.65, 0.15, 3)
	const shardMaterial = makeStyleMaterial('cream')
	const clayMaterial = makeStyleMaterial('terracotta')

	function clear() {
		for (const figure of [...fallen.values(), ...puzzles.values()]) figure.dispose()
		for (const room of rooms.values()) room.removeFromParent()
		fallen.clear()
		puzzles.clear()
		rooms.clear()
		records.clear()
		effects.reset()
		caption = null
		card.hidden = true
	}
	function say(id, end, at, tick, local) {
		if (!local || Math.hypot(local.x - at.x, local.z - at.z) > 28) return
		const words = tune.encounters[id].ceremony
		caption = { tick, end }
		card.querySelector('small').textContent = end ? 'The room falls quiet' : words.title
		card.querySelector('h2').textContent = words.name
		card.querySelector('p').textContent = end ? words.fall : words.arrival
		card.dataset.encounter = id
		card.dataset.moment = end ? 'fall' : 'arrival'
	}
	function roomAfter(id, at) {
		if (rooms.has(id)) return
		const room = new THREE.Group()
		room.name = `warden-cleared-${id}`
		room.position.set(at.x, 0, at.z)
		// Broken, irregular pieces, never a circle that could be mistaken for a danger mark.
		for (let i = 0; i < 7; i++) {
			const piece = new THREE.Mesh(
				id === 'espejo' ? shardGeometry : rubbleGeometry,
				id === 'espejo'
					? shardMaterial
					: ['manos', 'tinajaBotijo', 'fornax'].includes(id)
						? clayMaterial
						: rubbleMaterial,
			)
			const angle = i * 2.4
			const reach = 2.8 + (i % 3) * 0.8
			piece.position.set(Math.cos(angle) * reach, 0.2, Math.sin(angle) * reach)
			piece.rotation.set(i * 0.3, angle, i * 0.2)
			piece.scale.set(1.3, 0.5, 0.8)
			room.add(piece)
		}
		scene.add(room)
		rooms.set(id, room)
	}
	function fall(id, at, tick, yaw = 0) {
		if (fallen.has(id)) return
		const figure = wardenFigure(id)
		Object.assign(figure, { at: { x: at.x, z: at.z }, tick, yaw, struck: false })
		figure.root.position.set(at.x, 0, at.z)
		figure.root.rotation.y = yaw
		scene.add(figure.root)
		fallen.set(id, figure)
	}
	function burst(id, at) {
		effects.spokes(at, {
			color: PALETTE[tune.encounters[encounterId(id)].ceremony.color],
			count: id === 'gnomon' ? 12 : id === 'espejo' ? 6 : 8,
			from: 1.2,
			to: id === 'gnomon' ? 6 : 4,
			life: 0.32,
			width: 0.12,
		})
	}
	return {
		present(fact) {
			if (fact.type === 'encounter' && tune.encounters[fact.id]?.ceremony) pending.push(fact)
		},
		update(sim, blend = 0, localId, _aim, _camera, endingTick) {
			const time = endingTick ?? sim.tick + blend
			if (previous != null && time < previous) clear()
			effects.update(previous == null ? 0 : Math.max(0, (time - previous) * STEP))
			previous = time
			const local = sim.heroes.find((h) => h.id === localId)?.body.position
			for (const fact of pending.splice(0)) {
				const fight = sim.dungeon?.encounters.find((e) => e.id === fact.id)
				const at = fact.at ?? fight?.spot ?? fight?.unit?.spawn
				if (!at) continue
				const end = fact.state === 'end'
				const won = end && fact.result === 'killed'
				records.set(fact.id, { start: end ? null : fact.tick, end: won ? fact.tick : null, at })
				if (!end || won) say(fact.id, won, at, time, local)
				if (won) {
					for (const unit of fact.fallen ?? []) fall(unit.id, unit.at, fact.tick, unit.yaw)
				}
			}
			for (const fight of sim.dungeon?.encounters ?? []) {
				const id = fight.id
				if (!tune.encounters[id]?.ceremony) continue
				const at = fight.spot ?? fight.unit?.spawn
				if (!at) continue
				let record = records.get(id)
				if (!record) {
					record = {
						at,
						start: active(fight.state.phase) ? time : null,
						end: fight.killed ? -Infinity : null,
					}
					records.set(id, record)
				}
				const won = record.end != null || fight.killed
				if (won && record.end == null) record.end = time
				const arrival = record.start == null ? 1 : clamp(((time - record.start) * STEP) / 0.8)
				const lift = Math.sin(arrival * Math.PI) * (1 - arrival)
				for (const unit of fight.units ?? []) {
					if (unit.dead || won) {
						const point = unit.body?.position ?? unit.spawn
						fall(unit.id, point, won ? record.end : time, unit.yaw)
						// The ordinary body retires as usual; only this sculpted fall is drawn.
						if (unit.corpse?.mesh) unit.corpse.visual.visible = false
					} else {
						const remains = fallen.get(unit.id)
						if (remains) {
							remains.dispose()
							fallen.delete(unit.id)
						}
						const pose = unit.body.mesh?.getObjectByName('moba-cast-pose')
						if (pose && lift > 0) {
							pose.scale.set(1 - lift * 0.12, 1 + lift * 0.22, 1 - lift * 0.12)
							// Keep attack windups readable during the greeting.
							if (!unit.cast) {
								if (id === 'espejo') pose.rotation.y += lift * 1.5
								else if (id === 'fornax') pose.scale.y = 1 - lift * 0.25
								else if (id === 'gnomon') pose.scale.y = 1 + lift * 0.5
								else
									pose.rotation.z +=
										lift * (id === 'carillon' ? 0.7 : unit.id === 'botijo' ? 0.5 : -0.35)
							}
						}
					}
				}
				if (id === 'manos' || id === 'barquero') {
					let figure = puzzles.get(id)
					if (!figure) {
						figure = wardenFigure(id)
						scene.add(figure.root)
						puzzles.set(id, figure)
					}
					const point =
						id === 'barquero'
							? fight.road().at(-1)
							: { x: at.x + tune.encounters.manos.door.x, z: at.z - 4 }
					figure.root.visible = !won
					figure.root.position.set(point.x, lift * 0.7, point.z)
					figure.root.rotation.z = lift * (id === 'manos' ? -0.5 : 0.2)
					if (won) fall(id, point, record.end)
				}
				if (won && (time - record.end) * STEP > 0.6) roomAfter(id, record.at)
			}
			for (const [id, figure] of fallen) {
				const age = Math.max(0, (time - figure.tick) * STEP)
				// Brace, land hard, then hold perfectly still. The quiet belongs to this room alone.
				const drop = clamp((age - 0.12) / 0.38) ** 2
				const { root, at } = figure
				figure.breakApart(drop)
				root.rotation.set(0, figure.yaw, 0)
				root.position.set(at.x, 0, at.z)
				if (id === 'barquero') {
					root.position.x += clamp(age / 1.2) * 4
					root.scale.setScalar(1 - clamp((age - 0.5) / 0.8))
				} else if (id === 'fornax') {
					root.scale.set(1 + drop * 0.25, 1 - drop * 0.7, 1 + drop * 0.18)
					if (drop > 0.5) figure.cold()
				} else {
					if (id === 'espejo' || id === 'manos') root.rotation.x = (-drop * Math.PI) / 2
					else root.rotation.z = drop * (id === 'carillon' ? 1.35 : Math.PI / 2)
					root.position.y = drop * (id === 'espejo' ? 0.28 : 0.65)
					if (id === 'espejo' && drop === 1) figure.cold()
				}
				if (age >= 0.5 && !figure.struck) {
					figure.struck = true
					// Rejoining a finished room draws its remains without replaying the impact.
					if (age < 0.9) burst(id, at)
				}
			}
			if (caption) {
				const age = (time - caption.tick) * STEP
				card.hidden = age > (caption.end ? 3.8 : 4.8)
				card.style.opacity = String(
					clamp(age / 0.12) * clamp(((caption.end ? 3.8 : 4.8) - age) / 0.4),
				)
			}
		},
		dispose() {
			clear()
			pending.length = 0
			effects.dispose()
			shardGeometry.dispose()
			shardMaterial.dispose()
			clayMaterial.dispose()
			rubbleGeometry.dispose()
			rubbleMaterial.dispose()
			card.remove()
		},
	}
}
