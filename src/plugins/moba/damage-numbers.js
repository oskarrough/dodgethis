import * as THREE from 'three'
import { FORWARD_LAYER } from '../../core/stylepass.js'
import { tune } from './tune.js'

export function createDamageNumbers(parent) {
	const labels = []

	function pop(text, point, { color = tune.damageNumbers.colors.damage, scale = 1 } = {}) {
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
		mesh.position.set(point.x + (Math.random() - 0.5) * t.spread, t.y, point.z)
		mesh.scale.setScalar(0)
		parent.add(mesh)
		labels.push({ mesh, texture, material, aspect: canvas.width / canvas.height, scale, age: 0 })
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
		})
	}

	function xp(amount, point) {
		pop(`+${amount} XP`, point, { color: tune.damageNumbers.colors.xp })
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
			const left = Math.max(0, 1 - label.age / t.life)
			label.mesh.position.y += dt * t.rise * Math.max(0.2, left)
			const grow = Math.min(1, label.age / t.popIn)
			const height = t.height * label.scale * (0.7 + 0.3 * grow + 0.15 * Math.sin(grow * Math.PI))
			label.mesh.scale.set(height * label.aspect, height, 1)
			label.material.opacity = Math.min(1, left / t.fade)
			if (left > 0) continue
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
