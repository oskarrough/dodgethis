import * as THREE from 'three'
import { listedHeroes } from './heroes.js'
import { tune } from './tune.js'
import { ICONS } from './hud.js'
import { paintedCard } from './front/skin.js'
import { tune as frontTune } from './front/tune.js'
import './lobby-heroes.css'

// The lobby's hero strip: one painted card per hero, stacked down the left edge and leaning on
// the saucer's lip (spice drifts off it to the plates, `lobby-dust.js`), apart from the
// HUD so it reads as a menu rather than part of your hero. Yours slides out on a wash bleed;
// clicking it opens the numbers sheet.
export function createHeroStrip({ el, heroes, current, pick, openNumbers }) {
	const strip = document.createElement('nav')
	strip.className = 'lobby-hero-strip'
	strip.setAttribute('aria-label', 'Pick a hero')
	strip.innerHTML = `<kbd class="lobby-hero-strip-key"></kbd>`
	const key = strip.firstChild
	const point = new THREE.Vector3()
	const seats = heroes.map(() => 0)
	// Heroes show up here once they're playable; there are no "soon" cards.
	const tiles = heroes.map((definition, i) => {
		const button = document.createElement('button')
		button.type = 'button'
		button.className = 'skin-card'
		button.dataset.hero = definition.id
		button.dataset.light = 'day'
		button.dataset.quiet = '' // the pick sounds on its swap fact a tick later (lobby.pick)
		button.style.setProperty('--wash', frontTune.skin.wash.hero)
		button.innerHTML = `${paintedCard(i)}<span class="skin-sheet"></span><span class="skin-ring"></span><span class="skin-face"></span><span class="lobby-hero-strip-face">${definition.icon ?? ICONS[definition.id] ?? ICONS[definition.silhouette] ?? ICONS.empty}</span><span class="lobby-hero-strip-name skin-title"><span>${definition.id}</span></span>`
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

	// Each card's middle sits `overlap` of a card inside the lip where the lip crosses its row, so the
	// strip follows the saucer's curve. Layout boxes stay put: the camera fits the saucer beside them.
	function seat(camera, rim) {
		const lip = rim.map((p) => {
			point.copy(p).project(camera)
			return { x: ((point.x + 1) * innerWidth) / 2, y: ((1 - point.y) * innerHeight) / 2 }
		})
		// Where the lip's left side crosses a row. A row above or below the saucer is read at the
		// lip's top or bottom instead, `inset` px in, so the card stays on the lip, not in the air.
		const top = Math.min(...lip.map((p) => p.y))
		const bottom = Math.max(...lip.map((p) => p.y))
		const lipAt = (row, inset) => {
			const y = Math.min(Math.max(row, top + inset), bottom - inset)
			let x = Math.min(...lip.map((p) => p.x))
			for (const [i, a] of lip.entries()) {
				const b = lip[(i + 1) % lip.length]
				if (a.y === b.y || (a.y - y) * (b.y - y) > 0) continue
				const cross = a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x)
				if (cross < innerWidth / 2) x = cross
			}
			return x
		}
		const overlap = tune.lobby.strip.overlap
		for (const [i, button] of tiles.entries()) {
			const box = button.getBoundingClientRect()
			// offsetLeft already includes last frame's shift; measuring from it made the cards flip
			// between two places every frame.
			const middle = strip.offsetLeft + button.offsetLeft - seats[i] + button.offsetWidth / 2
			const to =
				lipAt(box.top + box.height / 2, box.height * 0.4) + button.offsetWidth * (overlap - 0.5)
			// The camera breathes; following every sub-pixel of it made the cards jiggle, so only a
			// real move (a resize, a new framing) reseats them.
			const next = Math.round(Math.max(0, to - middle))
			if (Math.abs(next - seats[i]) < tune.lobby.strip.settle) continue
			seats[i] = next
			button.style.setProperty('--seat', `${seats[i]}px`)
		}
	}

	return {
		el: strip,
		sync,
		seat,
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
