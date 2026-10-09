import { el } from '../../core/dom.js'
import { MAX_BOTS } from './online-session.js'
import { MAX_PLAYERS } from './net.js'

// `inMatch()` is true while a match runs under the panel: Escape then resumes it rather than leaving.
export function createOnlineUi(session, { inMatch = () => false, signal } = {}) {
	const panel = el('dialog', 'online-panel dialog-card', document.body)
	panel.setAttribute('aria-labelledby', 'online-title')
	let busy = false
	let error = ''
	let joinCode = ''
	let noGames = false
	let hostPublic = true
	// Screens own their entry markup; delegation also reaches entries in fresh mode runs.
	document.addEventListener(
		'click',
		(event) => {
			if (!event.target.closest('.online-entry')) return
			error = ''
			noGames = false
			render()
			open()
		},
		{ signal },
	)
	signal?.addEventListener('abort', () => panel.remove(), { once: true })
	// The result card's curtain marks every other body child inert, this panel included; opening over it must lift that.
	function open() {
		if (!panel.open) panel.showModal()
		panel.inert = false
	}
	panel.addEventListener('cancel', (event) => {
		event.preventDefault()
		if (inMatch()) panel.close()
		else leave()
	})
	panel.addEventListener('keydown', (event) => event.stopPropagation())
	// A modal owns the keyboard even when focus slips outside it (a backdrop click): Enter must not reach the result card underneath.
	window.addEventListener(
		'keydown',
		(event) => {
			if (panel.open && !(event.target instanceof Node && panel.contains(event.target)))
				event.stopImmediatePropagation()
		},
		{ capture: true, signal },
	)
	panel.addEventListener('keyup', (event) => event.stopPropagation())
	function leave() {
		session.leave()
		panel.close()
	}
	function button(text, action, disabled = false) {
		const btn = el('button', 'sticker')
		btn.type = 'button'
		btn.textContent = text
		btn.disabled = disabled || busy
		btn.onclick = async () => {
			error = ''
			busy = true
			render()
			try {
				await action()
			} catch (e) {
				if (e.code === 'NO_PUBLIC_LOBBIES') noGames = true
				else error = e.message
			}
			busy = false
			render()
		}
		return btn
	}
	function render(state = session.state, message = '') {
		if (message) error = message
		const children = []
		const sameLobby = state && panel.dataset.lobbyCode === state.code
		const heading = document.createElement('h1')
		heading.id = 'online-title'
		heading.textContent = state
			? `${state.public ? 'Public' : 'Private'} lobby · ${state.code}`
			: 'Play online'
		children.push(heading)
		const actions = el('div', 'actions')
		if (!state) {
			// Three ways in, one row each: just play, bring a code, or make your own.
			const choices = el('div', 'online-choices')
			const quick = document.createElement('section')
			quick.append(
				button('Play', () => {
					noGames = false
					return session.quickJoin()
				}),
			)
			if (noGames) {
				const empty = document.createElement('p')
				empty.setAttribute('role', 'status')
				empty.textContent = 'No games yet. Make a new one!'
				quick.append(empty)
			}
			const join = document.createElement('form')
			const input = document.createElement('input')
			input.name = 'code'
			input.placeholder = 'Code'
			input.setAttribute('aria-label', 'Lobby code')
			input.maxLength = 12
			input.value = joinCode
			input.autocomplete = 'off'
			input.autocapitalize = 'characters'
			input.spellcheck = false
			input.required = true
			input.disabled = busy
			const joinButton = button('Join', () => session.join(joinCode.trim()), !joinCode.trim())
			input.oninput = () => {
				joinCode = input.value
				joinButton.disabled = busy || !joinCode.trim()
			}
			join.onsubmit = (event) => {
				event.preventDefault()
				if (!joinButton.disabled) joinButton.click()
			}
			join.append(input, joinButton)
			const host = el('section', 'online-host')
			const visibility = el('div', 'online-visibility', host)
			visibility.setAttribute('role', 'group')
			visibility.setAttribute('aria-label', 'Who can join')
			for (const [name, isPublic] of [
				['Public', true],
				['Private', false],
			]) {
				const choice = el('button', 'sticker', visibility)
				choice.type = 'button'
				choice.textContent = name
				choice.disabled = busy
				choice.setAttribute('aria-pressed', String(hostPublic === isPublic))
				choice.onclick = () => {
					hostPublic = isPublic
					render()
				}
			}
			host.append(button('New game', () => session.host(hostPublic)))
			choices.append(quick, join, host)
			children.push(choices)
		} else {
			const hint = el('p', 'line')
			const code = el('b', 'selectable')
			code.textContent = state.code
			hint.append(
				'Share code ',
				code,
				` with friends. ${state.humans.length}/${state.capacity ?? MAX_PLAYERS} humans connected.`,
			)
			children.push(hint)
			const editable = session.net.isHost && state.phase === 'lobby'
			// A walk-around lobby picks teams by box and fills empty boxes with bots, so it needs neither control.
			for (const human of state.liveLobby ? [] : state.humans) {
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
				children.push(label)
			}
			for (const team of state.liveLobby ? [] : ['A', 'B']) {
				const existing = sameLobby && panel.querySelector(`label[data-bot-team="${team}"]`)
				const label = existing || document.createElement('label')
				if (!existing) {
					label.dataset.botTeam = team
					label.textContent = `Team ${team} bots `
				}
				const input = existing ? label.querySelector('input') : document.createElement('input')
				input.type = 'number'
				input.min = '0'
				input.max = String(MAX_BOTS)
				if (document.activeElement !== input || !editable) input.value = state.bots[team]
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
				if (!existing) label.append(input)
				children.push(label)
			}
			if (state.liveLobby && inMatch()) {
				actions.append(button('Resume', () => panel.close()))
				const hint = el('p', 'line')
				hint.textContent = 'Stand in a box to ready up. Empty boxes play as bots.'
				children.push(hint)
			} else if (state.phase === 'lobby') {
				const canStart = ['A', 'B'].every(
					(team) => state.bots[team] > 0 || state.humans.some((p) => p.team === team),
				)
				if (session.net.isHost)
					actions.append(button('Start match', () => session.start(), !canStart))
				const hint = el('p', 'line')
				hint.textContent = !canStart
					? 'Both teams need at least one human or bot.'
					: session.net.isHost
						? state.modeId === 'dodgeball'
							? 'First team to win two rounds wins the match.'
							: 'Start everyone in the host’s game.'
						: 'Waiting for the host to start.'
				children.push(hint)
			} else if (inMatch()) {
				actions.append(button('Resume', () => panel.close()))
				if (session.net.isHost) actions.append(button('Back to lobby', () => session.backToLobby()))
			}
		}
		const status = el('p', 'line')
		status.setAttribute('role', 'status')
		status.textContent = error || (busy ? 'Connecting…' : state?.message || '')
		// Out of a lobby the panel is only a menu, so it closes from the corner; leaving a lobby stays a real button.
		const back = button(
			state ? (state.phase === 'match' ? 'Leave match' : 'Leave lobby') : '×',
			leave,
		)
		back.disabled = false
		if (state) actions.append(back)
		else {
			back.classList.add('online-close')
			back.setAttribute('aria-label', 'Close')
			children.unshift(back)
		}
		children.push(status, actions)
		// Keep bot controls mounted so typing and held spinner buttons survive roster updates.
		const previousChildren = [...panel.children]
		for (const child of previousChildren) if (!children.includes(child)) child.remove()
		children.forEach((child, index) => {
			if (panel.children[index] !== child) panel.insertBefore(child, panel.children[index] || null)
		})
		panel.dataset.lobbyCode = state?.code || ''
	}
	return {
		render,
		get open() {
			return panel.open
		},
		show(message = '') {
			error = message
			render()
			open()
		},
		hide() {
			panel.close()
		},
	}
}
