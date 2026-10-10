import { tune } from '../tune.js'
import { heroCard, traitCard, abilityCard, cardHtml } from '../tooltip.js'
import HERO_VIEWS from '../heroes/views.js'

// A read-only, run-owned sheet. The caller owns the clock/input hold and closing-edge consumption.
export function createNumbers(hero, onChange) {
	const root = document.createElement('section')
	root.className = 'lobby-numbers'
	root.hidden = true
	root.setAttribute('role', 'dialog')
	root.setAttribute('aria-modal', 'true')
	root.setAttribute('aria-label', 'Hero numbers')
	root.innerHTML =
		'<header><h1>Numbers</h1><button type="button" aria-label="Close numbers">×</button></header><div class="lobby-number-scroll" tabindex="0"></div><footer>Scroll · stick / ↑↓ / wheel <span></span></footer>'
	document.body.append(root)
	const scroll = root.querySelector('.lobby-number-scroll')
	const keys = new Set()
	let last = ''
	let focus = null
	const sheet = {
		open: false,
		toggle() {
			sheet.open = !sheet.open
			root.hidden = !sheet.open
			keys.clear()
			if (sheet.open) {
				focus = document.activeElement
				sheet.update(0)
				scroll.scrollTop = 0
				root.querySelector('button').focus()
			} else if (focus?.isConnected) focus.focus({ preventScroll: true })
			onChange(sheet.open)
		},
		key(event) {
			if (!sheet.open) return false
			if (event.code === 'Backquote' || event.target?.closest?.('.lil-gui')) return false
			if (['ArrowDown', 'ArrowUp'].includes(event.code)) {
				if (event.type === 'keyup') keys.delete(event.code)
				else keys.add(event.code)
			}
			if (event.type === 'keydown') {
				event.preventDefault()
				if (event.code === 'Tab')
					(document.activeElement === scroll ? root.querySelector('button') : scroll).focus()
				if (
					event.target === root.querySelector('button') &&
					['Enter', 'Space'].includes(event.code) &&
					!event.repeat
				)
					sheet.toggle()
				if (!event.repeat && ['Escape', 'KeyN'].includes(event.code)) sheet.toggle()
			}
			return true
		},
		update(dt, pad, device) {
			if (!sheet.open) return
			const cards = [
				heroCard(hero, { localTeam: hero.team, localId: hero.id, lobby: true }),
				traitCard(hero.heroId),
				...Object.entries(hero.definition.abilities)
					.filter(([, a]) => a)
					.map(([slot, ability]) =>
						abilityCard(ability, {
							level: hero.level,
							key:
								device === 'touch'
									? undefined
									: (device === 'gamepad' ? ['RB', 'RT', 'LB', 'LT'] : ['Q', 'W', 'E', 'R'])[
											Number(slot.slice(4)) - 1
										],
						}),
					),
			].filter(Boolean)
			const numbers = HERO_VIEWS[hero.heroId]?.numbers
			if (numbers) cards.push(...numbers.cards({ hero, level: hero.level }))
			const html = cards.map((card) => '<article>' + cardHtml(card) + '</article>').join('')
			if (html !== last) {
				const at = scroll.scrollTop
				scroll.innerHTML = last = html
				scroll.scrollTop = at
			}
			const axis = pad?.axes[1] ?? 0
			const stick = Math.abs(axis) > tune.lobby.inspect.deadzone ? axis : 0
			const direction = stick || Number(keys.has('ArrowDown')) - Number(keys.has('ArrowUp'))
			scroll.scrollTop += direction * tune.lobby.inspect.scrollSpeed * dt
			root.querySelector('footer').firstChild.textContent =
				device === 'touch'
					? 'Swipe · scroll '
					: device === 'gamepad'
						? 'Scroll · stick '
						: 'Scroll · ↑↓ / wheel '
			root.querySelector('footer span').textContent =
				device === 'gamepad'
					? 'B / View · close'
					: device === 'touch'
						? '× · close'
						: 'Esc / N · close'
		},
		dispose() {
			window.removeEventListener('blur', onBlur)
			root.remove()
		},
	}
	root.querySelector('button').onclick = () => sheet.toggle()
	const onBlur = () => keys.clear()
	window.addEventListener('blur', onBlur)
	return sheet
}
