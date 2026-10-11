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
	resetDeck,
	nope,
	where,
	step,
	play,
	playBuiltin,
	previewMusic,
	playing,
	status,
	isTrying,
	busOf,
	factsOf,
	numbers,
	rendered,
	flags,
	libraryBuffer,
	preview,
	keepSwap,
	usedBy,
	approve,
	isApproved,
	local,
	same,
	nameOf,
	measureUse,
	emit,
} from './state.js'
import { drawWave } from './waveform.js'
import { fight } from './tools.js'
import { generatePanel } from './generate.js'

function el(tag, props = {}, ...children) {
	const node = Object.assign(document.createElement(tag), props)
	node.append(...children)
	return node
}
// A button with its key on it: key('K', 'Keep', fn).
function key(letter, text, onClick, props = {}) {
	const b = el('button', { type: 'button', ...props })
	if (letter) b.dataset.key = letter
	b.append(...(letter ? [el('kbd', { textContent: letter })] : []), text)
	b.addEventListener('click', onClick)
	return b
}

// Liked files per use: the shuffle Keep ships. Kept in this browser (localStorage), so a reload or a Resync
// doesn't lose them; starts from a shuffle already being tried here.
const LIKES = 'dodgethis-sound-likes'
const liked = new Map(Object.entries(JSON.parse(localStorage.getItem(LIKES) ?? '{}')))
const saveLikes = () =>
	localStorage.setItem(
		LIKES,
		JSON.stringify(Object.fromEntries([...liked].filter(([, l]) => l.length))),
	)
const likedOf = (id) => {
	if (!liked.has(id)) liked.set(id, [...(local(id)?.shuffle ?? [])])
	return liked.get(id)
}
const forget = (id) => {
	liked.delete(id)
	saveLikes()
}

const lastNope = []

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
		swipe('left', async () => {
			nope(use, path)
			lastNope.push({ use, path })
			// The next card slides into the noped one's place (or the pile resumes after a one-off).
			if (deck.extra === path) deck.extra = null
			if (pileFiles(use).length) {
				deck.heard = false
				return deckStep(1)
			}
			// Nothing left: the noped file mustn't stay as the sound being tried.
			deck.at = 0
			await swap.setSwap(use, null)
			measureUse(use).then(() => emit('change'))
		})
	},
	like() {
		const { use } = where()
		const path = candidate()
		if (!use || !path) return
		const list = likedOf(use)
		// The level it was heard at, so Keep ships what Oskar liked.
		const gain = swap.swapOf(use)?.library === path ? swap.swapOf(use).gain : gainFor(use, path)
		if (!list.some((s) => s.library === path)) list.push({ library: path, gain })
		saveLikes()
		emit('notice', `Liked ${fileName(path)} · ${list.length} liked, K keeps them`)
		swipe('right', () => deckStep(1))
	},
	near: () => setPile('near'),
	// Z brings back the last file noped for this sound.
	undoNope() {
		const last = lastNope.pop()
		if (!last) return
		nope(last.use, last.path, true)
		if (last.use === where().use) deckTo(last.path)
	},
	// 1–5 jump to that shortlist candidate.
	jump(n) {
		const file = shortlist(where().use)[n - 1]?.file
		if (file) deckTo(file)
	},
	async keep() {
		const { use } = where()
		if (!use || uses[use].music) return
		const list = likedOf(use)
		if (list.length) await swap.setSwap(use, { shuffle: list })
		const mine = local(use)
		// Nothing tried: the sound that plays now stays, and an unswapped built-in sound counts as picked.
		if (!mine || same(mine, swap.kept[use]) || (mine.builtin && !swap.kept[use])) {
			if (!swap.kept[use] && !isApproved(use)) {
				await approve(use)
				emit('notice', `${use} keeps its built-in sound`)
			}
			return step(1)
		}
		if (!(await keepSwap(use))) return emit('notice', `Keep failed for ${use}; nothing changed`)
		forget(use)
		// Back to built in, kept: the built-in sound is the pick.
		if (!swap.kept[use]) await approve(use)
		else if (isApproved(use)) await approve(use, true)
		emit(
			'notice',
			swap.kept[use]
				? `Kept ${list.length ? `${list.length} files` : nameOf(mine)} for ${use}`
				: `${use} keeps its built-in sound`,
		)
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

// Drag the card: past 90 px left nopes, right likes; less springs back.
function dragToSwipe(v) {
	let start = null
	v.card.addEventListener('pointerdown', (e) => {
		if (!candidate() || e.target.closest('select, button')) return
		start = e.clientX
		v.dragged = false
		v.card.setPointerCapture(e.pointerId)
	})
	v.card.addEventListener('pointermove', (e) => {
		if (start === null) return
		const dx = e.clientX - start
		if (Math.abs(dx) > 6) v.dragged = true
		v.card.style.transform = `translateX(${dx}px) rotate(${dx / 30}deg)`
		v.card.style.boxShadow =
			dx < -40 ? 'inset 0 0 0 3px var(--red)' : dx > 40 ? 'inset 0 0 0 3px var(--green)' : ''
	})
	const end = (e) => {
		if (start === null) return
		const dx = e.clientX - start
		start = null
		v.card.style.transform = ''
		v.card.style.boxShadow = ''
		if (dx < -90) actions.nope()
		else if (dx > 90) actions.like()
		setTimeout(() => (v.dragged = false))
	}
	v.card.addEventListener('pointerup', end)
	v.card.addEventListener('pointercancel', end)
}

function tapped(node) {
	node.classList.remove('tapped')
	void node.offsetWidth
	node.classList.add('tapped')
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
		...(shortlist(id).length
			? [option('shortlist', `Shortlist (${pileFiles(id, 'shortlist').length})`)]
			: []),
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

// Four numbers, each in its encoder colour: blue length, green attack, white level, orange brightness.
function readouts() {
	const cell = (label, colour) => {
		const value = el('b')
		const unit = el('small')
		const delta = el('em')
		const node = el(
			'div',
			{},
			el('span', { textContent: label, style: `color:var(--${colour})` }),
			el('div', {}, value, unit),
			delta,
		)
		return {
			node,
			set(v, u, d = '') {
				value.textContent = v
				unit.textContent = u
				delta.textContent = d
			},
		}
	}
	const cells = [
		cell('LENGTH', 'blue'),
		cell('ATTACK', 'green'),
		cell('PEAK', 'white'),
		cell('BRIGHT', 'orange'),
	]
	// How a candidate differs from what the sound played when Oskar arrived, so a swipe compares without remembering numbers.
	const diff = (a, b, digits = 0) => {
		if (b == null || !Number.isFinite(a - b)) return ''
		const d = Number((a - b).toFixed(digits))
		return d ? `${d > 0 ? '+' : '−'}${Math.abs(d)} vs before` : 'same as before'
	}
	return {
		node: el('div', { className: 'readouts' }, ...cells.map((c) => c.node)),
		show(n, now) {
			const [length, attack, peak, bright] = cells
			if (!n) return cells.forEach((c) => c.set('–', ''))
			length.set(Math.round(n.length), 'ms', now && diff(n.length, now.length))
			attack.set(Math.round(n.attack), 'ms', now && diff(n.attack, now.attack))
			peak.set(Number.isFinite(n.peak) ? Math.round(n.peak) : '–', 'dB') // files and the game's render sit at different levels
			bright.set(
				(n.centroid / 1000).toFixed(1),
				'kHz',
				now && diff(n.centroid / 1000, now.centroid / 1000, 1),
			)
		},
	}
}
// The rule flags (numbers.js) in words that say what to do.
function plain(list = []) {
	return list
		.map((f) =>
			f.startsWith('slow attack')
				? 'Starts soft: try one that hits at once'
				: f.startsWith('tail')
					? 'Rings too long for a fight: try a shorter one'
					: f.startsWith('peak')
						? 'Too loud for a menu: try a softer one'
						: f.startsWith('timbre')
							? `${Number(f.split(' ')[1]) > Number(f.split(' ').at(-1)) ? 'Brighter' : 'Duller'} than its family: try N for neighbours`
							: f,
		)
		.join(' · ')
}
const STATUS = {
	kept: ['picked', 'green'],
	trying: ['trying', 'blue'],
	builtin: ['built in', 'dim'],
	music: ['music', 'purple'],
}

function build(root, id) {
	const use = uses[id]
	const v = { id, drawnNow: null, drawnCard: undefined }
	v.tag = el('span', { className: 'tag' })
	v.nowWave = el('canvas', { className: 'wave' })
	v.nowText = el('p', { className: 'meta' })
	v.flag = el('p', { className: 'flag' })
	v.nowNumbers = readouts()
	const screen = el(
		'section',
		{ className: 'screen' },
		el('div', { className: 'head' }, el('h2', { textContent: id }), v.tag),
		el('p', { className: 'about', textContent: use.about }),
	)
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
			screen,
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
	screen.append(v.nowNumbers.node, v.nowWave, v.nowText, v.flag)
	resetDeck()

	v.pile = el('select', { ariaLabel: 'Candidates from' })
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
	v.cardWave = el('canvas', { className: 'wave', title: 'Play again' })
	v.cardName = el('div', { className: 'name' })
	v.cardMeta = el('div', { className: 'meta' })
	v.cardNumbers = readouts()
	v.card = el(
		'section',
		{ className: 'screen card' },
		el('div', { className: 'head' }, v.pile, v.cardMeta),
		v.cardName,
		v.cardNumbers.node,
		v.cardWave,
	)
	// Tap either screen to hear it: the top one plays what the sound plays now, the card plays its candidate
	// (trying it first if it's only up next).
	v.card.addEventListener('click', (e) => {
		if (v.dragged || e.target.closest('select, button') || !candidate()) return
		if (deck.heard) play(id)
		else deckStep(1)
		tapped(v.card)
	})
	screen.addEventListener('click', () => {
		play(id)
		tapped(screen)
	})
	dragToSwipe(v)
	v.keep = el('button', { type: 'button', className: 'keep', ariaLabel: 'Keep (K)' })
	v.keep.dataset.key = 'K'
	v.keep.addEventListener('click', actions.keep)
	v.keepText = el('b')
	v.keepHint = el('span')
	v.liked = el('ul', { className: 'shuffle' })
	v.likedHead = el('h3')
	v.level = el('input', { type: 'range', min: 0.05, max: 1.5, step: 0.05, ariaLabel: 'File level' })
	v.level.addEventListener('change', async () => {
		const chosen = swap.swapOf(id)
		if (!swap.swapUrl(chosen)) return
		const gain = Number(v.level.value)
		for (const item of likedOf(id)) item.gain = gain
		saveLikes()
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
		forget(id)
		await swap.setSwap(id, swap.kept[id] ? { builtin: true } : null)
		measureUse(id).then(() => emit('change'))
	})
	const pad = (letter, text, action, className, title) =>
		key(letter, text, action, { className, ...(title ? { title } : {}) })
	root.replaceChildren(
		screen,
		el(
			'div',
			{ className: 'keys' },
			pad('␣', 'play', actions.again),
			pad('B', 'built in', actions.builtin),
			pad('F', 'in a fight', actions.fight),
			pad('N', 'near', actions.near, 'near', 'Candidates that sound like this one'),
			pad('↓', 'skip', () => step(1), '', 'Next sound, keeping nothing'),
		),
		v.card,
		el(
			'div',
			{ className: 'keys' },
			pad('←', 'back', actions.previous),
			pad('X', 'nope', actions.nope, 'nope', 'Never offer this file for this sound again'),
			pad('S', 'like', actions.like, 'like', 'Add to the shuffle and go on'),
			pad('→', 'next', actions.next),
			v.keep,
		),
		el('div', { className: 'keep-label' }, v.keepText, v.keepHint),
		el('section', {}, v.likedHead, v.liked),
		generatePanel(id),
		el(
			'details',
			{},
			el('summary', { textContent: 'More' }),
			el('div', { className: 'row' }, v.find),
			el('label', { className: 'row' }, 'Level ', v.level),
			facts,
			el('div', { className: 'row' }, v.voices, v.reset),
		),
	)
	return v
}

function update() {
	const v = view
	const id = v.id
	const [tag, colour] = STATUS[status(id)]
	v.tag.textContent = status(id) === 'kept' && isTrying(id) ? 'picked · trying' : tag
	v.tag.style.color = `var(--${colour})`
	if (uses[id].music) return
	const n = numbers.get(id)
	v.nowNumbers.show(n)
	// The card compares against the sound the use had when Oskar arrived, not against itself.
	if (!v.reference && n && !deck.heard) v.reference = n
	v.nowText.textContent = playing(id)
	v.flag.textContent = plain(flags()[id])
	const buffer = rendered.get(id)
	if (v.drawnNow !== buffer) {
		v.drawnNow = buffer
		drawWave(v.nowWave, buffer, { color: '#2bd67b' })
	}
	// Pile choices, including one a generator or the map opened that the list lacks.
	const options = pileOptions(id)
	if (!options.some((o) => o.value === deck.pile))
		options.splice(
			1,
			0,
			el('option', { value: deck.pile, textContent: `${deck.pile}/ (${pileFiles(id).length})` }),
		)
	const optionsKey = JSON.stringify(options.map((o) => o.textContent))
	if (v.pileKey !== optionsKey) {
		v.pileKey = optionsKey
		v.pile.replaceChildren(...options)
	}
	if (document.activeElement !== v.pile) v.pile.value = deck.pile

	// The card.
	const files = pileFiles(id)
	const path = candidate()
	v.cardMeta.textContent = deck.extra
		? 'one-off · → back to the pile'
		: path
			? `${deck.heard ? '' : 'up next · '}${deck.at + 1} / ${files.length}`
			: `${files.length}`
	if (v.drawnCard !== path) {
		v.drawnCard = path
		if (!path) {
			v.cardName.replaceChildren(
				files.length ? 'Press → to start' : 'Nothing left in this pile',
				el('div', {
					className: 'meta',
					textContent: files.length
						? `${files.length} candidates · drag the card or use the keys below`
						: 'N for sounds near this one, / to find any file, or generate new ones below',
				}),
			)
			v.cardNumbers.show(null)
			drawWave(v.cardWave, null)
		} else {
			const c = shortlist(id).find((s) => s.file === path)
			v.cardName.replaceChildren(
				fileName(path),
				el('div', {
					className: 'meta',
					textContent: [
						`${folderOf(path) || 'top'}/`,
						c?.why,
						usedBy(path, id).length && `also plays for ${usedBy(path, id).join(', ')}`,
					]
						.filter(Boolean)
						.join(' · '),
				}),
			)
			v.cardNumbers.show(numbersOf(path), v.reference)
			drawWave(v.cardWave, null)
			libraryBuffer(path).then(
				(b) => candidate() === path && drawWave(v.cardWave, b, { color: '#3fa9f5' }),
			)
		}
	}

	// Keep says what it will ship.
	const list = likedOf(id)
	const mine = local(id)
	const untouched = !mine || same(mine, swap.kept[id]) || (mine.builtin && !swap.kept[id])
	const picked = swap.kept[id] || isApproved(id)
	v.keepText.textContent = list.length
		? `Keep ${list.length} liked`
		: !untouched
			? 'Keep this one'
			: picked
				? 'Picked'
				: flags()[id]
					? 'Keep the built-in anyway'
					: 'Built in is fine'
	v.keepHint.textContent = list.length
		? 'one plays at random, then the next sound'
		: !untouched
			? 'ships it to the game, then the next sound'
			: picked
				? 'K goes to the next sound'
				: 'K marks it picked and moves on'
	v.likedHead.textContent = list.length ? 'Liked' : ''
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
					saveLikes()
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
