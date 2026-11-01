import * as THREE from 'three'
import { PALETTE, hex } from '../../../../core/style.js'
import { FORWARD_LAYER } from '../../../../core/stylepass.js'
import { controls } from '../../../../core/controls.js'
import { PRESETS, attackKey, presetKeys } from '../../../../core/intents.js'
import { SLOTS } from '../../sim-kit.js'
import { botTactics } from '../../ability-bots.js'
import { inOwnBase } from '../../base.js'
import { openRow } from '../../talents.js'
import { look } from '../../look.js'
import { tune } from '../../tune.js'
import { hintMemory } from './hints-memory.js'

// The match teaches each danger once, on the floor, at the moment it matters. Four lessons:
// - dodge: a threat the bots would dodge is about to land on you (`sim.bots.sense`); your dash or
//   blink key is printed at your feet with an ink arrow out, or the way you walk if it is cooling.
//   Each Warden's kind of blow is its own lesson; everything a lane throws is one.
// - recall: you are low where a tear can take you home; the recall key.
// - ally: a friend nearby is low; your heal or shield key at their feet, else your attack key at
//   the feet of whoever is on them.
// - talent: a talent row has opened; the key that opens the tree, until you take one.
// A lesson is learned when you answer it (cast the key, open the tear, step clear), and then never
// shows again in this browser (`hints-memory.js`). The glyph wears the ability bar's own key labels.
const PAD_KEYS = ['RB', 'RT', 'LB', 'LT']
const LANE_THREATS = new Set(['shot', 'zone', 'ball'])
const SIZE = 256
const ARROWS = { '→': 0, '↓': Math.PI / 2, '←': Math.PI, '↑': -Math.PI / 2 }

const slotGlyph = (index, device) =>
	device === 'gamepad'
		? { kind: 'key', label: PAD_KEYS[index] }
		: { kind: 'key', label: presetKeys(controls.preset)[index] }
const moveGlyph = (device) =>
	device === 'gamepad'
		? { kind: 'stick' }
		: PRESETS[controls.preset]?.walk
			? { kind: 'walk' }
			: { kind: 'mouse', button: 'right' }
const recallGlyph = (device) => ({ kind: 'key', label: device === 'gamepad' ? '▼' : 'B' })
const attackGlyph = (device) => {
	const label = attackKey(controls.preset, device)
	return label === 'Click' ? { kind: 'mouse', button: 'left' } : { kind: 'key', label }
}

// Ink on cream, the pressable's offset lip under it; `pressed` sinks the cap onto its lip. The
// controls card (`scheme-view.js`) lays several of these out around the hero.
export function drawGlyph(canvas, glyph, pressed) {
	const g = canvas.getContext('2d')
	g.clearRect(0, 0, SIZE, SIZE)
	const ink = hex('ink')
	const cream = hex('cream')
	// The key face (core/keycap.js), so a floor key reads like the ones on the bar.
	const font =
		getComputedStyle(document.documentElement).getPropertyValue('--key-font').trim() || 'sans-serif'
	g.lineJoin = 'round'
	g.lineCap = 'round'
	const cap = (x, y, w, h, r, lip, line, label, size) => {
		g.fillStyle = ink
		g.beginPath()
		g.roundRect(x, y + lip, w, h, r)
		g.fill()
		const sink = pressed ? lip * 0.75 : 0
		g.fillStyle = cream
		g.strokeStyle = ink
		g.lineWidth = line
		g.beginPath()
		g.roundRect(x, y + sink, w, h, r)
		g.fill()
		g.stroke()
		if (label === 'Space') {
			// A wide cap marked with the space bar's bracket instead of the word.
			g.strokeStyle = ink
			g.lineWidth = 12
			g.beginPath()
			g.moveTo(x + w * 0.2, y + sink + h * 0.4)
			g.lineTo(x + w * 0.2, y + sink + h * 0.62)
			g.lineTo(x + w * 0.8, y + sink + h * 0.62)
			g.lineTo(x + w * 0.8, y + sink + h * 0.4)
			g.stroke()
			return
		}
		if (!label) return
		g.fillStyle = ink
		const turn = ARROWS[label]
		if (turn !== undefined) {
			// The face's arrows print too small to read on the floor; draw a solid one instead.
			g.save()
			g.translate(x + w / 2, y + sink + h / 2)
			g.rotate(turn)
			const a = size * 0.42
			g.beginPath()
			g.moveTo(a, 0)
			g.lineTo(-a * 0.55, -a * 0.8)
			g.lineTo(-a * 0.55, a * 0.8)
			g.closePath()
			g.fill()
			g.restore()
			return
		}
		g.textAlign = 'center'
		g.textBaseline = 'middle'
		g.font = `700 ${size}px ${font}`
		g.fillText(label, x + w / 2, y + sink + h / 2 + size * 0.06, w - line * 3)
	}
	if (glyph.kind === 'key') {
		const size = glyph.label.length > 1 ? 92 : 128
		if (glyph.label === 'Space') cap(16, 70, 224, 110, 28, 20, 10, glyph.label, size)
		else cap(36, 40, 184, 160, 34, 22, 10, glyph.label, size)
	} else if (glyph.kind === 'walk') {
		const k = 72
		const [up, left, down, right] = glyph.keys ?? ['W', 'A', 'S', 'D']
		for (const [label, x, y] of [
			[up, 92, 26],
			[left, 14, 112],
			[down, 92, 112],
			[right, 170, 112],
		])
			cap(x, y, k, k, 14, 12, 7, label, 50)
	} else if (glyph.kind === 'mouse') {
		const x = 70,
			y = 28,
			w = 116,
			h = 184
		const sink = pressed ? 12 : 0
		g.fillStyle = ink
		g.beginPath()
		g.roundRect(x, y + 16, w, h, 58)
		g.fill()
		g.fillStyle = cream
		g.strokeStyle = ink
		g.lineWidth = 10
		g.beginPath()
		g.roundRect(x, y + sink, w, h, 58)
		g.fill()
		g.save()
		g.clip()
		g.fillStyle = ink
		const left = glyph.button === 'left'
		g.fillRect(left ? x : x + w / 2, y + sink, w / 2, 78)
		g.restore()
		g.beginPath()
		g.roundRect(x, y + sink, w, h, 58)
		g.moveTo(x + w / 2, y + sink)
		g.lineTo(x + w / 2, y + sink + 78)
		g.moveTo(x, y + sink + 78)
		g.lineTo(x + w, y + sink + 78)
		g.stroke()
	} else if (glyph.kind === 'stick') {
		g.fillStyle = ink
		g.beginPath()
		g.arc(128, 142, 92, 0, Math.PI * 2)
		g.fill()
		g.fillStyle = cream
		g.strokeStyle = ink
		g.lineWidth = 10
		g.beginPath()
		g.arc(128, 124 + (pressed ? 12 : 0), 92, 0, Math.PI * 2)
		g.fill()
		g.stroke()
		g.fillStyle = ink
		g.beginPath()
		g.arc(128, 124 + (pressed ? 12 : 0), 46, 0, Math.PI * 2)
		g.fill()
		g.fillStyle = cream
		g.textAlign = 'center'
		g.textBaseline = 'middle'
		g.font = `400 60px ${font}`
		g.fillText('L', 128, 128 + (pressed ? 12 : 0))
	}
}

export function hints({ scene, sim, hero, onPresent }) {
	const t = tune.hints
	const group = new THREE.Group()
	group.name = 'moba-hints'
	scene.add(group)
	const owned = []
	const textures = new Map()
	const textureFor = (glyph, pressed) => {
		const key = `${JSON.stringify(glyph)}:${pressed}`
		let texture = textures.get(key)
		if (!texture) {
			const canvas = document.createElement('canvas')
			canvas.width = canvas.height = SIZE
			drawGlyph(canvas, glyph, pressed)
			texture = new THREE.CanvasTexture(canvas)
			texture.colorSpace = THREE.SRGBColorSpace
			texture.anisotropy = 4
			textures.set(key, texture)
		}
		return texture
	}
	// The face may land after the first glyph is drawn; redraw once it does.
	Promise.all([document.fonts?.load('700 64px "Apfel Grotezk"'), document.fonts?.ready]).then(
		() => {
			for (const texture of textures.values()) texture.dispose()
			textures.clear()
			if (shown) plate.material.map = textureFor(shown.glyph, shown.answered)
		},
	)
	const printed = (geometry, color, map = null) => {
		const material = new THREE.MeshBasicMaterial({
			color,
			map,
			transparent: true,
			depthWrite: false,
			// Like a ground tell, it ignores depth: the floor's copied depth is too coarse at this height.
			depthTest: false,
			opacity: 0,
		})
		const mesh = new THREE.Mesh(geometry, material)
		mesh.layers.set(FORWARD_LAYER)
		mesh.renderOrder = 2
		mesh.visible = false
		owned.push(geometry, material)
		group.add(mesh)
		return mesh
	}
	const plate = printed(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), 0xffffff)
	const arrowShape = new THREE.Shape()
	const w = 0.07,
		head = 0.32,
		flare = 0.17
	arrowShape.moveTo(0, -w)
	arrowShape.lineTo(1 - head, -w)
	arrowShape.lineTo(1 - head, -flare)
	arrowShape.lineTo(1, 0)
	arrowShape.lineTo(1 - head, flare)
	arrowShape.lineTo(1 - head, w)
	arrowShape.lineTo(0, w)
	arrowShape.closePath()
	const arrow = printed(new THREE.ShapeGeometry(arrowShape).rotateX(-Math.PI / 2), PALETTE.ink)

	let shown = null // { id, glyph, answer, anchor, away, answered, kind, impact }
	let fade = 0
	let clock = 0
	let threats = []
	let sensedAt = -1
	const rested = new Map()
	const ready = (id) => !hintMemory.learned(id) && clock - (rested.get(id) ?? -Infinity) >= t.rest

	const slotWith = (tactics) =>
		SLOTS.slice(0, 4).findIndex((slot, i) => {
			const ability = hero.definition.abilities?.[slot]
			return ability && tactics.some((k) => botTactics(ability).has(k)) && !(hero.cd?.[i] > 0)
		})

	function dodgeHint(device) {
		const threat = threats
			.filter((th) => th.impact >= t.lead)
			.find((th) => ready(LANE_THREATS.has(th.kind) ? 'dodge' : `dodge:${th.kind}`))
		if (!threat) return null
		const id = LANE_THREATS.has(threat.kind) ? 'dodge' : `dodge:${threat.kind}`
		const dash = slotWith(['dash', 'blink'])
		return {
			id,
			kind: threat.kind,
			impact: threat.impact,
			away: threat.away,
			anchor: hero,
			...(dash >= 0
				? { glyph: slotGlyph(dash, device), answer: SLOTS[dash] }
				: { glyph: moveGlyph(device), answer: 'move' }),
		}
	}
	function recallHint(device) {
		if (!ready('recall') || !sim.lane || !sim.layout?.bases?.[hero.team]) return null
		if (hero.hp > hero.maxHp * t.lowHp || hero.recall || (hero.recallReady ?? 0) > sim.tick)
			return null
		if (inOwnBase(sim.layout, hero)) return null
		return { id: 'recall', glyph: recallGlyph(device), answer: 'recall', anchor: hero }
	}
	const near = (a, b, reach) =>
		Math.hypot(a.body.position.x - b.body.position.x, a.body.position.z - b.body.position.z) <=
		reach
	function allyHint(device) {
		if (!ready('ally')) return null
		const ally = sim.heroes
			.filter(
				(u) =>
					u !== hero &&
					u.team === hero.team &&
					!u.dead &&
					u.hp <= u.maxHp * t.allyHp &&
					near(u, hero, t.allyReach),
			)
			.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]
		if (!ally) return null
		const save = slotWith(['save'])
		if (save >= 0)
			return { id: 'ally', glyph: slotGlyph(save, device), answer: SLOTS[save], anchor: ally }
		const foe = sim
			.enemiesOf(hero.team)
			.map((e) => e.unit)
			.filter((u) => !u.dead && u.body && near(u, ally, t.allyReach / 2))
			.sort(
				(a, b) =>
					Math.hypot(
						a.body.position.x - ally.body.position.x,
						a.body.position.z - ally.body.position.z,
					) -
					Math.hypot(
						b.body.position.x - ally.body.position.x,
						b.body.position.z - ally.body.position.z,
					),
			)[0]
		if (!foe) return null
		return { id: 'ally', ally, glyph: attackGlyph(device), answer: 'primary', anchor: foe }
	}

	// A talent row has opened: the key that opens the tree, until a talent is taken.
	function talentHint(device) {
		if (!ready('talent')) return null
		const row = openRow(hero)
		if (row < 0) return null
		return {
			id: 'talent',
			row,
			glyph: { kind: 'key', label: device === 'gamepad' ? '▲' : 'T' },
			answer: 'talent',
			anchor: hero,
		}
	}

	// Still standing in what the hint was about? `false` ends it, unanswered.
	function holds(hint) {
		if (hint.id.startsWith('dodge')) {
			const same = threats.find((th) =>
				hint.id === 'dodge' ? LANE_THREATS.has(th.kind) : th.kind === hint.kind,
			)
			if (same) {
				hint.impact = same.impact
				hint.away = same.away ?? hint.away
				return true
			}
			// Clear of it with time to spare: the player stepped out, which is the lesson.
			if (hint.impact > 0.12) answer()
			return false
		}
		if (hint.id === 'talent') {
			if (hero.talents?.[hint.row] == null) return true
			answer()
			return false
		}
		if (hint.id === 'recall') return hero.hp <= hero.maxHp * t.lowHp * 1.25 && !hero.dead
		const ally = hint.ally ?? hint.anchor
		return (
			!ally.dead &&
			ally.hp <= ally.maxHp * t.allyHp * 1.25 &&
			!hint.anchor.dead &&
			near(ally, hero, t.allyReach * 1.3)
		)
	}
	function answer() {
		if (!shown || shown.answered) return
		shown.answered = true
		hintMemory.learn(shown.id)
		plate.material.map = textureFor(shown.glyph, true)
	}
	function end() {
		if (!shown) return
		rested.set(shown.id, clock)
		shown.ending = true
	}
	onPresent((fact) => {
		if (!shown || shown.ending) return
		if (fact.hero !== hero.id) return
		if (fact.type === 'recallStart' && shown.answer === 'recall') answer()
		if (fact.type === 'cast' && fact.slot === shown.answer) answer()
		if (shown.answered) end()
	})

	const toCamera = new THREE.Vector3()
	return {
		update({ camera, dt, device, frozen = false }) {
			clock += dt
			const live =
				hintMemory.on && !frozen && device !== 'touch' && !hero.dead && !sim.lane?.match?.winner
			if (live && sim.tick !== sensedAt) {
				sensedAt = sim.tick
				threats = sim.bots?.sense?.(sim, hero.id) ?? []
			}
			if (shown && !shown.ending && (!live || !holds(shown))) end()
			if (shown?.ending && fade <= 0) shown = null
			if (!shown && live) {
				const next =
					dodgeHint(device) ?? recallHint(device) ?? allyHint(device) ?? talentHint(device)
				if (next) {
					if (hintMemory.shown(next.id) >= t.patience) hintMemory.learn(next.id)
					else {
						hintMemory.show(next.id)
						shown = next
						plate.material.map = textureFor(next.glyph, false)
						plate.material.needsUpdate = true
					}
				}
			}
			const target = shown && !shown.ending ? 1 : 0
			fade =
				target > fade
					? Math.min(1, fade + dt / Math.max(1e-3, t.fadeIn))
					: Math.max(0, fade - dt / Math.max(1e-3, t.fadeOut))
			plate.visible = arrow.visible = !!shown && fade > 0
			if (!plate.visible) return

			// The plate sits on the floor in front of its unit, toward the camera, upright on screen.
			camera.getWorldDirection(toCamera)
			toCamera.y = 0
			if (toCamera.lengthSq() < 1e-6) toCamera.set(0, 0, -1)
			toCamera.normalize().negate()
			const unit = shown.anchor
			// Once answered, the key stays where it was pressed and sinks there, as you leave it behind.
			const at = shown.answered
				? (shown.pinned ??= { ...(unit.body.mesh?.position ?? unit.body.position) })
				: (unit.body.mesh?.position ?? unit.body.position)
			const reach = (unit.body.radius ?? 0.5) + t.offset + t.size / 2
			let dx = toCamera.x,
				dz = toCamera.z
			const away = shown.answer !== 'recall' && shown.id.startsWith('dodge') ? shown.away : null
			// Keep the key off the arrow when the way out runs toward the camera.
			if (away && dx * away.x + dz * away.z > 0.5) {
				const turn = (dx * away.z - dz * away.x >= 0 ? -1 : 1) * (Math.PI / 3)
				;[dx, dz] = [
					dx * Math.cos(turn) - dz * Math.sin(turn),
					dx * Math.sin(turn) + dz * Math.cos(turn),
				]
			}
			const y = look.out.stampY + 0.01
			const sink = shown.answered ? 1 - fade : 0
			plate.position.set(at.x + dx * reach, y, at.z + dz * reach)
			plate.rotation.y = Math.atan2(toCamera.x, toCamera.z)
			plate.scale.setScalar(t.size * (1 - 0.12 * sink))
			plate.material.opacity = t.opacity * fade
			arrow.visible = !!away && !shown.answered
			if (arrow.visible) {
				const start = (unit.body.radius ?? 0.5) + 0.18
				arrow.position.set(at.x + away.x * start, y, at.z + away.z * start)
				arrow.rotation.y = Math.atan2(-away.z, away.x)
				arrow.scale.setScalar(t.arrow)
				arrow.material.opacity = t.opacity * fade * 0.9
			}
		},
		dispose() {
			group.removeFromParent()
			for (const resource of owned) resource.dispose()
			for (const texture of textures.values()) texture.dispose()
			textures.clear()
		},
	}
}
