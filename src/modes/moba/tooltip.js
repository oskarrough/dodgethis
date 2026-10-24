import { tune } from './tune.js'
import { HEROES } from './heroes.js'
import { controls } from '../../core/controls.js'
import { throwHint } from '../../core/intents.js'
import {
	fillCardTemplate,
	formatCardValue,
	keywordTerms,
	n,
	pct,
	sentenceParts,
} from './card-text.js'
import { glossary, hasTerm } from './glossary.js'

export { formatCardValue, plainText } from './card-text.js'

// HUD cards, sentence first (docs/ui.md). A card is
//   { title, tag?, sentence, more?: [sentence], facts?: [[label, value]] }
// The sentence carries the numbers that matter; [[Keyword]] markup names a glossary term the
// player can hover or focus. `more` is set like the sentence; facts are quiet labelled lines for
// what the sentence leaves out. Builders are pure and read live state and `tune` on every call.

const round = (v) => Math.round(v)
const growthAt = (level) => 1 + tune.levels.growth * (Math.max(1, level ?? 1) - 1)
// flyingKick → Flying kick
const title = (id) =>
	id[0].toUpperCase() + id.slice(1).replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`)
const every = (rate) => (rate === 1 ? 'once a second' : `every ${n(1 / rate)} s`)
const list = (items) =>
	items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`

// A card template: tune numbers filled, every keyword checked against the glossary.
export function renderCardTemplate(template, scope = '', value) {
	const text = fillCardTemplate(template, scope, value)
	for (const term of keywordTerms(text))
		if (!hasTerm(term))
			throw new Error(`MOBA card keyword: ${scope} names [[${term}]], not in glossary.js`)
	return text
}

const KIND = {
	shot: 'A [[skillshot]] that stops on the first unit it hits.',
	dash: 'Dashes toward your aim.',
	zone: 'Lands in a circle at your aim after a short delay.',
	stance: 'A stance that catches shots in front of you.',
	melee: 'A short melee swing.',
}

export function heroTrait(heroId) {
	const definition = Object.hasOwn(HEROES, heroId) ? HEROES[heroId] : null
	const trait = definition?.trait?.()
	if (!trait) return null
	return {
		...trait,
		summary: renderCardTemplate(trait.summary, `heroes.${heroId}`),
		...(trait.chip !== undefined && { chip: renderCardTemplate(trait.chip, `heroes.${heroId}`) }),
	}
}
// The unit frame's chip: its card names the trait and says what the chip's number is.
export function traitCard(heroId) {
	const trait = heroTrait(heroId)
	return trait && { title: trait.name, tag: trait.chip, sentence: trait.summary }
}
export const abilityName = (ability) => (ability ? (ability.name ?? title(ability.id)) : 'Empty')

export function abilityCard(ability, { level = 1, key = '' } = {}) {
	if (!ability) return { title: 'Empty slot', tag: key, sentence: 'Nothing in this slot yet.' }
	const s = ability.stats
	// Damage grows with the hero's level, as the hit itself does (ability-effects.js).
	const scaled = (path, value) =>
		path === `${ability.id}.damage` ? round(value * growthAt(level)) : value
	const template = ability.card?.sentence ?? KIND[ability.kind] ?? ''
	const facts = (ability.card?.facts ?? []).map(([label, value]) => [
		label,
		renderCardTemplate(value, ability.id),
	])
	if (s.cooldown > 0 && !template.includes('{cooldown}'))
		facts.push(['Cooldown', formatCardValue(`${ability.id}.cooldown`, s.cooldown)])
	return {
		title: abilityName(ability),
		tag: key,
		sentence: renderCardTemplate(template, ability.id, scaled),
		facts,
	}
}

export function heroCard(hero, { localTeam, localId, lobby = false } = {}) {
	const def = hero.definition
	const basic = def?.basic
	const level = hero.level ?? 1
	const speed = `${n(def?.base.speed ?? tune.hero.speed)} m/s`
	const who = hero.id === localId ? '' : hero.team === localTeam ? 'An ally. ' : 'An enemy hero. '
	const sentence = basic
		? `${who}Basic attack hits for ${round(basic.damage * growthAt(level))} damage up to ${n(basic.range)} m ${every(basic.rate)}, and moves at ${speed}.`
		: `${who}Moves at ${speed}; no kit built yet.`
	return {
		title: def?.name ?? title(hero.heroId ?? 'hero'),
		tag: `Lv ${level}`,
		sentence,
		more: hero.dead ? ['Down, respawning.'] : [],
		// The lobby's half-second bounce back isn't worth a line.
		facts: lobby
			? []
			: [['Respawn if taken down', `${n(tune.respawn.base + tune.respawn.perLevel * level)} s`]],
	}
}

export function ballCard({ ballPop = null, carrying = false, device } = {}) {
	const b = tune.ball
	return {
		title: 'The Ball',
		sentence: carrying
			? `You carry it at ${pct(b.carrySpeed)} speed. ${throwHint(controls.preset, device)} toward your aim, up to ${n(b.range)} m.`
			: ballPop != null
				? `It's at mid until the ring runs out. Stand still beside it for ${n(b.channel)} s to pick it up.`
				: `Spawns at mid when the ring fills. Stand still beside it for ${n(b.channel)} s to pick it up.`,
		facts: [
			['Hits a hero', `${round(b.damage)} damage and a [[Stun]]`],
			['Hits a structure', `${pct(b.structureDamage)} of its max HP and a [[Silence]]`],
		],
	}
}

export function levelProgress(xp) {
	let floor = 0
	for (let level = 1; level < tune.levels.cap; level++) {
		const next = floor + tune.levels.first + tune.levels.increment * (level - 1)
		if (xp < next) return { level, into: xp - floor, need: next - floor }
		floor = next
	}
	return { level: tune.levels.cap, into: 0, need: 0 }
}

// The top bar's dots: who is up on that side, and the level they share.
export function levelCard(team, { mine = true } = {}) {
	const { into, need } = levelProgress(team.xp)
	return {
		title: mine ? 'Your heroes' : 'Enemy heroes',
		tag: `Lv ${team.level}`,
		sentence: `Each dot is ${mine ? 'one of your heroes' : 'an enemy hero'}; a hollow dot is down and respawning.`,
		more: [
			need
				? `They share level\u00a0${team.level}, ${round(need - into)}\u00a0XP short of level\u00a0${team.level + 1}.`
				: `They share level\u00a0${team.level}, the top level.`,
		],
		facts: [['Each level', `+${pct(tune.levels.growth)} HP and damage`]],
	}
}

// The score beside the dots. The number is on screen, so the card only says who did what to whom.
export function killsCard({ mine = true } = {}) {
	return mine
		? {
				title: 'Your takedowns',
				sentence: 'Times your team has taken down an enemy hero this match.',
			}
		: {
				title: 'Enemy takedowns',
				sentence: 'Times the enemy team has taken down one of your heroes this match.',
			}
}

// The kinds in a wave spawned at `seconds`, in the spawner's order (lane-waves.js): brutes join
// from the map's late mark.
export function waveKinds(seconds, late = tune.match.late) {
	return seconds >= late ? ['melee', 'ranged', 'wizard', 'brute'] : ['melee', 'ranged', 'wizard']
}

// The clock answers one question: when is the next wave, and what's in it.
export function clockCard({
	elapsed = 0,
	nextWave = 0,
	layout,
	lanes = layout?.lanes ?? [],
	reinforcements = {},
	team = 'A',
} = {}) {
	const at = elapsed + Math.max(0, nextWave)
	const kinds = waveKinds(at, layout?.late ?? tune.match.late)
	const lane = lanes.length > 1 ? 'each lane' : 'the lane'
	const extra = tune.waves.reinforcement
	const more = lanes
		.map((l) => [l.id, reinforcements[`${team}-${l.id}`] ?? 0])
		.filter(([, count]) => count > 0)
		.map(
			([id, count]) =>
				`Plus ${count} more ${extra} in the ${id} lane, one for each enemy fort you took there.`,
		)
	return {
		title: 'Next wave',
		tag: `${Math.max(0, Math.ceil(nextWave))} s`,
		sentence: `Brings ${list(kinds.map((kind) => `${tune.minions[kind].count} ${kind}`))} minion down ${lane}.`,
		more,
	}
}

// The objective pill says what wins; its card says what stands in the way.
export function objectiveCard() {
	return {
		title: 'How to win',
		sentence:
			'The enemy core takes no damage until the structures guarding it fall, so push a lane to open the way.',
	}
}

export function clock(seconds) {
	const s = Math.max(0, Math.floor(seconds))
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const escape = (text) =>
	String(text).replace(
		/[&<>"]/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
	)

// A sentence with its keywords: each a focusable word holding its own small card.
function sentenceHtml(text, ids) {
	return sentenceParts(text)
		.map((part) => {
			// A number never wraps away from its unit ("5 m/s", "230 damage").
			if (typeof part === 'string') return escape(part).replace(/(\d) (?=\S)/g, '$1\u00a0')
			const entry = glossary(part.term)
			if (!entry) return escape(part.text)
			const id = `${ids.prefix}-kw-${ids.next++}`
			return `<span class="moba-kw" tabindex="0" role="button" aria-expanded="false" aria-describedby="${id}" data-term="${escape(part.term)}">${escape(part.text)}<span class="moba-kw-card" id="${id}" role="tooltip"><b>${escape(entry.name)}</b> ${escape(entry.sentence)}</span></span>`
		})
		.join('')
}

export function cardHtml(card, prefix = 'moba-card') {
	const ids = { prefix, next: 0 }
	const lines = [card.sentence, ...(card.more ?? [])].filter(Boolean)
	const facts = card.facts ?? []
	return `<header><span class="moba-tip-title">${escape(card.title)}</span>${card.tag ? `<span class="moba-tip-tag">${escape(card.tag)}</span>` : ''}</header>${lines.map((line) => `<p>${sentenceHtml(line, ids)}</p>`).join('')}${facts.length ? `<dl>${facts.map(([k, v]) => `<div><dt>${escape(k)}</dt><dd>${sentenceHtml(v, ids)}</dd></div>`).join('')}</dl>` : ''}`
}

const MARGIN = 8
const GAP = 8
const viewport = () => ({ w: globalThis.innerWidth ?? 1024, h: globalThis.innerHeight ?? 768 })
const clampTo = (v, low, high) => Math.max(low, Math.min(high, v))

// Beside `rect`, never over it: above, below, right, then left, the first side where the whole
// card fits; on the cross axis it centres on the source and slides to stay on screen.
export function placeBeside(rect, width, height, { w, h } = viewport()) {
	const cx = clampTo((rect.left + rect.right) / 2 - width / 2, MARGIN, w - width - MARGIN)
	const cy = clampTo((rect.top + rect.bottom) / 2 - height / 2, MARGIN, h - height - MARGIN)
	const sides = [
		{ side: 'above', x: cx, y: rect.top - GAP - height, fits: rect.top - GAP - height >= MARGIN },
		{ side: 'below', x: cx, y: rect.bottom + GAP, fits: rect.bottom + GAP + height <= h - MARGIN },
		{ side: 'right', x: rect.right + GAP, y: cy, fits: rect.right + GAP + width <= w - MARGIN },
		{ side: 'left', x: rect.left - GAP - width, y: cy, fits: rect.left - GAP - width >= MARGIN },
	]
	const { side, x, y } = sides.find((s) => s.fits) ?? sides[0]
	return { side, x: Math.round(x), y: Math.round(clampTo(y, MARGIN, h - height - MARGIN)) }
}

// One floating card. `show(card, anchor, { live })`: the anchor is the source's screen rect
// ({ left, top, right, bottom }) or a point ({ x, y }). A live card takes the pointer, so its
// keywords can be hovered, tapped and focused; `held` says the pointer or focus is on it.
export function createTooltip(parent = document.body, id = 'moba-tip') {
	const root = document.createElement('div')
	root.className = 'moba-tip'
	root.id = id
	root.setAttribute('role', 'tooltip')
	root.hidden = true
	parent.append(root)
	let shownHtml = ''
	let shownAt = ''
	let inside = false
	let openWord = null
	let shownSide = 'above'
	const words = () => [...root.querySelectorAll('.moba-kw')]
	// A keyword's card opens outside the whole card, on the side away from the card's source (above it
	// when the card sits above its source), else to its right or left; it never covers the card.
	function openKeyword(word) {
		if (openWord === word) return
		closeKeyword()
		if (!word) return
		openWord = word
		word.classList.add('open')
		word.setAttribute('aria-expanded', 'true')
		const card = word.querySelector('.moba-kw-card')
		const box = root.getBoundingClientRect()
		const r = word.getBoundingClientRect()
		const { w, h } = viewport()
		const cw = card.offsetWidth,
			ch = card.offsetHeight
		const x = clampTo(r.left, MARGIN, w - cw - MARGIN)
		const y = clampTo(r.top + r.height / 2 - ch / 2, MARGIN, h - ch - MARGIN)
		const away = shownSide === 'below' ? 'below' : 'above'
		const spots = {
			above: { x, y: box.top - GAP - ch, fits: box.top - GAP - ch >= MARGIN },
			below: { x, y: box.bottom + GAP, fits: box.bottom + GAP + ch <= h - MARGIN },
			right: { x: box.right + GAP, y, fits: box.right + GAP + cw <= w - MARGIN },
			left: { x: box.left - GAP - cw, y, fits: box.left - GAP - cw >= MARGIN },
		}
		const order = [away, 'right', 'left', away === 'above' ? 'below' : 'above']
		const spot = spots[order.find((side) => spots[side].fits) ?? away]
		card.style.left = `${Math.round(spot.x - box.left)}px`
		card.style.top = `${Math.round(spot.y - box.top)}px`
	}
	function closeKeyword() {
		if (!openWord) return
		openWord.classList.remove('open')
		openWord.setAttribute('aria-expanded', 'false')
		openWord = null
	}
	const wordOf = (e) => e.target?.closest?.('.moba-kw')
	root.addEventListener('pointerenter', () => (inside = true))
	root.addEventListener('pointerleave', () => {
		inside = false
		if (openWord && !openWord.contains(document.activeElement)) closeKeyword()
	})
	root.addEventListener('pointerover', (e) => {
		if (e.pointerType === 'mouse') openKeyword(wordOf(e) ?? null)
	})
	// Touch: a tap toggles the word's card. The tap's own focus already opened it, so that one stays.
	let focusedAt = -Infinity
	root.addEventListener('click', (e) => {
		const word = wordOf(e)
		if (!word) return
		if (openWord === word && performance.now() - focusedAt > 500) openKeyword(null)
		else openKeyword(word)
	})
	root.addEventListener('focusin', (e) => {
		focusedAt = performance.now()
		openKeyword(wordOf(e) ?? null)
	})
	root.addEventListener('focusout', (e) => {
		if (!root.contains(e.relatedTarget)) closeKeyword()
	})
	root.addEventListener('contextmenu', (e) => e.preventDefault())
	// A mouse click opens a word without taking focus from the game; keys and taps still focus it.
	root.addEventListener('pointerdown', (e) => {
		if (e.pointerType === 'mouse') e.preventDefault()
	})
	return {
		element: root,
		get open() {
			return !root.hidden
		},
		get held() {
			return !root.hidden && (inside || root.contains(document.activeElement))
		},
		show(card, anchor, { live = false } = {}) {
			const html = cardHtml(card, id)
			if (html !== shownHtml) {
				openWord = null
				root.innerHTML = shownHtml = html
			}
			if (root.hidden) root.hidden = false
			if (live !== (root.dataset.live === 'true')) root.dataset.live = String(live)
			const rect =
				anchor.left !== undefined
					? anchor
					: { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y }
			const { side, x, y } = placeBeside(rect, root.offsetWidth || 0, root.offsetHeight || 0)
			shownSide = side
			const at = `${x},${y}`
			if (at !== shownAt) {
				shownAt = at
				root.style.transform = `translate(${x}px, ${y}px)`
				if (openWord) {
					const word = openWord
					openWord = null
					openKeyword(word)
				}
			}
		},
		// Steps the open keyword: the keyboard's way through a card's terms.
		stepKeyword(direction) {
			const all = words()
			if (!all.length || root.hidden) return false
			const at = all.indexOf(openWord)
			const next = at < 0 ? (direction > 0 ? 0 : all.length - 1) : at + direction
			openKeyword(all[next] ?? null)
			return true
		},
		hide() {
			if (root.hidden) return
			if (root.contains(document.activeElement)) document.activeElement.blur()
			closeKeyword()
			inside = false
			root.hidden = true
		},
		dispose() {
			root.remove()
		},
	}
}
