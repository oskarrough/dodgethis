import * as THREE from 'three'
import { createPortal } from '../../core/portal.js'
import { FORWARD_LAYER } from '../../core/stylepass.js'
import { tune } from './tune.js'

// The recall tears (recall.js). The entry tear stands where the sim put its mouth, rips open over the
// channel and shows the hero's base live: the styled scene from the camera carried through to their core.
// Its plane keeps the sim's mouth line on the ground but leans back toward the camera, which looks
// steeply down. Walking in, the hole hides whatever is behind its plane and the hero shrinks into it; at
// spawn a second tear, showing where they left, spits them back out.
export function createRecallView(app, layout) {
	const entries = new Map() // hero id → { portal, at } while opening, open or slipping through, then collapsing
	const exits = new Map() // hero id → { portal, left }
	const squeezed = new Set() // heroes whose root mesh this view has scaled
	const toCamera = new THREE.Vector3()
	const facing = new THREE.Vector3()
	const at = new THREE.Vector3()
	const far = new THREE.Vector3()

	function makePortal(openTime) {
		const t = tune.recall.tear
		const portal = createPortal(app.renderer, {
			...(app.renderStyled && { draw: (target, camera) => app.renderStyled(target, camera) }),
			layer: FORWARD_LAYER,
			radius: t.radius,
			floor: t.radius,
			openTime,
			closeTime: t.closeTime,
			sparks: t.sparks,
		})
		app.scene.add(portal.object)
		return portal
	}
	// The mouth's normal, flipped to the camera's side and leaned back toward it.
	function lean(dir) {
		const lean = tune.recall.tear.lean
		const s = dir.x * toCamera.x + dir.z * toCamera.z >= 0 ? 1 : -1
		return facing.set(dir.x * s * Math.cos(lean), Math.sin(lean), dir.z * s * Math.cos(lean))
	}
	const centre = (p) => at.set(p.x, tune.recall.tear.radius, p.z)

	// `heroes` are the ones this client may see (fog already applied).
	function update(dt, { heroes, camera }) {
		camera.getWorldDirection(toCamera).negate()
		toCamera.y = 0
		if (toCamera.lengthSq() < 1e-6) toCamera.set(0, 0, 1)
		toCamera.normalize()
		const entering = new Set()
		for (const h of heroes) {
			const r = !h.dead && h.recall
			if (r && r.phase !== 'out') {
				entering.add(h.id)
				let entry = entries.get(h.id)
				if (!entry) entries.set(h.id, (entry = { portal: makePortal(tune.recall.channel) }))
				entry.at = { ...r.at }
				entry.portal.place(centre(r.at), lean(r.dir))
				const core = layout.structures?.find((s) => s.kind === 'core' && s.team === h.team)
				const home = core ?? layout.spawns?.[h.team]
				if (home) entry.portal.exit(far.set(home.x, tune.recall.tear.radius, home.z), facing)
				if (!entry.portal.isOpen) entry.portal.open()
			}
			if (r?.phase === 'out' && !exits.has(h.id)) {
				const portal = makePortal(tune.recall.spitTime / 3)
				portal.place(centre(r.at), lean(r.dir))
				const from = entries.get(h.id)?.at
				if (from) portal.exit(far.set(from.x, tune.recall.tear.radius, from.z), facing)
				portal.open()
				exits.set(h.id, { portal, left: tune.recall.spitTime + tune.recall.tear.linger })
			}
			// Slipping in shrinks the hero into the mouth; the spawn tear grows them back out.
			const k =
				r && (r.phase === 'through' || r.phase === 'out') ? 1 - r.left / Math.max(1, r.total) : null
			if (k !== null) {
				const s = r.phase === 'through' ? Math.max(0.05, 1 - k * k) : 0.3 + 0.7 * k
				h.body.mesh?.scale.setScalar(s)
				squeezed.add(h)
			} else if (squeezed.has(h)) {
				h.body.mesh?.scale.setScalar(1)
				squeezed.delete(h)
			}
		}
		for (const h of squeezed)
			if (!heroes.includes(h)) {
				h.body.mesh?.scale.setScalar(1)
				squeezed.delete(h)
			}
		for (const [id, entry] of entries) {
			if (!entering.has(id) && entry.portal.isOpen) entry.portal.collapse()
			entry.portal.update(dt, camera)
			if (entry.portal.phase === 'closed' && !entering.has(id)) {
				entry.portal.dispose()
				entries.delete(id)
			}
		}
		for (const [id, exit] of exits) {
			if ((exit.left -= dt) <= 0 && exit.portal.isOpen) exit.portal.collapse()
			exit.portal.update(dt, camera)
			if (exit.portal.phase === 'closed' && exit.left <= 0) {
				exit.portal.dispose()
				exits.delete(id)
			}
		}
	}

	function dispose() {
		for (const h of squeezed) h.body.mesh?.scale.setScalar(1)
		for (const { portal } of [...entries.values(), ...exits.values()]) portal.dispose()
		entries.clear()
		exits.clear()
		squeezed.clear()
	}

	return { update, dispose }
}
