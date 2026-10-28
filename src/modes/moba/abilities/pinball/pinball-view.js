import * as THREE from 'three'
import { STEP } from '../../../../core/app.js'
import { makeStyleMaterial } from '../../../../core/stylepass.js'
import { link, linkGeometry } from '../../effects.js'
import { tune } from '../../tune.js'

const GROUND = tune.map.printLayers.seams + 0.006

export function extras(scene) {
	const group = new THREE.Group()
	scene.add(group)
	const owned = []
	const own = (resource) => {
		owned.push(resource)
		return resource
	}
	const flat = (role) => own(makeStyleMaterial(role, { flat: true }))
	const teams = { A: flat('teamA'), B: flat('teamB') }
	const ink = flat('ink'),
		cream = flat('cream')
	const bar = own(linkGeometry())
	const sphere = own(new THREE.SphereGeometry(1, 12, 8))
	const seam = own(new THREE.TorusGeometry(1.01, 0.09, 4, 16))
	const live = new Map()
	const traces = []
	let last = -Infinity
	const v = tune.pinball.view
	const mesh = (geometry, material, parent = group) => {
		const object = new THREE.Mesh(geometry, material)
		parent.add(object)
		return object
	}
	function remove(id, rig) {
		group.remove(rig.root)
		live.delete(id)
	}
	function clear() {
		for (const [id, rig] of live) remove(id, rig)
		for (const trace of traces) group.remove(trace.edge, trace.line)
		traces.length = 0
	}
	function stroke(edge, line, from, to, width, height) {
		link(edge, from, to, height, width * 1.6)
		link(line, from, to, height + 0.015, width)
		edge.scale.y = line.scale.y = 0.025
	}
	return {
		contact(fact) {
			if (fact.ability !== 'pinball' || !fact.origin) return
			// Bounded residue, timed by facts rather than the renderer's wall clock.
			if (traces.length >= 32) {
				const old = traces.shift()
				group.remove(old.edge, old.line)
			}
			traces.push({
				from: fact.origin,
				to: fact.point,
				tick: fact.tick,
				edge: mesh(bar, ink),
				line: mesh(bar, cream),
			})
		},
		update({ units = [], summons = [], tick, alpha = 0 }) {
			const now = tick + alpha
			if (now < last) clear()
			last = now
			const entries = [
				...units
					.filter((u) => !u.dead && u.cast?.ability === 'pinball')
					.map((u) => ({ id: `tell-${u.id}`, unit: u, team: u.team })),
				...summons
					.filter((u) => u.key === 'pinball' && !u.dead)
					.map((u) => ({ id: u.id, unit: u, team: u.team, flight: true })),
			]
			const ids = new Set(entries.map((e) => e.id))
			for (const [id, rig] of live) if (!ids.has(id)) remove(id, rig)
			for (const e of entries) {
				let rig = live.get(e.id)
				if (!rig) {
					rig = { root: new THREE.Group() }
					group.add(rig.root)
					if (e.flight) {
						rig.ball = mesh(sphere, cream, rig.root)
						mesh(seam, teams[e.team], rig.ball)
						rig.edge = mesh(bar, ink, rig.root)
						rig.line = mesh(bar, cream, rig.root)
					} else
						rig.dashes = Array.from(
							{
								length: Math.min(
									64,
									Math.ceil(tune.pinball.range / Math.max(0.1, v.dashSpacing)) + 1,
								),
							},
							() => mesh(bar, teams[e.team], rig.root),
						)
					live.set(e.id, rig)
				}
				const u = e.unit
				if (e.flight) {
					const d = u.data
					const p = Math.max(0, Math.min(1, (now - d.depart) / Math.max(1, d.arrive - d.depart)))
					const to = {
						x: d.start.x + (d.to.x - d.start.x) * p,
						z: d.start.z + (d.to.z - d.start.z) * p,
					}
					rig.ball.position.set(to.x, v.height + v.arc * 4 * p * (1 - p), to.z)
					rig.ball.scale.setScalar(v.ballRadius)
					rig.ball.rotation.z = p * Math.PI
					stroke(rig.edge, rig.line, d.start, to, v.tetherWidth, v.height)
				} else {
					const from = u.body.mesh?.position ?? u.body.position
					const target = units.find((t) => t.id === u.cast.targetId)
					const to = target?.body.mesh?.position ?? u.cast.target
					const length = Math.hypot(to.x - from.x, to.z - from.z)
					const spacing = Math.max(0.1, v.dashSpacing, length / rig.dashes.length)
					for (const [i, dash] of rig.dashes.entries()) {
						const start = i * spacing
						dash.visible = start < length
						if (!dash.visible) continue
						const end = Math.min(length, start + spacing * v.dashFill)
						const at = (distance) => ({
							x: from.x + ((to.x - from.x) * distance) / length,
							z: from.z + ((to.z - from.z) * distance) / length,
						})
						link(dash, at(start), at(end), GROUND, v.tetherWidth)
						dash.scale.y = 0.015
					}
				}
			}
			for (let i = traces.length - 1; i >= 0; i--) {
				const trace = traces[i]
				const age = Math.max(0, (now - trace.tick) * STEP) / Math.max(STEP, v.traceLife)
				if (age >= 1) {
					group.remove(trace.edge, trace.line)
					traces.splice(i, 1)
				} else
					stroke(trace.edge, trace.line, trace.from, trace.to, v.tetherWidth * (1 - age), v.height)
			}
		},
		dispose() {
			clear()
			scene.remove(group)
			for (const resource of owned) resource.dispose()
		},
	}
}
