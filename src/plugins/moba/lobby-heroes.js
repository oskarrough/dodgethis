import * as THREE from 'three'
import { listedHeroes } from './heroes.js'
import { tune } from './tune.js'
import { ICONS } from './hud.js'
import { paintedCard } from './front/skin.js'
import { tune as frontTune } from './front/tune.js'
import './lobby-heroes.css'

// The lobby's hero strip: one painted card per hero, stacked down the left edge, apart from
// the HUD so it reads as a menu rather than part of your hero. Yours slides out on a wash
// bleed; clicking it opens the numbers sheet.
export function createHeroStrip({ el, heroes, current, pick, openNumbers }) {
	const strip = document.createElement('nav')
	strip.className = 'lobby-hero-strip'
	strip.setAttribute('aria-label', 'Pick a hero')
	strip.innerHTML = '<kbd class="lobby-hero-strip-key"></kbd>'
	const key = strip.firstChild
	// Heroes show up here once they're playable; there are no "soon" cards.
	const tiles = heroes.map((definition, i) => {
		const button = document.createElement('button')
		button.type = 'button'
		button.className = 'skin-card'
		button.dataset.hero = definition.id
		button.dataset.light = 'day'
		button.style.setProperty('--wash', frontTune.skin.wash.hero)
		button.innerHTML = `${paintedCard(i)}<span class="skin-sheet"></span><span class="skin-ring"></span><span class="skin-face"></span><span class="lobby-hero-strip-face">${definition.icon ?? ICONS[definition.id] ?? ''}</span><span class="lobby-hero-strip-name skin-title"><span>${definition.id}</span></span>`
		button.onclick = () => {
			if (button.dataset.hero === current) return openNumbers()
			pick(definition.id)
		}
		button.onanimationend = () => button.classList.remove('pop')
		strip.append(button)
		return button
	})
	el.append(strip)

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
			key.textContent = device === 'gamepad' ? '✛↑' : ''
			strip.dataset.device = device
		},
		dispose() {
			strip.remove()
		},
	}
}

// A pick intent names its hero by an authored point, so it travels as plain x/z like any order.
// Nothing stands there: you pick from the strip or with H, and confirm on a seat.
export function heroStands(heroes = listedHeroes()) {
	const v = tune.lobby.pick
	return heroes.map((definition, i) => ({
		id: definition.id,
		x: v.x,
		z: v.z + (i - (heroes.length - 1) / 2) * v.spacing,
	}))
}

export function createLobbyHeroes({ el, humans, local, heroes }) {
	const stands = heroStands(heroes)
	const point = new THREE.Vector3()
	const labels = []
	const names = humans
		.filter((human) => human.id !== local)
		.map((human) => {
			const label = document.createElement('div')
			label.className = 'lobby-label lobby-player-tag'
			label.dataset.participant = human.id
			label.textContent = `P${human.joinOrder + 1}`
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
			for (const label of labels) label.remove()
		},
	}
}
