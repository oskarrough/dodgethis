import { tune } from './tune.js'
import { structureName } from './gates.js'
import { waveInterval } from './lane.js'

// A cream sticker card for the stat nerds. Builders are pure: they read live state and `tune`
// on every call, so an open card follows a `&debug` edit or a level-up. The card element only
// rewrites when the built content changes. Lobby inspection uses the same builders.

const round = (v) => Math.round(v)
const n = (v) => String(Number(Number(v).toFixed(2)))
const pct = (v) => `${round(v * 100)}%`
const growthAt = (level) => 1 + tune.levels.growth * (Math.max(1, level ?? 1) - 1)
const title = (id) => id[0].toUpperCase() + id.slice(1)
const side = (team, localTeam) => (team === localTeam ? 'Your' : 'Enemy')

// Ability stats in reading order. Keys not listed (flight height, near-miss) are presentation and stay out.
const ABILITY_ROWS = [
	['damage', 'Damage', (v, level) => `${round(v * growthAt(level))}`],
	['range', 'Range', (v) => `${n(v)} m`],
	['radius', 'Radius', (v) => `${n(v)} m`],
	['angle', 'Cone', (v) => (v >= 360 ? 'all around' : `${n(v)}°`)],
	['speed', 'Speed', (v) => `${n(v)} m/s`],
	['time', 'Travel time', (v) => `${n(v)} s`],
	['delay', 'Lands after', (v) => `${n(v)} s`],
	['castPoint', 'Cast time', (v) => (v > 0 ? `${n(v)} s` : 'instant')],
	['slow', 'Slow', (v, _, s) => `${pct(v)} for ${n(s.duration)} s`],
	['duration', 'Window', (v, _, s) => (s.slow === undefined ? `${n(v)} s` : null)],
	['speedFactor', 'Move speed', (v) => `${pct(v)} while open`],
	['damageReduction', 'Damage reduction', (v) => `${pct(v)} while Catch is active`],
	['prone', 'Prone after', (v) => `${n(v)} s`],
	['cooldown', 'Cooldown', (v) => `${n(v)} s`],
	['resetCooldown', 'After a catch', (v) => `cooldown drops to ${n(v)} s`],
]
const KIND = {
	shot: 'Line skillshot, stops on the first unit hit.',
	dash: 'Dash toward your aim.',
	zone: 'Delayed circle at your aim.',
	stance: 'Stance that catches shots in front of you.',
	melee: 'Short melee swing.',
}
// Ability-specific lines, keyed by ability id. Numbers come from tune at call time.
const SUMMARY = {
	toss: () => 'Line skillshot. With a caught shot in your pocket, Toss sends that back instead.',
	catch: () =>
		`Catch the first skillshot or Ball entering your cone for no damage. Until caught or disabled, take ${pct(tune.catch.damageReduction)} less damage from hits that still land while Catch is active.`,
	dive: () => 'Dive toward your aim, catching shots all around on the way, then lie prone.',
}
const NOTES = {
	loose: () => [`Momentum: hero hits cut Vault's cooldown by ${n(tune.momentum.reduction)} s`],
	toss: () => [`Pocketed shots last ${n(tune.catching.pocketLife)} s`],
}

// Trait per hero id: the portrait chip and its card.
const TRAITS = {
	fletcher: () => ({
		name: 'Momentum',
		icon: 'momentum',
		chip: `−${n(tune.momentum.reduction)}s`,
		summary: `Loose hitting a hero cuts Vault's cooldown by ${n(tune.momentum.reduction)} s.`,
	}),
	mitts: () => ({
		name: 'Pocket',
		icon: 'pocket',
		chip: `${n(tune.catching.pocketLife)}s`,
		summary: `Hold a caught shot for ${n(tune.catching.pocketLife)} s, then send it back with Toss.`,
	}),
}
export function heroTrait(heroId) {
	return TRAITS[heroId]?.() ?? null
}
export function traitCard(heroId) {
	const trait = heroTrait(heroId)
	return trait && { title: trait.name, tag: 'trait', summary: trait.summary, rows: [], notes: [] }
}
export const abilityName = (ability) => (ability ? title(ability.id) : 'Empty')

export function abilityCard(ability, { level = 1, key = '' } = {}) {
	if (!ability)
		return { title: 'Empty slot', tag: key, summary: 'Not built yet.', rows: [], notes: [] }
	const s = ability.stats
	const rows = ABILITY_ROWS.filter(([k]) => s[k] !== undefined)
		.map(([k, label, f]) => [label, f(s[k], level, s)])
		.filter(([, value]) => value !== null)
	if (s.damage) {
		rows.push([
			'vs structures',
			`${round(s.damage * growthAt(level) * tune.waves.abilityStructure)}`,
		])
		rows.push(['Sustained DPS', n((s.damage * growthAt(level)) / s.cooldown)])
	}
	const notes = []
	if (s.damage && level < tune.levels.cap)
		notes.push(`+${n(s.damage * tune.levels.growth)} damage per level`)
	notes.push(...(NOTES[ability.id]?.() ?? []))
	return {
		title: abilityName(ability),
		tag: key,
		summary: SUMMARY[ability.id]?.() ?? KIND[ability.kind] ?? '',
		rows,
		notes,
	}
}

export function heroCard(hero, { localTeam, localId, lobby = false } = {}) {
	const def = hero.definition
	const basic = def?.basic
	const level = hero.level ?? 1
	const rows = [
		['HP', `${round(hero.hp)} / ${round(hero.maxHp)}`],
		['Speed', `${n(def?.base.speed ?? tune.hero.speed)} m/s`],
	]
	if (basic) {
		const damage = basic.damage * growthAt(level)
		rows.push(['Basic attack', `${round(damage)} · ${n(basic.range)} m · ${n(basic.rate)}/s`])
		rows.push(['Sustained DPS', n(damage * basic.rate)])
	}
	// The lobby's half-second bounce back isn't worth a row.
	if (!lobby)
		rows.push(['Respawns after', `${n(tune.respawn.base + tune.respawn.perLevel * level)} s`])
	const who = hero.id === localId ? '' : hero.team === localTeam ? 'Ally' : 'Enemy'
	return {
		title: title(hero.heroId ?? def?.id ?? 'hero'),
		tag: `Lv ${level}`,
		tone: hero.team,
		summary: [who, basic ? '' : 'Kit not built'].filter(Boolean).join(' · '),
		rows,
		notes: hero.dead ? ['Down, respawning'] : [],
	}
}

export function structureCard(
	unit,
	{ localTeam, vulnerable = true, tick = 0, step = 1 / 60 } = {},
) {
	const t = tune[unit.kind]
	// Same rule as the lane's guns: from the late mark they fire at a fraction of their damage.
	const late = tick * step >= tune.match.late
	const damage = t.damage * (late ? tune.match.lateGunDamage : 1)
	const notes = []
	if (late) notes.push(`Late game: guns at ${pct(tune.match.lateGunDamage)} of ${round(t.damage)}`)
	if (!vulnerable) notes.push('Protected until its tower falls')
	if (unit.silentUntil > tick)
		notes.push(`Silenced by the Ball for ${Math.ceil((unit.silentUntil - tick) * step)} s`)
	return {
		title: `${side(unit.team, localTeam)} ${structureName(unit.kind)}`,
		tone: unit.team,
		summary: `${title(unit.kind)}. Shoots the nearest enemy in range; heroes who hit its allies come first.`,
		rows: [
			['HP', `${round(unit.hp)} / ${round(unit.maxHp)}`],
			['Shot', `${round(damage)} damage · ${n(t.rate)}/s`],
			['Range', `${n(t.range)} m`],
			['Tell', `${n(t.tell)} s`],
			['Abilities deal', pct(tune.waves.abilityStructure)],
			['Pays', `${round(tune.waves.structureXp)} XP`],
		],
		notes,
	}
}

export function minionCard(unit, { localTeam } = {}) {
	const t = tune.minions[unit.kind]
	const scale = unit.damageScale ?? 1
	const rows = [
		['HP', `${round(unit.hp)} / ${round(unit.maxHp)}`],
		['Attack', `${round(t.damage * scale)} · ${n(t.rate)}/s`],
		['Range', `${n(t.range)} m`],
		['XP', `${round(t.xp)} within ${n(tune.waves.soak)} m`],
	]
	if (t.structureDamage) rows.push(['vs structures', `×${n(t.structureDamage)}`])
	return {
		title: `${side(unit.team, localTeam)} ${structureName(unit.kind)}`,
		tone: unit.team,
		summary:
			scale > 1 ? `Wave minion, ${pct(scale - 1)} stronger than the first wave.` : 'Wave minion.',
		rows,
		notes: [],
	}
}

export function ballCard({ nextBall = 0, ballPop = null, carrying = false } = {}) {
	const b = tune.ball
	return {
		title: 'The Ball',
		tag: carrying ? 'yours' : `${Math.max(0, Math.ceil(ballPop ?? nextBall))} s`,
		summary: carrying
			? `You carry it. Throw toward your aim.`
			: ballPop != null
				? `Live at mid. Pops in ${Math.ceil(ballPop)} s.`
				: `Spawns at mid in ${Math.max(0, Math.ceil(nextBall))} s. Stand still ${n(b.channel)} s to pick up.`,
		rows: [
			['Hero hit', `${round(b.damage)} · stun ${n(b.stun)} s`],
			['Structure hit', `${pct(b.structureDamage)} max HP · silence ${n(b.silence)} s`],
			['Throw', `${n(b.range)} m at ${n(b.speed)} m/s`],
			['Carry speed', pct(b.carrySpeed)],
			['Lasts', `${n(b.life)} s`],
		],
		notes: [],
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

export function levelCard(team, { mine = true, tone = '' } = {}) {
	const { into, need } = levelProgress(team.xp)
	return {
		title: `${mine ? 'Your team' : 'Enemy team'}`,
		tag: `Lv ${team.level}`,
		tone,
		summary: 'Heroes share their team level.',
		rows: [
			['XP', `${round(team.xp)}`],
			['Next level', need ? `${round(need - into)} XP to go` : 'max level'],
			['Each level', `+${pct(tune.levels.growth)} HP and damage`],
			[
				'Hero takedown',
				`${round(tune.levels.takedown)} + ${round(tune.levels.victimLevel)} × level XP`,
			],
		],
		notes: [],
	}
}

export function killsCard(kills, { mine = true } = {}) {
	return {
		title: `${mine ? 'Your' : 'Enemy'} takedowns`,
		tag: String(kills),
		summary: `${mine ? 'Enemy' : 'Your'} heroes downed this match.`,
		rows: [],
		notes: [],
	}
}

// The clock's card carries the countdowns the top bar no longer shows.
export function clockCard({ elapsed = 0, nextWave = 0, nextBall, ballPop = null } = {}) {
	const kinds = Object.entries(tune.minions).map(([kind, m]) => `${m.count} ${kind}`)
	const ball =
		ballPop != null
			? `live, pops in ${Math.ceil(ballPop)} s`
			: nextBall === undefined
				? null
				: `in ${Math.max(0, Math.ceil(nextBall))} s`
	return {
		title: 'Match time',
		tag: clock(elapsed),
		summary: `Late game from ${clock(tune.match.late)}.`,
		rows: [
			['Next wave', `in ${Math.max(0, Math.ceil(nextWave))} s`],
			['Each wave', kinds.join(', ')],
			...(ball ? [['The Ball', ball]] : []),
			['Waves', `every ${n(waveInterval(elapsed))} s`],
			['Wave growth', `+${pct(tune.waves.growth)} every ${n(tune.waves.growthPeriod)} s`],
			['Late Ball', `every ${n(tune.ball.lateInterval)} s`],
			['Late guns', `${pct(tune.match.lateGunDamage)} of their damage`],
		],
		notes: [],
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

export function cardHtml(card) {
	return `<header><span class="moba-tip-title">${escape(card.title)}</span>${card.tag ? `<span class="moba-tip-tag">${escape(card.tag)}</span>` : ''}</header>${card.summary ? `<p>${escape(card.summary)}</p>` : ''}${card.rows.length ? `<dl>${card.rows.map(([k, v]) => `<dt>${escape(k)}</dt><dd>${escape(v)}</dd>`).join('')}</dl>` : ''}${(card.notes ?? []).map((note) => `<p class="moba-tip-note">${escape(note)}</p>`).join('')}`
}

// One floating card. `show(card, anchor)`: anchor is a screen point { x, y } the card sits above
// (below when there is no room), clamped inside the viewport. No pointer events, never pauses.
// A HUD anchor may carry its element's `bottom`, so a card that drops below clears it.
// A docked anchor ({ left, top } or { left, bottom }) pins the card's corner instead of floating it.
export function createTooltip(parent = document.body, id = 'moba-tip') {
	const root = document.createElement('div')
	root.className = 'moba-tip'
	root.id = id
	root.setAttribute('role', 'tooltip')
	root.hidden = true
	parent.append(root)
	let shownHtml = ''
	let shownTone = ''
	let shownAt = ''
	return {
		element: root,
		get open() {
			return !root.hidden
		},
		show(card, anchor) {
			const html = cardHtml(card)
			if (html !== shownHtml) root.innerHTML = shownHtml = html
			const tone = card.tone ?? ''
			if (tone !== shownTone) root.dataset.tone = shownTone = tone
			if (root.hidden) root.hidden = false
			const width = root.offsetWidth || 0
			const height = root.offsetHeight || 0
			const vw = globalThis.innerWidth ?? 1024
			const vh = globalThis.innerHeight ?? 768
			const margin = 8
			const docked = anchor.left !== undefined
			const left = docked ? anchor.left : anchor.x - width / 2
			const x = Math.round(Math.max(margin, Math.min(vw - width - margin, left)))
			const above = anchor.y - height - 14
			// A HUD element's anchor carries its bottom edge, so a card below clears the element.
			const below = (anchor.bottom ?? anchor.y) + (anchor.bottom === undefined ? 18 : 8)
			// Above when it fits, else below when it fits, else pinned inside the viewport (CSS caps the height).
			const wanted = docked
				? (anchor.top ?? vh - height - anchor.bottom)
				: above >= margin || below + height > vh - margin
					? above
					: below
			const y = Math.round(Math.max(margin, Math.min(vh - height - margin, wanted)))
			const at = `${x},${y}`
			if (at !== shownAt) {
				shownAt = at
				root.style.transform = `translate(${x}px, ${y}px)`
			}
		},
		hide() {
			if (!root.hidden) root.hidden = true
		},
		dispose() {
			root.remove()
		},
	}
}
