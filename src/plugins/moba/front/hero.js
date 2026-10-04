import { tune as kit } from '../tune.js'
import { heroDefinition } from '../heroes.js'
import { tune } from './tune.js'
import { heroStats, kitLines, numberLines, abilityLines } from './stats.js'

const slots = ['Trait', 'Q', 'W', 'E', 'R']
const names = ['Momentum', 'Loose', 'Vault', 'Rain', 'Volley']
const bust = `<svg viewBox="0 0 40 54" aria-hidden="true"><path d="M12 19 Q8 5 20 4 Q32 5 28 19 L23 24 L30 42 L37 49 H3 L10 42 L17 24Z"/><path d="M11 15 L28 13 M17 25 L23 25 M8 49 L9 36 M30 49 L29 36" fill="none"/></svg>`

const roster = [
	[
		'fletcher',
		'Fletcher',
		'Ranged poke',
		'M17 9 Q10 9 10 19 V38 Q10 46 17 46 Q24 46 24 38 V19 Q24 9 17 9Z M26 14 L30 3 L34 14 L31 36Z',
	],
	[
		'mitts',
		'Mitts',
		'Keeper',
		'M6 20 Q6 13 13 13 H28 Q35 13 35 20 V40 Q35 47 28 47 H13 Q6 47 6 40Z M28 14 V6 Q28 2 31 2 Q34 2 34 6 V12 L38 8 L40 12 L36 25Z',
	],
	[
		'carom',
		'Carom',
		'Trick shot',
		'M20 15 L35 44 Q20 50 5 44Z M31 3 A7 7 0 1 0 31 17 A7 7 0 1 0 31 3Z M30 16 L26 32',
	],
	['skip', 'Skip', 'Captain', 'M3 20 H37 V45 H3Z M28 17 L39 10 V25 L28 20Z'],
]

export function createHeroCard(play = () => {}, initialHero = 'fletcher') {
	let heroId = initialHero
	const playable = (id) => heroDefinition(id).playable
	const skillNames = () =>
		heroId === 'fletcher'
			? names
			: [
					'Pocket',
					...Object.values(heroDefinition(heroId).abilities).map((ability) =>
						ability ? ability.id[0].toUpperCase() + ability.id.slice(1) : 'Soon',
					),
				]
	const el = document.createElement('section')
	el.className = 'front-hero'
	el.setAttribute('aria-label', 'Character select')
	el.innerHTML = `<div class="front-roster"><h1>Choose your hero</h1><p>Choose a character, then explore their abilities.</p><div class="front-roster-cards" role="group" aria-label="Hero roster">${roster.map(([id, name, role, silhouette]) => `<${playable(id) ? 'button type="button"' : 'div'} class="front-roster-card" data-hero="${id}" ${playable(id) ? `aria-pressed="${id === heroId}"` : 'aria-disabled="true"'}><svg viewBox="0 0 44 54" aria-hidden="true"><path d="${silhouette}"/></svg><span>${name}</span><small>${role}</small><small>${playable(id) ? (id === heroId ? 'Selected' : 'Available') : 'Locked · soon'}</small></${playable(id) ? 'button' : 'div'}>`).join('')}</div></div>
		<div class="front-kit"><p class="front-hero-name">Fletcher <small>Ranged poke</small></p>${slots.map((key, i) => `<button type="button" class="front-slot" data-slot="${key}"><span class="front-key">${key}</span><span><span class="front-skill-name">${names[i]}</span><span class="front-description"></span></span></button>`).join('')}
		<section class="front-ability-detail" aria-label="Ability details" aria-live="polite"><h2></h2><p class="front-detail-status"></p><div class="front-detail-lines"></div></section>
		<p class="front-pin-help">Hover / focus to preview · Click / Enter / A to pin</p>
		<button type="button" class="front-numbers" aria-expanded="false">All numbers</button>
		<div class="front-values" hidden aria-label="Full values at level 1 and level 10"></div></div>
		<div class="front-ready"><div class="front-seats" aria-label="Practice: you and two allied bots against three enemy bots">${Array.from({ length: 6 }, (_, i) => `<span class="front-seat" aria-label="${i === 0 ? 'You, Fletcher' : i < 3 ? 'Allied Fletcher bot' : 'Enemy Fletcher bot'}">${bust}<span>${i === 0 ? 'You' : i < 3 ? 'Ally' : 'Enemy'}</span></span>`).join('')}</div>
		<button type="button" class="front-lock">Lock in</button></div>`
	let previous = ''
	let open = false
	let pinned = null
	let shown = null
	let detailText = ''
	function showDetail() {
		const index = slots.indexOf(shown)
		const hero = roster.find(([id]) => id === heroId)
		const title = index < 0 ? `Meet ${hero[1]}` : `${slots[index]} · ${skillNames()[index]}`
		const status =
			shown && shown === pinned
				? 'Pinned preview'
				: shown
					? 'Preview · confirm to pin'
					: 'Select an ability to see it in action.'
		const lines = abilityLines(heroStats(kit, tune, 1, heroId), shown, heroId)
		const next = JSON.stringify([title, status, lines])
		if (next === detailText) return
		detailText = next
		el.querySelector('.front-ability-detail h2').textContent = title
		el.querySelector('.front-detail-status').textContent = status
		el.querySelector('.front-detail-lines').replaceChildren(
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
		showDetail()
		const s = heroStats(kit, tune, 1, heroId)
		const high = heroStats(kit, tune, tune.level.cap, heroId)
		const lines =
			heroId === 'fletcher' ? kitLines(s) : slots.map((slot) => abilityLines(s, slot, heroId)[0])
		const hero = roster.find(([id]) => id === heroId)
		el.querySelector('.front-hero-name').innerHTML = `${hero[1]} <small>${hero[2]}</small>`
		el.querySelectorAll('.front-skill-name').forEach(
			(node, i) => (node.textContent = skillNames()[i]),
		)
		el.querySelectorAll('.front-roster-card[aria-pressed]').forEach((node) => {
			const selected = node.dataset.hero === heroId
			node.setAttribute('aria-pressed', String(selected))
			node.lastElementChild.textContent = selected ? 'Selected' : 'Available'
		})
		el.querySelector('.front-seat').setAttribute('aria-label', `You, ${hero[1]}`)
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
		el.querySelectorAll('.front-description').forEach((node, i) => (node.textContent = lines[i]))
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
