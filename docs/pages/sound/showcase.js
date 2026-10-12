// Production-only entry. Audition committed picks and the shipped shortlist without touching the workbench.
import * as audio from '/src/core/audio.js'
import * as swap from '/src/core/sound-swap.js'
import { createSounds, playUse } from '/src/plugins/moba/sounds.js'
import { uses } from '/src/plugins/moba/sound-table.js'

createSounds(audio)
audio.previewMusic(null)
await swap.loaded
const response = await fetch('/sfx/showcase/shortlists.json')
if (!response.ok) throw new Error(`Sound shortlist: ${response.status}`)
const shortlists = await response.json()
const ids = Object.keys(uses)
const sources = [...new Set(ids.map((id) => uses[id].source))]
const $ = (id) => document.getElementById(id)
const el = (tag, props = {}, ...children) => {
	const node = Object.assign(document.createElement(tag), props)
	node.append(...children)
	return node
}

// No dev endpoint, review deck, write action or workbench keyboard handler is loaded here.
for (const id of ['find', 'fight', 'resync', 'resync-status']) $(id).remove()
document.querySelector('.legend').remove()
document.querySelector('.hint').textContent = 'Read-only · current picks and top five candidates'
document.querySelector('.hint').removeAttribute('title')
$('progress').replaceWith(el('span', { textContent: `${ids.length} sounds` }))
$('stop').textContent = 'Stop'
$('tabs').textContent = 'Top five candidates'
$('map').remove()
$('tool').hidden = false

let previewContext
const buffers = new Map()
let active = null
let generation = 0
function stop() {
	generation++
	active?.stop()
	active = null
	audio.previewMusic(null)
}
async function candidate(file, gain) {
	stop()
	const asked = generation
	previewContext ??= new AudioContext()
	await previewContext.resume()
	if (!buffers.has(file))
		buffers.set(
			file,
			(async () => {
				const response = await fetch(swap.libraryUrl(file))
				if (!response.ok) throw new Error(`${file}: ${response.status}`)
				return previewContext.decodeAudioData(await response.arrayBuffer())
			})(),
		)
	const buffer = await buffers.get(file)
	if (asked !== generation) return
	active = previewContext.createBufferSource()
	active.buffer = buffer
	const level = previewContext.createGain()
	level.gain.value = gain ?? 0.5
	active.connect(level).connect(previewContext.destination)
	active.start()
}
function current(id) {
	stop()
	if (uses[id].music) audio.previewMusic(uses[id].music)
	else playUse(audio, id)
}
function button(text, action, props = {}) {
	const b = el('button', { type: 'button', textContent: text, ...props })
	b.addEventListener('click', async () => {
		try {
			await action()
			$('notice').textContent = ''
		} catch (error) {
			$('notice').textContent = `Could not play: ${error.message}`
		}
	})
	return b
}
function selected() {
	return new URLSearchParams(location.hash.slice(1)).get('u')
}
function go(id) {
	location.hash = new URLSearchParams({ u: id })
}

$('strip').replaceChildren(
	...sources.map((source) =>
		el(
			'div',
			{ className: 'source' },
			el('span', { textContent: source }),
			el(
				'div',
				{ className: 'lights' },
				...ids
					.filter((id) => uses[id].source === source)
					.map((id) => {
						const b = button('', () => go(id), {
							className: 'light',
							title: `${id}: ${uses[id].about}`,
							ariaLabel: id,
						})
						b.dataset.use = id
						b.dataset.status = uses[id].music ? 'music' : swap.kept[id] ? 'kept' : 'builtin'
						return b
					}),
			),
		),
	),
)
$('sources').replaceChildren(
	...sources.flatMap((source) => [
		el('h2', { textContent: source }),
		el(
			'ul',
			{},
			...ids
				.filter((id) => uses[id].source === source)
				.map((id) =>
					el('li', {}, el('a', { href: `#u=${id}`, textContent: id, title: uses[id].about })),
				),
		),
	]),
)
function draw() {
	const id = uses[selected()] ? selected() : ids[0]
	for (const b of $('strip').querySelectorAll('button'))
		b.ariaCurrent = String(b.dataset.use === id)
	for (const a of $('sources').querySelectorAll('a')) a.ariaCurrent = String(a.hash === `#u=${id}`)
	const picked = swap.kept[id]
	const name = (s) => s.kept ?? s.library ?? s.voice
	const playing = picked?.shuffle
		? picked.shuffle.map(name).join(', ')
		: picked
			? name(picked)
			: uses[id].music
				? 'Synth music'
				: `Built in (${uses[id].voice ?? 'synth'})`
	$('inspector').replaceChildren(
		el('h2', { textContent: id }),
		el('p', { textContent: uses[id].about }),
		el('h3', { textContent: 'Current pick' }),
		el('p', { textContent: playing }),
		button('Play current pick', () => current(id), { id: 'play-current' }),
	)
	const list = (shortlists[id] ?? []).slice(0, 5)
	$('tool').replaceChildren(
		...(list.length
			? list.map((c, i) =>
					el(
						'section',
						{},
						el('h2', { textContent: `Candidate ${i + 1}` }),
						button(c.file, () => candidate(c.file, c.gain), {
							title: c.why,
							className: 'candidate',
						}),
						el('p', { textContent: `${c.why} · gain ×${c.gain}` }),
					),
				)
			: [
					el('p', {
						textContent: uses[id].music
							? 'Music has no library shortlist.'
							: 'No shortlist for this sound yet.',
					}),
				]),
	)
}
addEventListener('hashchange', draw)
addEventListener('keydown', (e) => {
	if (e.metaKey || e.ctrlKey || e.altKey) return
	if (e.key === 'Escape') stop()
	else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
		e.preventDefault()
		const at = ids.indexOf(selected())
		go(ids[(at + (e.key === 'ArrowDown' ? 1 : -1) + ids.length) % ids.length])
	}
})
$('stop').addEventListener('click', stop)
if (!uses[selected()]) go(ids[0])
draw()
