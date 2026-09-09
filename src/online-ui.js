import { MAX_BOTS } from './online-session.js'

export function createOnlineUi(session, { onOpen = () => {}, onClose = () => {} } = {}) {
	// The entry button lives in the playable hub's splash markup.
	const entry = document.querySelector('.splash .online-entry')
	const panel = document.createElement('dialog')
	panel.className = 'online-panel dialog-card'
	panel.setAttribute('aria-labelledby', 'online-title')
	document.body.append(panel)
	let busy = false
	let error = ''
	let joinCode = ''
	entry.onclick = () => {
		onOpen()
		error = ''
		render()
		panel.showModal()
	}
	panel.addEventListener('cancel', (event) => {
		event.preventDefault()
		leave()
	})
	panel.addEventListener('keydown', (event) => event.stopPropagation())
	panel.addEventListener('keyup', (event) => event.stopPropagation())
	function leave() {
		session.leave()
		panel.close()
		onClose()
	}
	function button(text, action, disabled = false) {
		const el = document.createElement('button')
		el.type = 'button'
		el.className = 'sticker'
		el.textContent = text
		el.disabled = disabled || busy
		el.onclick = async () => {
			error = ''
			busy = true
			render()
			try {
				await action()
			} catch (e) {
				error = e.message
			}
			busy = false
			render()
		}
		return el
	}
	function render(state = session.state, message = '') {
		if (message) error = message
		panel.replaceChildren()
		const heading = document.createElement('h1')
		heading.id = 'online-title'
		heading.textContent = state ? `Private lobby · ${state.code}` : 'Play online'
		panel.append(heading)
		const actions = document.createElement('div')
		actions.className = 'actions'
		if (!state) {
			const intro = document.createElement('p')
			intro.className = 'line'
			intro.textContent = 'Two teams. First to two round wins. Up to 8 players.'
			const choices = document.createElement('div')
			choices.className = 'online-choices'
			const create = document.createElement('section')
			create.innerHTML =
				'<h2>Bring your crew</h2><p>Share a code with friends. Pick teams and add bots in your lobby.</p>'
			create.append(button('Create lobby', () => session.host()))
			const join = document.createElement('form')
			join.innerHTML = '<h2>Got an invite?</h2><p>Join a friend’s lobby. Team up or face off.</p>'
			const label = document.createElement('label')
			label.textContent = 'Lobby code'
			const input = document.createElement('input')
			input.name = 'code'
			input.placeholder = 'ABCDE'
			input.maxLength = 12
			input.value = joinCode
			input.autocomplete = 'off'
			input.autocapitalize = 'characters'
			input.spellcheck = false
			input.required = true
			input.disabled = busy
			const joinButton = button('Join lobby', () => session.join(joinCode.trim()), !joinCode.trim())
			input.oninput = () => {
				joinCode = input.value
				joinButton.disabled = busy || !joinCode.trim()
			}
			join.onsubmit = (event) => {
				event.preventDefault()
				if (!joinButton.disabled) joinButton.click()
			}
			label.append(input)
			join.append(label, joinButton)
			choices.append(create, join)
			panel.append(intro, choices)
		} else {
			const hint = document.createElement('p')
			hint.className = 'line'
			hint.textContent = `Share code ${state.code} with friends. ${state.humans.length}/8 humans connected.`
			panel.append(hint)
			const editable = session.net.isHost && state.phase === 'lobby'
			for (const human of state.humans) {
				const label = document.createElement('label')
				label.textContent = `${human.peerId === session.net.id ? 'You' : human.peerId === state.hostId ? 'Host' : `Player ${state.humans.indexOf(human) + 1}`} ${human.peerId === state.hostId ? '(host)' : ''} `
				const select = document.createElement('select')
				select.setAttribute(
					'aria-label',
					`Team for ${human.peerId === session.net.id ? 'you' : `player ${state.humans.indexOf(human) + 1}`}`,
				)
				for (const team of ['A', 'B']) {
					const option = document.createElement('option')
					option.value = team
					option.textContent = `Team ${team}`
					select.append(option)
				}
				select.value = human.team
				select.disabled = !editable
				select.onchange = () => {
					session.setTeam(human.id, select.value)
				}
				label.append(select)
				panel.append(label)
			}
			for (const team of ['A', 'B']) {
				const label = document.createElement('label')
				label.textContent = `Team ${team} bots `
				const input = document.createElement('input')
				input.type = 'number'
				input.min = '0'
				input.max = String(MAX_BOTS)
				input.value = state.bots[team]
				input.setAttribute('aria-label', `Team ${team} bots`)
				input.disabled = !editable
				input.onchange = () => {
					try {
						session.setBots(team, Number(input.value))
					} catch (e) {
						error = e.message
						render()
					}
				}
				label.append(input)
				panel.append(label)
			}
			if (state.phase === 'lobby') {
				const canStart = ['A', 'B'].every(
					(team) => state.bots[team] > 0 || state.humans.some((p) => p.team === team),
				)
				if (session.net.isHost)
					actions.append(button('Start match', () => session.start(), !canStart))
				const hint = document.createElement('p')
				hint.className = 'line'
				hint.textContent = !canStart
					? 'Both teams need at least one human or bot.'
					: session.net.isHost
						? 'First team to win two rounds wins the match.'
						: 'Waiting for the host to start.'
				panel.append(hint)
			}
		}
		const status = document.createElement('p')
		status.className = 'line'
		status.setAttribute('role', 'status')
		status.textContent = error || (busy ? 'Connecting…' : state?.message || '')
		const back = button(state ? 'Leave lobby' : 'Back to game', leave)
		back.disabled = false
		actions.append(back)
		panel.append(status, actions)
	}
	return {
		render,
		get open() {
			return panel.open
		},
		show(message = '') {
			error = message
			render()
			if (!panel.open) panel.showModal()
		},
		hide() {
			panel.close()
		},
	}
}
