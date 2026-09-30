import { tune as kit } from '../tune.js'
import { tune } from './tune.js'
import { heroStats, kitLines, numberLines } from './stats.js'

const slots = ['Trait', 'Q', 'W', 'E', 'R']
const names = ['Momentum', 'Loose', 'Vault', 'Rain', 'Volley']
const bust = `<svg viewBox="0 0 40 54" aria-hidden="true"><path d="M12 19 Q8 5 20 4 Q32 5 28 19 L23 24 L30 42 L37 49 H3 L10 42 L17 24Z"/><path d="M11 15 L28 13 M17 25 L23 25 M8 49 L9 36 M30 49 L29 36" fill="none"/></svg>`

export function createHeroCard() {
	const el = document.createElement('section')
	el.className = 'front-hero'
	el.setAttribute('aria-label', 'Fletcher, choose a skill to preview')
	el.innerHTML = `<div class="front-kit"><p class="front-hero-name">Fletcher</p>${slots.map((key, i) => `<button type="button" class="front-slot" data-slot="${key}"><span class="front-key">${key}</span><span><span class="front-skill-name">${names[i]}</span><span class="front-description"></span></span></button>`).join('')}
		<button type="button" class="front-numbers" aria-expanded="false">Numbers</button>
		<div class="front-values" hidden aria-label="Full values at level 1 and level 10"></div></div>
		<div class="front-ready"><div class="front-seats" aria-label="Practice: you and two allied bots against three enemy bots">${Array.from({ length: 6 }, (_, i) => `<span class="front-seat" aria-label="${i === 0 ? 'You, Fletcher' : i < 3 ? 'Allied Fletcher bot' : 'Enemy Fletcher bot'}">${bust}<span>${i === 0 ? 'You' : i < 3 ? 'Ally' : 'Enemy'}</span></span>`).join('')}</div>
		<button type="button" class="front-lock">Lock in</button></div>`
	let previous = ''
	let open = false
	function refresh() {
		const next = JSON.stringify([
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
		const s = heroStats(kit, tune)
		const high = heroStats(kit, tune, tune.level.cap)
		const lines = kitLines(s)
		const numbers = [
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
