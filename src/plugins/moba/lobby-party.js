import * as THREE from 'three'
import { HEROES } from './heroes.js'
import { tune } from './tune.js'

// Party plates keep their occupants. Walking up or selecting a label aims the existing hero strip at that seat.
export function createLobbyParty({ el, readySeats, hero, setup, strip, cancelReady }) {
	let selected = readySeats.seatOf(hero.id)
	let previousSeat = null
	let previousDevice = null
	const point = new THREE.Vector3()
	const heading = document.createElement('div')
	heading.className = 'lobby-party-heading'
	heading.innerHTML =
		'<strong>Your party · against the Warden</strong><p>Mender suggested for you. Walk up to an ally or select their label, then pick a hero.</p><p>← → seat · H hero · Enter ready</p><p class="lobby-party-selection" aria-live="polite"></p>'
	el.append(heading)
	const status = heading.lastChild
	const labels = readySeats.seats.map((seat, index) => {
		const button = document.createElement('button')
		button.type = 'button'
		button.className = 'lobby-label lobby-party-seat'
		button.dataset.seat = seat.id
		button.onclick = () => select(seat)
		el.append(button)
		return { seat, button, name: index === 0 ? 'You' : `Ally ${index}` }
	})
	function sync() {
		strip.sync(selected.occupant.heroId)
		for (const { seat, button, name } of labels) {
			button.textContent = `${name} · ${seat.occupant.heroId}`
			button.setAttribute('aria-pressed', String(seat === selected))
		}
		const name = labels.find((entry) => entry.seat === selected).name
		status.textContent = `Picking for ${name.toLowerCase()}: ${selected.occupant.heroId}`
	}
	function select(seat) {
		if (seat === selected) return
		cancelReady()
		selected = seat
		sync()
	}
	sync()
	return {
		currentHero: () => selected.occupant.heroId,
		editingAlly: () => selected.occupant.bot,
		sync,
		cycle(delta) {
			const index = readySeats.seats.indexOf(selected)
			select(readySeats.seats[(index + delta + labels.length) % labels.length])
		},
		pick(heroId, tick) {
			if (!selected.occupant.bot) return false
			if (!HEROES[heroId]?.playable) return true
			cancelReady()
			readySeats.claim(selected.id, { ...selected.occupant, heroId }, tick)
			setup.picks[selected.occupant.id] = { heroId, team: 'A' }
			sync()
			return true
		},
		update(camera, device) {
			const entered = readySeats.seats.find((seat) => readySeats.contains(seat, hero.body.position))
			if (entered?.occupant?.bot && entered !== previousSeat) select(entered)
			previousSeat = entered
			for (const { seat, button } of labels) {
				point.set(seat.x, tune.lobby.pick.nameHeight, seat.z).project(camera)
				button.style.left = `${((point.x + 1) * innerWidth) / 2}px`
				button.style.top = `${((1 - point.y) * innerHeight) / 2}px`
			}
			if (device === previousDevice) return
			previousDevice = device
			heading.children[2].textContent =
				device === 'gamepad'
					? 'D-pad ← → seat · ↑ hero · Start ready'
					: device === 'touch' || device === 'mouse'
						? 'Select a party label, pick a hero, then walk onto your Ready plate.'
						: '← → seat · H hero · Enter ready'
		},
	}
}
