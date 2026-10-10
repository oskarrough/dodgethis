import * as THREE from 'three'
import { el } from '../../core/dom.js'
import { hex } from '../../core/style.js'
import { makeStyleMaterial } from '../../core/stylepass.js'
import { STEP } from '../../core/app.js'
import { clampMap } from './obstacles.js'
import { edgePip } from './pips.js'
import { tune } from './tune.js'

const arrowFor = (angle) =>
	['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'][((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8]

// Render-only guidance. All lifetime and movement state belongs to this match.
export function createOnboarding({ scene, sim, hero }) {
	const t = tune.onboarding
	const root = el('div', 'moba-onboarding', document.body)
	root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:3'
	const sticker = (name, text) => {
		const node = el('div', name, root)
		node.textContent = text
		node.style.cssText = `position:absolute;background:${hex('cream')};color:${hex('ink')};border:${t.stickerBorder}px solid ${hex('ink')};border-radius:${t.stickerCorner}px;padding:${t.stickerPadding}px;box-shadow:${t.stickerShadow}px ${t.stickerShadow}px 0 ${hex('ink')};font:bold ${t.font}px/1.2 var(--ui-font);text-align:center`
		return node
	}
	const you = sticker('moba-you', 'You')
	const pointer = sticker('moba-ball-pointer', '')
	pointer.style.whiteSpace = 'nowrap'
	const timerLabels = ['wave', 'ball'].map((kind) => {
		const parent = document.querySelector(`.moba-timer.${kind}`)
		const previousPosition = parent.style.position
		parent.style.position = 'relative'
		const label = el('small', 'moba-timer-label', parent)
		label.restore = () => {
			parent.style.position = previousPosition
		}
		label.textContent = kind === 'wave' ? 'Wave in' : 'Ball in'
		label.style.cssText = `position:absolute;top:100%;left:50%;transform:translateX(-50%);font:bold ${t.timerFont}px/1.2 var(--ui-font);color:${hex('ink')};background:${hex('cream')};padding:0 ${t.stickerBorder}px;white-space:nowrap`
		return label
	})
	const owned = []
	const material = (role) => {
		const mat = makeStyleMaterial(role, { flat: true })
		owned.push(mat)
		return mat
	}
	const cream = material('cream'),
		ink = material('ink')
	const group = new THREE.Group()
	scene.add(group)
	const mesh = (geometry, mat) => {
		owned.push(geometry)
		const node = new THREE.Mesh(geometry, mat)
		node.rotation.x = -Math.PI / 2
		group.add(node)
		return node
	}
	const border = mesh(
		new THREE.RingGeometry(
			t.ringRadius - t.ringWidth - t.ringWidth / 2,
			t.ringRadius + t.ringWidth / 2,
			t.segments,
		),
		ink,
	)
	const ring = mesh(
		new THREE.RingGeometry(t.ringRadius - t.ringWidth, t.ringRadius, t.segments),
		cream,
	)
	const arrowMaterial = material('ammo')
	arrowMaterial.uniforms.uFade = { value: 1 }
	arrowMaterial.uniforms.uStipple = { value: t.stipplePixels * window.devicePixelRatio }
	arrowMaterial.fragmentShader = arrowMaterial.fragmentShader.replace(
		'void main() {',
		`uniform float uFade;
uniform float uStipple;
void main() {
	vec2 cell = floor(gl_FragCoord.xy / uStipple);
	float threshold = fract(cell.x * 0.754877666 + cell.y * 0.569840296);
	if (threshold >= uFade) discard;`,
	)
	const shape = new THREE.Shape()
	shape.moveTo(0, -t.arrowWidth / 2)
	shape.lineTo(t.arrowLength - t.arrowHead, -t.arrowWidth / 2)
	shape.lineTo(t.arrowLength - t.arrowHead, -t.arrowWidth)
	shape.lineTo(t.arrowLength, 0)
	shape.lineTo(t.arrowLength - t.arrowHead, t.arrowWidth)
	shape.lineTo(t.arrowLength - t.arrowHead, t.arrowWidth / 2)
	shape.lineTo(0, t.arrowWidth / 2)
	shape.closePath()
	const arrow = mesh(new THREE.ShapeGeometry(shape), arrowMaterial)
	const point = new THREE.Vector3(),
		local = new THREE.Vector3(),
		goal = new THREE.Vector3()
	let previous = null
	let distance = 0
	let fadedAt = null
	let levelAt = null
	let wasDead = hero.dead
	const startTick = sim.tick
	const text = (node, value) => {
		if (node.textContent !== value) node.textContent = value
	}
	const place = (node, position, camera, lift = 0) => {
		point.copy(position).project(camera)
		node.hidden = Math.abs(point.x) > 1 || Math.abs(point.y) > 1 || point.z < -1 || point.z > 1
		point.set(position.x, position.y + lift, position.z).project(camera)
		// A visible hero keeps its sticker; the raised anchor must not slip behind the HUD.
		const top = t.pointerTop + t.font + t.stickerPadding * 2 + t.stickerBorder * 2
		node.style.left = `clamp(${t.pointerMargin}px,${(point.x + 1) * 50}%,calc(100% - ${t.pointerMargin}px))`
		node.style.top = `clamp(${top}px,${(1 - point.y) * 50}%,calc(100% - ${t.pointerBottom}px))`
		node.style.transform = 'translate(-50%,-100%)'
	}
	return {
		present(fact) {
			if (fact.team !== hero.team) return
			if (fact.type === 'levelUp') levelAt = sim.tick
		},
		update({ camera, alpha, ballPosition, frozen = false }) {
			const tick = sim.tick + alpha
			const elapsed = (tick - startTick) * STEP
			const p = hero.body.mesh.position
			// Respawns jump to base. Never count the jump as walking, or restart the lesson.
			if (previous && !hero.dead && !wasDead && !frozen)
				distance += Math.hypot(p.x - previous.x, p.z - previous.z)
			previous = { x: p.x, z: p.z }
			wasDead = hero.dead
			if (distance >= t.walkDistance && fadedAt === null) fadedAt = tick
			const fade = fadedAt === null ? 1 : Math.max(0, 1 - ((tick - fadedAt) * STEP) / t.arrowFade)
			arrowMaterial.uniforms.uFade.value = fade
			arrowMaterial.uniforms.uStipple.value = t.stipplePixels * window.devicePixelRatio
			arrow.visible = !hero.dead && fade > 0 && !sim.lane.match.winner
			const direction = hero.team === 'A' ? 1 : -1
			const at = clampMap({ x: p.x + direction * t.arrowOffset, z: p.z })
			arrow.position.set(at.x, t.arrowY, at.z)
			arrow.rotation.z = direction === 1 ? 0 : Math.PI
			const pop = levelAt === null ? 0 : Math.max(0, 1 - ((tick - levelAt) * STEP) / t.levelLife)
			const scale = 1 + t.levelPulse * Math.sin(pop * Math.PI)
			for (const [node, y] of [
				[ring, t.ringY],
				[border, t.ringBorderY],
			]) {
				node.visible = !hero.dead
				node.position.set(p.x, y, p.z)
				node.scale.setScalar(scale)
			}
			const crowded =
				[...sim.heroes, ...sim.lane.minions].filter(
					(unit) =>
						unit.id !== hero.id &&
						!unit.dead &&
						unit.body.mesh.position.distanceTo(p) <= t.crowdRadius,
				).length >= t.crowdCount
			place(you, p, camera, t.labelHeight)
			you.hidden ||= hero.dead || (elapsed >= t.youLife && !crowded)
			for (const label of timerLabels) label.hidden = elapsed >= t.timerLife
			pointer.hidden = true
			if (sim.lane.match.winner) return
			// Carrying, the pointer swaps the Ball for where to throw it.
			const goalUnit =
				sim.ball?.carrying(hero) &&
				sim.lane.structures.find((u) => !u.dead && u.team !== hero.team && sim.lane.vulnerable(u))
			if (goalUnit) {
				goal.set(goalUnit.body.position.x, 0, goalUnit.body.position.z)
				pointer.style.background = hex('ammo')
				const lift = t.goalLift[goalUnit.kind]
				point.set(goal.x, lift, goal.z)
				local.copy(point).applyMatrix4(camera.matrixWorldInverse)
				const edge = edgePip(point.project(camera), local.z >= 0)
				const name = goalUnit.kind === 'tower' ? 'Their tower' : 'Their core'
				if (!edge) {
					place(pointer, goal, camera, lift)
					text(pointer, `Throw here ↓`)
					return
				}
				pointer.hidden = false
				const angle = Math.atan2(-edge.y, edge.x)
				text(pointer, `${arrowFor(angle)} ${name}`)
				pointer.style.left = `clamp(${t.pointerMargin}px,${(edge.x + 1) * 50}%,calc(100% - ${t.pointerMargin}px))`
				pointer.style.top = `clamp(${t.pointerTop}px,${(1 - edge.y) * 50}%,calc(100% - ${t.pointerBottom}px))`
				pointer.style.transform = 'translate(-50%,-50%)'
				return
			}
			if (!ballPosition) return
			const carrier = sim.find(sim.ball.state.carrier)
			point.copy(ballPosition)
			local.copy(point).applyMatrix4(camera.matrixWorldInverse)
			const edge = edgePip(point.project(camera), local.z >= 0)
			if (!edge) return
			pointer.hidden = false
			pointer.style.background = hex(carrier ? (carrier.team === 'A' ? 'teamA' : 'teamB') : 'ammo')
			const angle = Math.atan2(-edge.y, edge.x)
			const directionLabel = arrowFor(angle)
			text(
				pointer,
				`${directionLabel} ${carrier ? (carrier.id === hero.id ? 'Your Ball' : carrier.team === hero.team ? 'Your team’s Ball' : 'Enemy Ball') : 'Ball'}`,
			)
			pointer.style.left = `clamp(${t.pointerMargin}px,${(edge.x + 1) * 50}%,calc(100% - ${t.pointerMargin}px))`
			pointer.style.top = `clamp(${t.pointerTop}px,${(1 - edge.y) * 50}%,calc(100% - ${t.pointerBottom}px))`
			pointer.style.transform = 'translate(-50%,-50%)'
		},
		dispose() {
			root.remove()
			for (const label of timerLabels) {
				label.restore()
				label.remove()
			}
			group.removeFromParent()
			for (const resource of owned) resource.dispose()
		},
	}
}
