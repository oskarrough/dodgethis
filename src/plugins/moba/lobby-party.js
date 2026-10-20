import * as THREE from 'three'
import { HEROES } from './heroes.js'
import { tune } from './tune.js'

// Empty plates stay empty. Only the host edits bots; humans use the ordinary pick intents.
export function createLobbyParty({
	el,
	readySeats,
	heroes,
	intents,
	hero,
	setup,
	strip,
	cancelReady,
	authoritative,
	tick,
}) {
	let selected = readySeats.seatOf(hero.id) ?? readySeats.seats[0]
	let previousSeat = null
	let previousDevice = null
	let previousState = null
	const point = new THREE.Vector3()
	const heading = document.createElement('div')
	heading.className = 'lobby-party-heading'
	heading.innerHTML = `<strong>Your party · against the Warden</strong><p>1–${tune.lobby.partyCapacity} heroes. Empty seats stay empty. Select a bot to change its hero.</p><p>← → seat · H hero · Enter ready</p><p class="lobby-party-selection" aria-live="polite"></p>`
	el.append(heading)
	const status = heading.lastChild
	const controls = document.createElement('div')
	const add = document.createElement('button')
	const remove = document.createElement('button')
	const solo = document.createElement('button')
	for (const [button, label] of [
		[add, 'Add bot'],
		[remove, 'Remove bot'],
		[solo, 'Remove all bots'],
	]) {
		button.type = 'button'
		button.textContent = label
		controls.append(button)
	}
	controls.hidden = !authoritative
	heading.append(controls)
	const labels = readySeats.seats.map((seat, index) => {
		const button = document.createElement('button')
		button.type = 'button'
		button.className = 'lobby-label lobby-party-seat'
		button.dataset.seat = seat.id
		button.onclick = () => select(seat)
		el.append(button)
		return { seat, button, name: `Seat ${index + 1}` }
	})
	function editable() {
		return selected.occupant?.id === hero.id || (authoritative && selected.occupant?.bot)
	}
	function invalidateReady() {
		cancelReady()
		for (const seat of readySeats.seats) {
			if (!seat.occupant || seat.occupant.bot) continue
			const id = seat.occupant.id
			const frame = intents.get(id)
			while (frame.pressed.some((edge) => edge.action === 'ready')) intents.consume(id, 'ready')
			// Cancel through control so only an active ready walk loses its order.
			// A fresh ordinary order in this frame still runs after that cancellation.
			if (heroes.find((human) => human.id === id)?.readyWalk) intents.press(id, 'cancel')
			readySeats.cancel(id, tick())
		}
	}
	function sync() {
		const state = JSON.stringify([selected.id, ...readySeats.seats.map((s) => s.occupant)])
		if (state === previousState) return
		previousState = state
		strip.sync(selected.occupant?.heroId ?? hero.heroId)
		for (const { seat, button, name } of labels) {
			const occupant = seat.occupant
			button.textContent = occupant
				? `${occupant.id === hero.id ? 'You' : name} · ${occupant.heroId} · ${occupant.bot ? 'Bot' : 'Human'}`
				: `${name} · Empty`
			button.setAttribute('aria-pressed', String(seat === selected))
		}
		status.textContent = editable()
			? `Picking for ${selected.occupant.id === hero.id ? 'you' : 'bot'}: ${selected.occupant.heroId}`
			: selected.occupant
				? 'Each human picks their own hero.'
				: authoritative
					? 'Empty seat. Add a bot or invite a friend.'
					: 'Empty seat. The host can add a bot.'
		add.disabled = !readySeats.seats.some((s) => !s.occupant)
		remove.disabled = !selected.occupant?.bot
		solo.disabled = !readySeats.seats.some((s) => s.occupant?.bot)
	}
	function select(seat) {
		if (seat === selected) return
		cancelReady()
		selected = seat
		sync()
	}
	add.onclick = () => {
		if (!authoritative) return
		const seat = !selected.occupant ? selected : readySeats.seats.find((s) => !s.occupant)
		if (!seat) return
		invalidateReady()
		let serial = 1
		while (readySeats.seatOf(`bot-A-${serial}`)) serial++
		const id = `bot-A-${serial}`
		readySeats.claim(
			seat.id,
			{ id, heroId: 'brew', bot: true, joinOrder: readySeats.seats.length + serial },
			tick(),
		)
		selected = seat
		sync()
	}
	remove.onclick = () => {
		if (!authoritative || !selected.occupant?.bot) return
		invalidateReady()
		delete setup.picks[selected.occupant.id]
		readySeats.release(selected.occupant.id, tick())
		sync()
	}
	solo.onclick = () => {
		if (!authoritative) return
		invalidateReady()
		for (const seat of readySeats.seats) {
			if (!seat.occupant?.bot) continue
			delete setup.picks[seat.occupant.id]
			readySeats.release(seat.occupant.id, tick())
		}
		selected = readySeats.seatOf(hero.id) ?? selected
		sync()
	}
	sync()
	return {
		currentHero: () => selected.occupant?.heroId ?? hero.heroId,
		editingAlly: () => selected.occupant?.id !== hero.id,
		sync,
		cycle(delta) {
			const index = readySeats.seats.indexOf(selected)
			select(readySeats.seats[(index + delta + labels.length) % labels.length])
		},
		pick(heroId, at) {
			if (selected.occupant?.id === hero.id) return false
			if (!authoritative || !selected.occupant?.bot || !HEROES[heroId]?.playable) return true
			invalidateReady()
			readySeats.claim(selected.id, { ...selected.occupant, heroId }, at)
			setup.picks[selected.occupant.id] = { heroId, team: 'A' }
			sync()
			return true
		},
		update(camera, device) {
			const entered = readySeats.seats.find((seat) => readySeats.contains(seat, hero.body.position))
			if (entered?.occupant?.bot && entered !== previousSeat) select(entered)
			previousSeat = entered
			sync()
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
