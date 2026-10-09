import * as THREE from 'three'
import { createBody } from '../../core/body.js'
import { makeStyleMaterial } from '../../core/stylepass.js'
import { dressHero } from './hero-view.js'
import { HEROES } from './heroes.js'
import { tune } from './tune.js'
import { ICONS } from './hud.js'
import './lobby-heroes.css'

// The lobby's hero strip: one tile per hero, stacked down the left edge, apart from the
// HUD so it reads as a menu rather than part of your hero. Yours slides out, framed gold;
// clicking it opens the numbers sheet. Locked tiles say "soon" and wobble.
export function createHeroStrip({ el, heroes, current, pick, openNumbers }) {
	const strip = document.createElement('nav')
	strip.className = 'lobby-hero-strip'
	strip.setAttribute('aria-label', 'Pick a hero')
	strip.innerHTML = '<kbd class="lobby-hero-strip-key"></kbd>'
	const key = strip.firstChild
	const tiles = Object.values(heroes).map((definition) => {
		const button = document.createElement('button')
		button.type = 'button'
		button.dataset.hero = definition.id
		if (!definition.playable) button.setAttribute('aria-disabled', 'true')
		button.innerHTML = `<span class="lobby-hero-strip-face">${ICONS[definition.id] ?? ''}</span><span class="lobby-hero-strip-name"><span>${definition.id}</span></span>${definition.playable ? '' : '<small>soon</small>'}`
		button.onclick = () => {
			if (button.dataset.hero === current) return openNumbers()
			if (!definition.playable) wobble(button)
			pick(definition.id)
		}
		button.onanimationend = () => button.classList.remove('wobble', 'pop')
		strip.append(button)
		return button
	})
	el.append(strip)

	function wobble(button) {
		button.classList.remove('wobble')
		void button.offsetWidth
		button.classList.add('wobble')
	}

	function sync(heroId) {
		const changed = heroId !== current
		current = heroId
		for (const button of tiles) {
			const mine = button.dataset.hero === heroId
			button.setAttribute('aria-pressed', String(mine))
			button.setAttribute(
				'aria-label',
				mine ? `${button.dataset.hero}: show numbers` : button.dataset.hero,
			)
			if (mine && changed) {
				button.classList.remove('pop')
				void button.offsetWidth
				button.classList.add('pop')
			}
		}
	}

	sync(current)

	return {
		el: strip,
		sync,
		setDevice(device) {
			key.textContent = device === 'gamepad' ? '✛↑' : device === 'keyboard' ? '↑↓' : ''
			strip.dataset.device = device
		},
		dispose() {
			strip.remove()
		},
	}
}

// Intent picks and walk-on picks use the same authored stand positions.
export function heroStands() {
	const v = tune.lobby.pick
	const playable = Object.values(HEROES).filter((h) => h.playable)
	return playable.map((definition, i) => ({
		id: definition.id,
		x: v.x,
		z: v.z + (i - (playable.length - 1) / 2) * v.spacing,
	}))
}

export function createLobbyHeroes({ scene, el, humans, local }) {
	const stands = heroStands()
	const point = new THREE.Vector3()
	const material = makeStyleMaterial('ammo', { flat: true })
	const ring = new THREE.RingGeometry(
		tune.lobby.pick.radius,
		tune.lobby.pick.radius + tune.lobby.gallery.ringWidth,
		tune.lobby.cutout.segments,
	)
	const labels = []
	const props = stands.map((stand) => {
		const body = createBody(scene, null, null, {
			profile: HEROES[stand.id].base,
			position: [stand.x, 0, stand.z],
			replica: true,
		})
		const undress = dressHero(body, stand.id)
		body.mesh.scale.setScalar(tune.lobby.ready.cardScale)
		body.position.y *= tune.lobby.ready.cardScale
		const pad = new THREE.Mesh(ring, material)
		pad.rotation.x = -Math.PI / 2
		pad.position.set(stand.x, tune.lobby.gallery.ringY, stand.z)
		scene.add(pad)
		const label = document.createElement('div')
		label.className = 'lobby-label'
		label.textContent = stand.id
		label.dataset.picked = 'true'
		el.append(label)
		labels.push(label)
		return { body, undress, pad, label }
	})
	const names = humans.map((human) => {
		const label = document.createElement('div')
		label.className = 'lobby-label sticker'
		label.dataset.participant = human.id
		label.textContent = `Player ${human.joinOrder + 1}${human.id === local ? ' (you)' : ''}`
		label.style.cssText = 'translate:none;opacity:1;pointer-events:none;margin:0'
		el.append(label)
		labels.push(label)
		return { human, label }
	})
	function place(label, position, camera) {
		point.copy(position).project(camera)
		label.hidden = point.z < -1 || point.z > 1
		label.style.left = `${((point.x + 1) * innerWidth) / 2}px`
		label.style.top = `${((1 - point.y) * innerHeight) / 2}px`
	}
	return {
		stands,
		update(camera) {
			for (const [i, stand] of stands.entries())
				place(props[i].label, { x: stand.x, y: tune.lobby.gallery.labelY, z: stand.z }, camera)
			for (let i = names.length - 1; i >= 0; i--) {
				const { human, label } = names[i]
				if (!humans.includes(human)) {
					label.remove()
					names.splice(i, 1)
					continue
				}
				const p = human.body.mesh.position
				place(label, { x: p.x, y: p.y + tune.lobby.pick.nameHeight, z: p.z }, camera)
				label.hidden ||= human.dead
			}
		},
		dispose() {
			for (const { body, undress, pad } of props) {
				undress()
				body.dispose()
				scene.remove(pad)
			}
			for (const label of labels) label.remove()
			ring.dispose()
			material.dispose()
		},
	}
}
