import { el } from './dom.js'

// Player feedback from the speech-bubble tile, top right: one text box, posted to dodgethis' inkast list.
// The send URL is public by design (anyone can add to the list, only its owner reads it); the read key never ships.
// Ported from NK GTA's Post app (oskarrough/nkgta src/feedback.js).
const INKAST = 'https://inkast.0sk.ar/rtk4gwbs'
const MAX_TEXT = 2000
const MAX_BYTES = 4000 // inkast takes up to 4 KB a string

export function shortAgent(ua, touch = false) {
	const browser = /(Firefox|Edg|OPR|Chrome|Version)\/(\d+)/.exec(ua)
	const name = !browser
		? 'browser'
		: ({ Edg: 'Edge', OPR: 'Opera', Version: 'Safari' }[browser[1]] ?? browser[1])
	const os = /Android|iPhone|iPad|Windows|Mac OS X|Linux/.exec(ua)?.[0] ?? 'unknown'
	return `${name}${browser ? ` ${browser[2]}` : ''} · ${os}${touch ? ' · touch' : ''}`
}

// The player's words first, then where they were, so a reader can find the spot again.
export function feedbackText(text, context) {
	const lines = Object.entries(context).map(([key, value]) => `${key}: ${value ?? '-'}`)
	let body = text.trim().slice(0, MAX_TEXT)
	const tail = `\n\n${lines.join('\n')}`
	const encoder = new TextEncoder()
	while (body && encoder.encode(body + tail).length > MAX_BYTES) body = body.slice(0, -50)
	return body + tail
}

// `button` opens and closes the box; `context()` says where the player is when they send.
export function createPlayerFeedback(button, { context }) {
	const form = el(
		'form',
		'player-feedback',
		document.body,
		`<textarea maxlength="${MAX_TEXT}" rows="5" placeholder="What went wrong, what felt off, what is missing?" aria-label="Feedback"></textarea>
		<p>Anyone can read what is sent here: it becomes a public GitHub issue, so leave out anything private. The page address, the screen you are on and your browser are sent with it.</p>
		<div><small role="status"></small><button type="submit">Send</button></div>`,
	)
	form.hidden = true
	const field = form.querySelector('textarea')
	const note = form.querySelector('small')
	const send = form.querySelector('button')
	function show(open) {
		form.hidden = !open
		button.setAttribute('aria-expanded', String(open))
		if (open) field.focus()
		else button.blur() // keep Space and Enter for the game
	}
	button.setAttribute('aria-expanded', 'false')
	button.addEventListener('click', () => show(form.hidden))
	// Typing here is not playing: keys stop at the box.
	for (const type of ['keydown', 'keyup']) form.addEventListener(type, (e) => e.stopPropagation())
	form.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) form.requestSubmit()
		if (e.key === 'Escape') show(false)
	})
	field.addEventListener('input', () => (note.textContent = ''))
	form.addEventListener('submit', (e) => {
		e.preventDefault()
		const text = field.value.trim()
		if (!text) return field.focus()
		send.disabled = true
		note.textContent = 'Sending…'
		fetch(INKAST, { method: 'POST', body: feedbackText(text, context()) })
			.then((res) => {
				if (!res.ok) throw new Error(res.status)
				field.value = ''
				note.textContent = 'Sent. Thank you.'
			})
			.catch(() => (note.textContent = 'Not sent. Try again in a moment.'))
			.finally(() => (send.disabled = false))
	})
}
