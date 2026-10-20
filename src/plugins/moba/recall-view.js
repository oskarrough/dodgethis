import * as THREE from 'three'
import { createPortal } from '../../core/portal.js'
import { FORWARD_LAYER } from '../../core/stylepass.js'
import { tune } from './tune.js'

// The recall tear (recall.js): while a hero recalls, a tear opens beside them, turned square to the camera
// (the follow camera looks steeply down, so an upright tear would read as a sliver), and shows their own
// base live: the styled scene from the camera carried through to their core (or spawn), at the same angle.
// It collapses when the recall lands or breaks; landing flashes a small rim-only tear at the spawn.
export function createRecallView(app, layout) {
	const tears = new Map() // hero id → portal while a recall is open or its tear is still collapsing
	const landings = [] // { portal, left }
	const toCamera = new THREE.Vector3()
	const side = new THREE.Vector3()
	const at = new THREE.Vector3()
	const home = new THREE.Vector3()

	function makePortal(far) {
		const t = tune.recall.tear
		const portal = createPortal(app.renderer, {
			...(far &&
				app.renderStyled && { draw: (target, camera) => app.renderStyled(target, camera) }),
			layer: FORWARD_LAYER,
			radius: t.radius,
			floor: t.radius,
			openTime: t.openTime,
			closeTime: t.closeTime,
			sparks: t.sparks,
		})
		app.scene.add(portal.object)
		return portal
	}

	// Facts: a landing opens the rim at the spawn and lets it go again.
	function present(fact) {
		if (fact.type !== 'recallEnd' || !fact.point) return
		const portal = makePortal(false)
		portal.place(at.set(fact.point.x, tune.recall.tear.radius, fact.point.z), toCamera)
		portal.open()
		landings.push({ portal, left: tune.recall.tear.landing })
	}

	// `heroes` are the ones this client may see (fog already applied).
	function update(dt, { heroes, camera }) {
		camera.getWorldDirection(toCamera).negate()
		side.set(toCamera.z, 0, -toCamera.x)
		if (side.lengthSq() < 1e-6) side.set(1, 0, 0)
		side.normalize()
		const recalling = new Set()
		for (const h of heroes) {
			if (!h.recall || h.dead) continue
			recalling.add(h.id)
			let portal = tears.get(h.id)
			if (!portal) tears.set(h.id, (portal = makePortal(true)))
			const p = h.body.mesh?.position ?? h.body.position
			const t = tune.recall.tear
			portal.place(at.set(p.x, t.radius, p.z).addScaledVector(side, t.offset), toCamera)
			const spawn = layout.spawns?.[h.team]
			const core = layout.structures?.find((s) => s.kind === 'core' && s.team === h.team)
			const look = core ?? spawn
			if (look) portal.exit(home.set(look.x, t.radius, look.z), toCamera)
			if (!portal.isOpen) portal.open()
		}
		for (const [id, portal] of tears) {
			if (!recalling.has(id) && portal.isOpen) portal.collapse()
			portal.update(dt, camera)
			if (portal.phase === 'closed') {
				portal.dispose()
				tears.delete(id)
			}
		}
		for (let i = landings.length - 1; i >= 0; i--) {
			const landing = landings[i]
			if ((landing.left -= dt) <= 0 && landing.portal.isOpen) landing.portal.collapse()
			landing.portal.update(dt, camera, { far: false })
			if (landing.portal.phase === 'closed') {
				landing.portal.dispose()
				landings.splice(i, 1)
			}
		}
	}

	function dispose() {
		for (const portal of tears.values()) portal.dispose()
		for (const landing of landings) landing.portal.dispose()
		tears.clear()
		landings.length = 0
	}

	return { present, update, dispose }
}
