// Inline ElevenLabs candidates; the server owns the key and writes Dropbox plus the local library.
import {
	uses,
	numbers,
	addLibraryFiles,
	setPile,
	deckStep,
	deck,
	pileFiles,
	where,
} from './state.js'

const panels = new Map()
const promptKey = (id) => `dodgethis-sound-prompt:${id}`
const families = {
	Fletcher: 'taut string and wood',
	Mitts: 'leather and thump',
	Structures: 'stone and iron',
	Ball: 'bright glass and a low bloom',
	Menus: 'quiet wood and paper, soft and dry, never beeps',
	'Splash and descent': 'quiet wood and paper, soft and dry',
	Lobby: 'quiet wood and paper, soft and dry',
}

function initialPrompt(id) {
	const { about, source } = uses[id]
	const family = families[source] ?? `one consistent timbre family for ${source}`
	return `${about}. Game sound effect for ${source}: ${family}. Short and front-loaded: immediate transient, no lead-in silence, tail under 400 ms in a fight. Warm analog character, readable amid combat. Never cheap-cute: no kazoo, cartoon boings or plush squeaks. One isolated effect, no music or speech.`
}

export function generatePanel(id) {
	if (panels.has(id)) return panels.get(id)
	const panel = document.createElement('details')
	const summary = document.createElement('summary')
	summary.textContent = 'Generate'
	const form = document.createElement('form')
	const field = (title, element) => {
		const row = document.createElement('p')
		const label = document.createElement('label')
		label.append(title, element)
		row.append(label)
		form.append(row)
		return element
	}
	const prompt = field('Prompt ', document.createElement('textarea'))
	prompt.name = 'text'
	prompt.rows = 5
	prompt.maxLength = 2500
	prompt.required = true
	prompt.value = initialPrompt(id)
	try {
		prompt.value = localStorage.getItem(promptKey(id)) ?? prompt.value
	} catch {
		/* Generation still works when storage is unavailable. */
	}
	const remember = () => {
		try {
			localStorage.setItem(promptKey(id), prompt.value)
		} catch {
			/* Keep the prompt in the mounted panel instead. */
		}
	}
	prompt.addEventListener('input', remember)
	const input = (title, name, min, max, step, value) => {
		const element = document.createElement('input')
		Object.assign(element, { type: 'number', name, min, max, step, value, required: true })
		return field(title, element)
	}
	// Board numbers are milliseconds; Sound Effects v2 accepts 0.5–30 seconds.
	const length = Math.min(30, Math.max(0.5, (numbers.get(id)?.length ?? 500) / 1000))
	const seconds = input(
		'Length (seconds) ',
		'seconds',
		'0.5',
		'30',
		'0.01',
		String(Math.round(length * 100) / 100),
	)
	const influence = input('Prompt influence (0–1) ', 'influence', '0', '1', '0.05', '0.3')
	const count = input('Candidates (1–4) ', 'count', '1', '4', '1', '3')
	const note = document.createElement('p')
	note.textContent =
		'ElevenLabs · minimum 0.5 s · saves to Dropbox and the library. Uses API credits.'
	const button = document.createElement('button')
	button.type = 'submit'
	button.textContent = 'Generate'
	const status = document.createElement('p')
	status.setAttribute('role', 'status')
	status.setAttribute('aria-live', 'polite')
	form.append(note, button, status)
	let busy = false
	form.addEventListener('submit', async (event) => {
		event.preventDefault()
		if (busy || !form.reportValidity()) return
		busy = true
		remember()
		button.disabled = true
		const amount = count.valueAsNumber
		const started = Date.now()
		const progress = () => {
			button.textContent = `Generating ${amount}…`
			status.textContent = `ElevenLabs is making ${amount} candidates · ${Math.floor((Date.now() - started) / 1000)} s`
		}
		progress()
		const timer = setInterval(progress, 1000)
		try {
			const response = await fetch('/__sound/generate', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					use: id,
					text: prompt.value,
					seconds: seconds.valueAsNumber,
					influence: influence.valueAsNumber,
					count: amount,
				}),
			})
			const result = await response.json()
			if (!response.ok) throw new Error(result.error ?? 'Generation failed.')
			await addLibraryFiles(result.files)
			// Don't audition this use's file in another use if selection changed during generation.
			if (where().use === id) {
				setPile(`generated/${id}`)
				// An existing generated pile may have older files: start on the first fresh candidate.
				deck.at = Math.max(pileFiles(id).indexOf(result.files[0]), 0)
				deck.heard = false
				deckStep(1)
			}
			status.textContent = `${result.files.length} candidates ready · ${Math.round((Date.now() - started) / 1000)} s. Saved to Dropbox and the library.`
		} catch (error) {
			status.textContent = error.message
		} finally {
			clearInterval(timer)
			busy = false
			button.disabled = false
			button.textContent = 'Generate'
		}
	})
	panel.append(summary, form)
	panels.set(id, panel)
	return panel
}
