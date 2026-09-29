// Persistent browser chrome; switching uses the same run disposal as a restart.
export default function modePicker(app, destinations = {}) {
	const root = document.querySelector('.mode-picker')
	const buttons = [...root.querySelectorAll('[data-mode]')]
	let shownMode
	let shownShared

	function render() {
		const mode = app.modes.active
		const shared = app.session.shared
		if (mode === shownMode && shared === shownShared) return
		shownMode = mode
		shownShared = shared
		root.hidden = !mode
		for (const button of buttons) {
			button.setAttribute(
				'aria-pressed',
				String(button.dataset.mode === mode || mode?.startsWith(`${button.dataset.mode}-`)),
			)
			button.disabled = shared
			button.title = shared ? 'Leave the online match to change modes' : button.dataset.description
		}
	}

	for (const button of buttons) {
		button.addEventListener(
			'pointerenter',
			() => {
				if (!button.disabled) app.audio.sfx.hover()
			},
			{ signal: app.signal },
		)
		button.addEventListener(
			'click',
			() => {
				const mode = button.dataset.mode
				if (app.session.shared) return
				if (mode === app.modes.active || app.modes.active?.startsWith(`${mode}-`)) {
					button.blur()
					return
				}
				app.intents.cancel()
				app.modes.start(destinations[mode] ?? mode)
				const url = new URL(location.href)
				url.searchParams.set('mode', mode)
				history.replaceState(null, '', url)
				app.audio.sfx.switch()
				render()
				button.blur()
			},
			{ signal: app.signal },
		)
	}
	// Native Enter/Space activate the buttons; arrows move focus without moving the hero.
	root.addEventListener(
		'keydown',
		(event) => {
			event.stopPropagation()
			if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
			event.preventDefault()
			const index = buttons.indexOf(document.activeElement)
			const next =
				event.key === 'Home'
					? 0
					: event.key === 'End'
						? buttons.length - 1
						: (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
			buttons[next].focus()
		},
		{ signal: app.signal },
	)
	root.addEventListener('keyup', (event) => event.stopPropagation(), { signal: app.signal })
	root.addEventListener('focusin', () => app.intents.cancel(), { signal: app.signal })
	app.intents.suspend(() => root.contains(document.activeElement))
	app.system('present', render)
	render()
	return () => {
		root.hidden = true
	}
}
