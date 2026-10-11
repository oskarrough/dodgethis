// The inspector: the selected sound, what it plays now (drawn), and the deck, a card per candidate. Swipe left
// (X) to nope a file for good, right (S) to like it into the shuffle, K to keep and move to the next sound. Built
// once per selected sound and updated in place, so focus and the card survive every redraw.
import {
	audio,
	swap,
	uses,
	library,
	folders,
	inFolder,
	folderOf,
	fileName,
	numbersOf,
	shortlist,
	gainFor,
	deck,
	pileFiles,
	candidate,
	setPile,
	deckStep,
	deckTo,
	nope,
	where,
	step,
	play,
	playBuiltin,
	previewMusic,
	playing,
	status,
	busOf,
	factsOf,
	numbers,
	rendered,
	flags,
	libraryBuffer,
	preview,
	keepSwap,
	approve,
	isApproved,
	local,
	same,
	nameOf,
	measureUse,
	emit,
} from './state.js'
import { describe } from './numbers.js'
import { drawWave } from './waveform.js'
import { fight } from './tools.js'

function el(tag, props = {}, ...children) {
	const node = Object.assign(document.createElement(tag), props)
	node.append(...children)
	return node
}
// A button with its key on it: key('K', 'Keep', fn).
function key(letter, text, onClick, props = {}) {
	const b = el('button', { type: 'button', ...props })
	b.append(...(letter ? [el('kbd', { textContent: letter })] : []), text)
	b.addEventListener('click', onClick)
	return b
}

// Liked files per use: the shuffle Keep ships. Starts from a shuffle already being tried in this browser.
const liked = new Map()
const likedOf = (id) => {
	if (!liked.has(id)) liked.set(id, [...(local(id)?.shuffle ?? [])])
	return liked.get(id)
}

// Deck actions, shared with the keyboard (board.js).
export const actions = {
	next: () => swipe('right-soft', () => deckStep(1)),
	previous: () => deckStep(-1),
	again: () => where().use && play(where().use),
	builtin: () => where().use && playBuiltin(where().use),
	fight: () => where().use && fight(where().use),
	nope() {
		const { use } = where()
		const path = candidate()
		if (!use || !path) return
		swipe('left', () => {
			nope(use, path)
			deck.at -= 1
			deckStep(1)
		})
	},
	like() {
		const { use } = where()
		const path = candidate()
		if (!use || !path) return
		const list = likedOf(use)
		if (!list.some((s) => s.library === path))
			list.push({ library: path, gain: gainFor(use, path) })
		swipe('right', () => deckStep(1))
	},
	near: () => setPile('near'),
	async keep() {
		const { use } = where()
		if (!use || uses[use].music) return
		const list = likedOf(use)
		if (list.length) await swap.setSwap(use, { shuffle: list })
		const mine = local(use)
		// Nothing tried: the sound that plays now stays, and an unswapped built-in sound counts as picked.
		if (!mine || same(mine, swap.kept[use]) || (mine.builtin && !swap.kept[use])) {
			if (!swap.kept[use] && !isApproved(use)) await approve(use)
			return step(1)
		}
		if (isApproved(use)) await approve(use, true)
		await keepSwap(use)
		liked.delete(use)
		measureUse(use).then(() => emit('change'))
		step(1)
	},
}
function swipe(direction, then) {
	const card = view?.card
	if (!card || direction === 'right-soft') return then()
	card.classList.remove('swipe-left', 'swipe-right')
	void card.offsetWidth
	card.classList.add(`swipe-${direction}`)
	setTimeout(() => {
		card.classList.remove(`swipe-${direction}`)
		then()
	}, 180)
}

let view = null
export function drawInspector(root) {
	const { use } = where()
	if (!use) {
		view = null
		return root.replaceChildren(
			el('p', { className: 'empty', textContent: 'Pick a sound in the strip or the list.' }),
		)
	}
	if (view?.id !== use) view = build(root, use)
	update()
}

function pileOptions(id) {
	const option = (value, textContent) => el('option', { value, textContent })
	return [
		...(shortlist(id).length ? [option('shortlist', `Shortlist (${shortlist(id).length})`)] : []),
		option('near', 'Near this one'),
		option('', `Everything (${library.length})`),
		...folders.map((folder) => {
			const depth = folder.split('/').length - 1
			return option(
				folder,
				`${'   '.repeat(depth)}${folder.split('/').at(-1)}/ (${inFolder(folder).length})`,
			)
		}),
	]
}

function build(root, id) {
	const use = uses[id]
	const v = { id, drawnNow: null, drawnCard: undefined }
	v.title = el('h2', { textContent: id })
	v.nowWave = el('canvas', { className: 'wave' })
	v.nowText = el('p', { className: 'meta' })
	v.flag = el('p', { className: 'flag' })
	const head = el('div', {}, v.title, el('p', { className: 'about', textContent: use.about }))
	const facts = el(
		'dl',
		{ className: 'facts' },
		el('dt', { textContent: 'Bus' }),
		el('dd', { textContent: busOf(id) }),
		el('dt', { textContent: 'Set off by' }),
		el('dd', { textContent: factsOf(id).join(', ') || 'the screen itself' }),
	)
	if (use.music) {
		root.replaceChildren(
			head,
			el(
				'div',
				{ className: 'row' },
				key('Space', 'Play', () => play(id)),
				key('', 'Stop', () => previewMusic(null)),
			),
			facts,
		)
		return v
	}
	// A new deck starts on the shortlist when there is one; otherwise the last pile picked stays.
	if (deck.use !== id) {
		deck.use = id
		if (shortlist(id).length) deck.pile = 'shortlist'
		else if (deck.pile === 'shortlist' || deck.pile === 'near') deck.pile = ''
		deck.at = -1
	}

	v.pile = el('select', { ariaLabel: 'Candidates from' }, ...pileOptions(id))
	v.pile.addEventListener('change', () => {
		setPile(v.pile.value)
		v.pile.blur()
	})
	v.find = el('input', { type: 'search', placeholder: 'Find a file…' })
	v.find.setAttribute('list', 'library-files')
	v.find.addEventListener('change', () => {
		if (!library.includes(v.find.value)) return
		deckTo(v.find.value)
		v.find.value = ''
		v.find.blur()
	})
	v.cardWave = el('canvas', { className: 'wave' })
	v.cardName = el('div', { className: 'name' })
	v.cardMeta = el('div', { className: 'meta' })
	v.card = el('div', { className: 'card' }, v.cardMeta, v.cardName, v.cardWave)
	v.cardWave.addEventListener('click', () => candidate() && play(id))
	v.keep = key('K', 'Keep', actions.keep, { className: 'keep' })
	v.liked = el('ul', { className: 'shuffle' })
	v.likedHead = el('h3')
	v.level = el('input', { type: 'range', min: 0.05, max: 1.5, step: 0.05, ariaLabel: 'File level' })
	v.level.addEventListener('change', async () => {
		const chosen = swap.swapOf(id)
		if (!swap.swapUrl(chosen)) return
		const gain = Number(v.level.value)
		await swap.setSwap(
			id,
			chosen.shuffle
				? { shuffle: chosen.shuffle.map((s) => ({ ...s, gain })) }
				: { ...chosen, gain },
		)
		play(id)
		measureUse(id).then(() => emit('change'))
	})
	v.voices = el(
		'select',
		{ ariaLabel: 'Another game sound' },
		el('option', { value: '', textContent: 'Use another game sound…' }),
		...swap
			.voiceNames()
			.filter((name) => !['tick', 'tickPerfect'].includes(name))
			.map((name) => el('option', { value: name, textContent: name })),
	)
	v.voices.addEventListener('change', async () => {
		if (!v.voices.value) return
		await swap.setSwap(id, { voice: v.voices.value })
		play(id)
		measureUse(id).then(() => emit('change'))
	})
	v.reset = key('', 'Back to built in', async () => {
		liked.delete(id)
		await swap.setSwap(id, swap.kept[id] ? { builtin: true } : null)
		measureUse(id).then(() => emit('change'))
	})
	root.replaceChildren(
		head,
		el('section', {}, el('h3', { textContent: 'Plays now' }), v.nowWave, v.nowText, v.flag),
		el(
			'div',
			{ className: 'row' },
			key('Space', 'Play', actions.again),
			key('B', 'Built in', actions.builtin),
			key('F', 'In a fight', actions.fight),
		),
		el(
			'section',
			{ className: 'deck' },
			el('h3', { textContent: 'Candidates' }),
			el('div', { className: 'row' }, v.pile, v.find),
		),
		v.card,
		el(
			'div',
			{ className: 'row' },
			key('←', 'Back', actions.previous),
			key('X', 'Nope', actions.nope, { title: 'Never offer this file for this sound again' }),
			key('S', 'Like', actions.like, { title: 'Add to the shuffle and go on' }),
			key('→', 'Next', actions.next),
			key('N', 'Near', actions.near, { title: 'Candidates that sound like this one' }),
		),
		el('div', { className: 'row' }, v.keep, el('span', { className: 'grow' })),
		el('section', {}, v.likedHead, v.liked),
		el('label', { className: 'row' }, 'Level ', v.level),
		facts,
		el('div', { className: 'row' }, v.voices, v.reset),
	)
	return v
}

function update() {
	const v = view
	const id = v.id
	if (uses[id].music) return
	const n = numbers.get(id)
	v.nowText.textContent = [playing(id), n && describe(n)].filter(Boolean).join(' · ')
	v.flag.textContent = flags()[id]?.join('; ') ?? ''
	const buffer = rendered.get(id)
	if (v.drawnNow !== buffer) {
		v.drawnNow = buffer
		drawWave(v.nowWave, buffer, { color: status(id) === 'kept' ? '#a87a10' : '#1d1a17' })
	}
	if (document.activeElement !== v.pile) v.pile.value = deck.pile

	// The card.
	const files = pileFiles(id)
	const path = candidate()
	if (v.drawnCard !== path) {
		v.drawnCard = path
		if (!path) {
			v.cardMeta.textContent = `${files.length} candidates`
			v.cardName.textContent = files.length ? 'Press → to start' : 'Nothing left in this pile'
			drawWave(v.cardWave, null)
		} else {
			const c = shortlist(id).find((s) => s.file === path)
			const numbersHere = numbersOf(path)
			v.cardMeta.textContent = `${deck.at + 1} of ${files.length} · ${folderOf(path) || 'top'}/`
			v.cardName.replaceChildren(
				fileName(path),
				el('div', {
					className: 'meta',
					textContent: [c?.why, numbersHere && describe(numbersHere)].filter(Boolean).join(' · '),
				}),
			)
			drawWave(v.cardWave, null)
			libraryBuffer(path).then(
				(b) => candidate() === path && drawWave(v.cardWave, b, { color: '#3a6ee0' }),
			)
		}
	} else if (!path) v.cardMeta.textContent = `${files.length} candidates`

	// Keep says what it will ship.
	const list = likedOf(id)
	const mine = local(id)
	const untouched = !mine || same(mine, swap.kept[id]) || (mine.builtin && !swap.kept[id])
	v.keep.lastChild.textContent = list.length
		? `Keep ${list.length} liked`
		: !untouched
			? 'Keep this one'
			: swap.kept[id] || isApproved(id)
				? 'Picked · next sound'
				: 'Built in is fine'
	v.likedHead.textContent = list.length ? `Liked: one plays at random` : ''
	v.liked.replaceChildren(
		...list.map((item, i) =>
			el(
				'li',
				{},
				key('', '▶', () =>
					item.library
						? preview(item.library, item.gain)
						: audio.sample(swap.swapUrl(item), { gain: item.gain ?? 0.5 }),
				),
				el('span', { textContent: nameOf(item) }),
				key('', '×', () => {
					list.splice(i, 1)
					emit('change')
				}),
			),
		),
	)
	const chosen = swap.swapOf(id)
	v.level.value = chosen?.gain ?? 0.5
	v.level.disabled = !swap.swapUrl(chosen)
}

// The find box's choices: every library file.
document.body.append(
	el('datalist', { id: 'library-files' }, ...library.map((path) => el('option', { value: path }))),
)
