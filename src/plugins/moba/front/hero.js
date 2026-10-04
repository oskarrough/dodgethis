import { el as make } from '../../../core/dom.js'
import { tune as kit } from '../tune.js'
import { heroDefinition } from '../heroes.js'
import { tune } from './tune.js'
import { heroStats, numberLines, abilityLines } from './stats.js'

const slots = ['Trait', 'Q', 'W', 'E', 'R']
const names = ['Momentum', 'Loose', 'Vault', 'Rain', 'Volley']

// Each hero owns one saturated colour; `on` is the ink that reads on it.
const roster = [
	{
		id: 'fletcher',
		name: 'Fletcher',
		role: 'Ranged poke',
		color: 'var(--ui-blue)',
		on: 'var(--ui-cream)',
		silhouette:
			'M17 9 Q10 9 10 19 V38 Q10 46 17 46 Q24 46 24 38 V19 Q24 9 17 9Z M26 14 L30 3 L34 14 L31 36Z',
	},
	{
		id: 'mitts',
		name: 'Mitts',
		role: 'Keeper',
		color: 'var(--ui-button)',
		on: 'var(--ui-text)',
		silhouette:
			'M6 20 Q6 13 13 13 H28 Q35 13 35 20 V40 Q35 47 28 47 H13 Q6 47 6 40Z M28 14 V6 Q28 2 31 2 Q34 2 34 6 V12 L38 8 L40 12 L36 25Z',
	},
	{
		id: 'carom',
		name: 'Carom',
		role: 'Trick shot',
		color: '#3fbf8a',
		on: 'var(--ui-text)',
		silhouette: 'M20 15 L35 44 Q20 50 5 44Z M31 3 A7 7 0 1 0 31 17 A7 7 0 1 0 31 3Z M30 16 L26 32',
	},
	{
		id: 'skip',
		name: 'Skip',
		role: 'Captain',
		color: 'var(--ui-red)',
		on: 'var(--ui-cream)',
		silhouette: 'M3 20 H37 V45 H3Z M28 17 L39 10 V25 L28 20Z',
	},
]

// Kit icons key on the ability id, never the slot. Fills mark the solid parts.
const icons = {
	momentum: `<path d="M12 34 Q8 14 26 11 Q41 10 40 25 Q39 36 27 35" /><path class="fill" d="M31 29 L25 36 L33 40Z" />`,
	pocket: `<path class="fill" d="M10 12 H38 V30 Q38 40 24 41 Q10 40 10 30Z" /><path d="M10 20 H38 M20 26 L28 26" />`,
	loose: `<path d="M8 40 L34 14" /><path class="fill" d="M27 9 L40 8 L39 21Z" /><path d="M8 40 L6 31 M8 40 L17 42 M13 35 L11 27 M13 35 L21 37" />`,
	vault: `<path d="M6 42 H42" /><path d="M8 38 Q20 2 36 30" /><path class="fill" d="M30 29 L40 36 L41 24Z" />`,
	rain: `<ellipse cx="24" cy="40" rx="17" ry="4.5" class="fill" /><path d="M13 5 V27 M24 3 V25 M35 5 V27" /><path class="fill" d="M9 25 L13 33 L17 25Z M20 23 L24 31 L28 23Z M31 25 L35 33 L39 25Z" />`,
	volley: `<path d="M8 40 L36 10 M8 40 L42 26 M8 40 L22 6" /><path class="fill" d="M30 8 L40 6 L38 16Z M36 21 L45 26 L36 31Z M17 8 L23 2 L27 11Z" />`,
	toss: `<path d="M8 40 Q14 10 36 16" stroke-dasharray="3 5" /><circle class="fill" cx="36" cy="16" r="7" />`,
	catch: `<path class="fill" d="M10 22 Q10 14 18 14 H30 Q38 14 38 22 V34 Q38 42 30 42 H18 Q10 42 10 34Z" /><path d="M30 15 V7 Q30 3 33 3 Q36 3 36 7 V16 M17 22 V30 M24 22 V30 M31 22 V30" />`,
	dive: `<path d="M4 40 H44" /><path class="fill" d="M10 30 Q22 18 40 24 L36 32 Q22 28 12 36Z" /><path d="M4 24 H14 M2 31 H9" />`,
	soon: `<rect class="fill" x="12" y="21" width="24" height="19" rx="3" /><path d="M17 21 V15 Q17 8 24 8 Q31 8 31 15 V21" />`,
}
const iconSvg = (id) =>
	`<svg viewBox="0 0 48 48" aria-hidden="true">${icons[id] ?? icons.soon}</svg>`
const bust = `<svg viewBox="0 0 40 54" aria-hidden="true"><path d="M12 19 Q8 5 20 4 Q32 5 28 19 L23 24 L30 42 L37 49 H3 L10 42 L17 24Z"/></svg>`
const seat = (team, label, you = false) =>
	`<span class="front-seat ${team}${you ? ' you' : ''}" aria-label="${label}">${bust}</span>`

function rosterCard(hero, playable, selected) {
	const style = `--hero-color: ${hero.color}; --hero-on: ${hero.on}`
	const figure = `<svg viewBox="0 0 44 54" aria-hidden="true"><path d="${hero.silhouette}"/></svg>`
	// Locked heroes are toys still in the box: a printed carton with a window and a Soon sticker.
	if (!playable)
		return `<div class="front-roster-card front-boxed" data-hero="${hero.id}" aria-disabled="true" aria-label="${hero.name}, coming soon" style="${style}"><span class="front-box-window">${figure}</span><span class="front-roster-name">${hero.name}</span><span class="front-box-soon" aria-hidden="true">Soon</span></div>`
	return `<button type="button" class="front-roster-card front-sticker" data-hero="${hero.id}" aria-pressed="${selected}" aria-label="${hero.name}, ${hero.role}" style="${style}"><span class="front-card-face"></span>${figure}<span class="front-roster-name">${hero.name}</span></button>`
}

export function createHeroCard(play = () => {}, initialHero = 'fletcher') {
	let heroId = initialHero
	const playable = (id) => heroDefinition(id).playable
	const heroOf = (id) => roster.find((hero) => hero.id === id)
	const kitIds = () =>
		heroId === 'fletcher'
			? ['momentum', 'loose', 'vault', 'rain', 'volley']
			: [
					'pocket',
					...Object.values(heroDefinition(heroId).abilities).map((ability) => ability?.id ?? null),
				]
	const skillNames = () =>
		heroId === 'fletcher'
			? names
			: kitIds().map((id) => (id ? id[0].toUpperCase() + id.slice(1) : 'Soon'))
	const el = make('section', 'front-hero')
	el.setAttribute('aria-label', 'Character select')
	el.innerHTML = `<div class="front-roster-cards" role="group" aria-label="Hero roster">${roster.map((hero) => rosterCard(hero, playable(hero.id), hero.id === heroId)).join('')}</div>
		<header class="front-hero-title"><h1 class="front-hero-name"></h1><p class="front-hero-role"><span class="front-role"></span><button type="button" class="front-slot front-trait front-sticker" data-slot="Trait"><span class="front-card-face"></span><span class="front-slot-icon"></span><span class="front-skill-name"></span></button></p></header>
		<div class="front-kit" role="group" aria-label="Abilities">${slots
			.slice(1)
			.map(
				(key) =>
					`<button type="button" class="front-slot front-kit-slot front-sticker" data-slot="${key}"><span class="front-card-face"></span><span class="front-slot-icon"></span><kbd class="front-slot-key">${key}</kbd><span class="front-skill-name"></span></button>`,
			)
			.join('')}</div>
		<div class="front-info">
			<section class="front-ability-detail" aria-label="Ability details" aria-live="polite" hidden><h2></h2><div class="front-detail-lines"></div></section>
			<div class="front-values" hidden aria-label="Full values at level 1 and level 10"></div>
		</div>
		<div class="front-ready"><button type="button" class="front-numbers front-sticker" aria-expanded="false" aria-label="All numbers"><span class="front-card-face"></span><span>#</span></button><div class="front-seats" aria-label="Practice: you and two allied bots against three enemy bots">${seat('ally', 'You', true)}${seat('ally', 'Allied bot')}${seat('ally', 'Allied bot')}<span class="front-versus" aria-hidden="true">vs</span>${seat('enemy', 'Enemy bot')}${seat('enemy', 'Enemy bot')}${seat('enemy', 'Enemy bot')}</div>
		<button type="button" class="front-lock front-sticker front-cta"><span class="front-card-face"></span><span class="front-lock-label">Lock in</span><kbd class="front-lock-key"></kbd></button></div>`
	let previous = ''
	let open = false
	let pinned = null
	let shown = null
	let detailText = ''
	// Numbers appear only for a hovered, focused or pinned ability; at rest the card is all picture.
	function showDetail() {
		const index = slots.indexOf(shown)
		const lines = index < 0 ? [] : abilityLines(heroStats(kit, tune, 1, heroId), shown, heroId)
		const title = index < 0 ? '' : `${slots[index]} · ${skillNames()[index]}`
		const next = JSON.stringify([title, lines, shown === pinned])
		if (next === detailText) return
		detailText = next
		const detail = el.querySelector('.front-ability-detail')
		detail.hidden = index < 0
		detail.classList.toggle('pinned', !!shown && shown === pinned)
		detail.querySelector('h2').textContent = title
		detail.querySelector('.front-detail-lines').replaceChildren(
			...lines.map((text) => {
				const p = document.createElement('p')
				p.textContent = text
				return p
			}),
		)
		el.querySelectorAll('.front-slot').forEach((button) => {
			button.setAttribute('aria-pressed', String(button.dataset.slot === pinned))
			button.classList.toggle('pinned', button.dataset.slot === pinned)
			button.classList.toggle('previewing', button.dataset.slot === shown)
		})
		el.dataset.pinned = pinned ?? ''
		el.dataset.preview = shown ?? ''
	}
	function preview(next) {
		shown = next ?? pinned
		showDetail()
		play(shown)
	}
	el.addEventListener('pointerleave', () => preview(null))
	el.addEventListener('pointerout', (event) => {
		if (!event.target.closest('.front-slot')) return
		if (event.relatedTarget?.closest?.('.front-slot')) return
		preview(null)
	})
	function refresh() {
		const next = JSON.stringify([
			heroId,
			heroDefinition(heroId).base,
			heroDefinition(heroId).basic,
			Object.values(heroDefinition(heroId).abilities).map((ability) => ability?.stats),
			kit.catching,
			kit.hero,
			kit.attack,
			kit.orders.attackRange,
			kit.momentum,
			kit.loose,
			kit.vault,
			kit.rain,
			tune.level,
			tune.volley,
			tune.preview.distance,
		])
		if (previous === next) return
		previous = next
		detailText = ''
		showDetail()
		const s = heroStats(kit, tune, 1, heroId)
		const high = heroStats(kit, tune, tune.level.cap, heroId)
		const hero = heroOf(heroId)
		el.style.setProperty('--hero-color', hero.color)
		el.style.setProperty('--hero-on', hero.on)
		el.querySelector('.front-hero-name').textContent = hero.name
		el.querySelector('.front-role').textContent = hero.role
		const ids = kitIds()
		el.querySelectorAll('.front-slot').forEach((button, i) => {
			button.querySelector('.front-slot-icon').innerHTML = iconSvg(ids[i])
			button.querySelector('.front-skill-name').textContent = skillNames()[i]
			button.classList.toggle('front-slot-empty', !ids[i])
		})
		el.querySelectorAll('.front-roster-card[aria-pressed]').forEach((node) =>
			node.setAttribute('aria-pressed', String(node.dataset.hero === heroId)),
		)
		el.querySelector('.front-seat.you').setAttribute('aria-label', `You, ${hero.name}`)
		el.dataset.hero = heroId
		const numbers =
			heroId !== 'fletcher'
				? [slots.flatMap((slot) => abilityLines(s, slot, heroId))]
				: [
						numberLines(s, tune.preview.distance),
						[
							`Level ${high.level} · ${Math.round(high.hp)} HP · basic ${Math.round(high.attack)} · Loose ${Math.round(high.q.damage)} · Rain ${Math.round(high.e.damage)} · Volley ${Math.round(high.r.damage)} damage`,
							`HP and damage +${tune.level.growth * 100}% per level; other values unchanged.`,
						],
					]
		el.querySelector('.front-values').replaceChildren(
			...numbers.map((values) => {
				const column = document.createElement('div')
				column.replaceChildren(
					...values.map((text) => {
						const p = document.createElement('p')
						p.textContent = text
						return p
					}),
				)
				return column
			}),
		)
	}
	refresh()
	return {
		el,
		refresh,
		preview,
		get heroId() {
			return heroId
		},
		choose(id) {
			if (!playable(id)) return false
			heroId = id
			pinned = shown = null
			refresh()
			return true
		},
		select(next) {
			pinned = next
			preview(next)
		},
		toggle() {
			open = !open
			el.querySelector('.front-values').hidden = !open
			el.querySelector('.front-numbers').setAttribute('aria-expanded', String(open))
			el.classList.toggle('numbers-open', open)
		},
	}
}

// This parent scope survives selection → play. Nested kit folders avoid collision with
// the lane's existing run-owned registrations, which this slice does not own.
export function registerKitTune(app) {
	app.debug.tune('kit', kit, (folder, values) => {
		const step = app.clock.step
		const ranges = {
			hero: {
				hp: [200, 3000, 100],
				speed: [1, 12, 0.1],
				accel: [1, 80, 1],
				friction: [0, 40, 0.5],
				stopFriction: [0, 60, 0.5],
				stopSpeed: [0, 6, 0.1],
				radius: [0.1, 1, 0.05],
				halfHeight: [0.1, 1, 0.05],
			},
			attack: { damage: [10, 300, 5], rate: [0.25, 3, 0.05] },
			orders: { attackRange: [1, 10, 0.25] },
			momentum: { reduction: [0, 4, 0.25] },
			loose: {
				damage: [10, 500, 10],
				speed: [6, 60, 0.5],
				range: [3, 30, 0.5],
				radius: [0.05, 1.5, 0.05],
				castPoint: [step, 0.5, step],
				cooldown: [step, 10, step],
			},
			vault: { range: [0.5, 8, 0.25], time: [step, 1, step], cooldown: [step, 10, step] },
			rain: {
				damage: [10, 500, 10],
				range: [1, 20, 0.25],
				radius: [0.1, 6, 0.1],
				delay: [step, 3, step],
				slow: [0, 1, 0.01],
				duration: [step, 5, step],
				cooldown: [step, 12, step],
			},
		}
		for (const [name, fields] of Object.entries(ranges)) {
			const f = folder.addFolder(name)
			for (const [key, range] of Object.entries(fields))
				f.add(values[name], key, ...range).name(
					key === 'hp'
						? 'HP (match on restart)'
						: name === 'hero' && ['radius', 'halfHeight'].includes(key)
							? key + ' (model on restart)'
							: key,
				)
		}
	})
}
