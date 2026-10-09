import * as THREE from 'three'
import { FORWARD_LAYER } from '../../core/stylepass.js'
import { tune } from './tune.js'

const easeOut = (x) => 1 - (1 - x) ** 3
const easeOutBack = (x, s) => 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2

export function createDamageNumbers(parent) {
	const labels = []

	function pop(
		text,
		point,
		{ color = tune.damageNumbers.colors.damage, scale = 1, crit = false } = {},
	) {
		const t = tune.damageNumbers
		const label = String(text)
		const canvas = document.createElement('canvas')
		const context = canvas.getContext('2d')
		const font = `bold ${t.font}px ${t.family}`
		context.font = font
		canvas.width = Math.ceil(context.measureText(label).width + t.outline * 2)
		canvas.height = Math.ceil(t.font * 1.4 + t.outline * 2)
		context.font = font
		context.textAlign = 'center'
		context.textBaseline = 'middle'
		context.lineJoin = 'round'
		context.lineWidth = t.outline
		context.strokeStyle = t.colors.outline
		context.strokeText(label, canvas.width / 2, canvas.height / 2)
		context.fillStyle = color
		context.fillText(label, canvas.width / 2, canvas.height / 2)
		const texture = new THREE.CanvasTexture(canvas)
		texture.colorSpace = THREE.SRGBColorSpace
		const material = new THREE.SpriteMaterial({
			map: texture,
			depthWrite: false,
			transparent: true,
		})
		const mesh = new THREE.Sprite(material)
		mesh.layers.set(FORWARD_LAYER)
		const x = point.x + (Math.random() - 0.5) * t.spread
		mesh.position.set(x, t.y, point.z)
		mesh.scale.setScalar(0)
		parent.add(mesh)
		labels.push({
			mesh,
			texture,
			material,
			aspect: canvas.width / canvas.height,
			scale,
			crit,
			x,
			side: Math.random() < 0.5 ? -1 : 1,
			life: crit ? t.crit.life : t.life,
			age: 0,
		})
	}

	function hit(fact) {
		const t = tune.damageNumbers
		if (!t.enabled || !(fact.damage >= 0.5)) return
		const size = Math.min(
			t.sizing.max,
			t.sizing.min + Math.log10(1 + fact.damage) * t.sizing.growth,
		)
		pop(Math.round(fact.damage), fact.point, {
			color: fact.crit ? t.colors.crit : t.colors.damage,
			scale: size * (fact.crit ? t.sizing.crit : 1),
			crit: fact.crit,
		})
	}

	function xp(amount, point) {
		pop(`+${amount} XP`, point, {
			color: tune.damageNumbers.colors.xp,
			scale: tune.damageNumbers.sizing.xp,
		})
	}

	function remove(label) {
		parent.remove(label.mesh)
		label.texture.dispose()
		label.material.dispose()
	}

	function update(dt) {
		const t = tune.damageNumbers
		for (let i = labels.length - 1; i >= 0; i--) {
			const label = labels[i]
			label.age += dt
			const k = Math.min(1, label.age / label.life)
			const grow = Math.min(1, label.age / t.popIn)
			const pop = label.crit
				? 1 + (t.crit.punch - 1) * (1 - easeOut(grow))
				: easeOutBack(grow, t.overshoot)
			const out = Math.max(0, (k - 1 + t.fade) / t.fade)
			const travel = easeOut(k)
			label.mesh.position.x = label.x + label.side * t.drift * travel
			label.mesh.position.y = t.y + t.rise * travel
			const height = t.height * label.scale * pop * (1 - 0.3 * out)
			label.mesh.scale.set(height * label.aspect, height, 1)
			label.material.opacity = 1 - out * out
			if (label.crit)
				label.material.rotation = label.side * t.crit.tilt * (0.3 + 0.7 * (1 - easeOut(grow)))
			if (k < 1) continue
			remove(label)
			labels.splice(i, 1)
		}
	}

	function reset() {
		for (const label of labels) remove(label)
		labels.length = 0
	}

	return { pop, hit, xp, update, reset }
}
