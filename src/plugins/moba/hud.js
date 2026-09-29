import { tune } from './tune.js'

// Three cooldown sweeps, slot-specific denied flashes, controls and pause. Removed with the run.
const CSS = `
.moba-hud { position: fixed; bottom: 14px; left: 50%; transform: translateX(-50%); z-index: 3; display: grid;
	justify-items: center; gap: 8px; pointer-events: none; font: var(--fs-base)/1 var(--ui-font); color: var(--ui-text); }
.moba-slots { display: flex; gap: 8px; }
.moba-slot { position: relative; width: 56px; height: 56px; box-sizing: border-box; display: grid; place-items: center;
	background: var(--ui-cream); border: 3px solid var(--ui-text); border-radius: 14px; box-shadow: 3px 3px 0 var(--ui-text);
	overflow: hidden; transition: transform 0.06s; }
.moba-slot .sweep { position: absolute; inset: 0; background: conic-gradient(rgba(38, 68, 95, 0.55) var(--cd, 0turn), transparent 0); }
.moba-slot .key { position: relative; font-size: 24px; }
.moba-slot .left { position: absolute; bottom: 3px; right: 6px; font: 12px/1 system-ui, sans-serif; color: var(--ui-cream); text-shadow: 0 1px 2px #26445f, 1px 0 2px #26445f; }
.moba-slot.denied { background: var(--ui-red); transform: scale(1.08); }
.moba-slot.ready { animation: moba-ready 0.25s ease-out; }
@keyframes moba-ready { from { box-shadow: 0 0 0 8px var(--ui-gold); } }
.moba-help { font: 12px/1.4 system-ui, sans-serif; color: var(--ui-text); opacity: 0.75; white-space: nowrap; }
.moba-paused { position: fixed; inset: 0; display: grid; place-items: center; z-index: 10; pointer-events: none;
	font: 48px/1 var(--ui-font); color: var(--ui-text); -webkit-text-stroke: 6px var(--ui-cream); paint-order: stroke fill;
	background: rgba(143, 215, 255, 0.35); }
.moba-paused[hidden] { display: none; }
`
const HELP = {
	keyboard:
		'RMB move / attack · Q loose · W vault · E rain · S stop · arrows pan · hold Space follow · Esc pause',
	gamepad:
		'L stick move · hold RB / RT / LB to aim Q / W / E, release to fire · A attack · B cancel',
}

export function createHud() {
	const style = document.createElement('style')
	style.textContent = CSS
	const root = document.createElement('div')
	root.className = 'moba-hud'
	root.innerHTML = `<div class="moba-health" role="status"></div><div class="moba-slots">${['Q', 'W', 'E'].map((key) => `<div class="moba-slot"><div class="sweep"></div><span class="key">${key}</span><span class="left"></span></div>`).join('')}</div><div class="moba-help"></div>`
	const paused = document.createElement('div')
	paused.className = 'moba-paused'
	paused.textContent = 'PAUSED'
	paused.hidden = true
	document.head.append(style)
	document.body.append(root, paused)
	const slots = [...root.querySelectorAll('.moba-slot')].map((slot) => ({
		slot,
		key: slot.querySelector('.key'),
		left: slot.querySelector('.left'),
		deniedFor: 0,
		shown: { fraction: -1, seconds: '' },
	}))
	const help = root.querySelector('.moba-help')
	const health = root.querySelector('.moba-health')
	let shownDevice = ''
	let shownHealth = ''

	return {
		// A press on cooldown outside the buffer: the icon flashes for 60 ms.
		deny(action) {
			const s = slots[['slot1', 'slot2', 'slot3'].indexOf(action)]
			if (!s) return
			s.deniedFor = 0.06
			s.slot.classList.add('denied')
		},
		update(dt, { cooldowns, totals, device, pausedNow, hp, maxHp, respawn }) {
			const text =
				respawn !== null
					? `Respawn in ${Math.ceil(respawn)} s`
					: `${Math.ceil(hp)} / ${maxHp} HP · Momentum: Q hits cut Vault by ${tune.momentum.reduction} s`
			if (text !== shownHealth) health.textContent = shownHealth = text
			for (const [i, s] of slots.entries()) {
				const { slot, left, shown } = s
				const cooldown = cooldowns[i]
				const total = totals[i]
				if (s.deniedFor > 0 && (s.deniedFor -= dt) <= 0) slot.classList.remove('denied')
				const fraction = total > 0 ? Math.max(0, cooldown / total) : 0
				if (fraction !== shown.fraction) {
					if (fraction === 0 && shown.fraction > 0) {
						slot.classList.remove('ready')
						void slot.offsetWidth // restart the animation
						slot.classList.add('ready')
					}
					slot.style.setProperty('--cd', `${fraction}turn`)
					shown.fraction = fraction
				}
				const seconds =
					cooldown > 0 ? (cooldown > 1 ? Math.ceil(cooldown) : cooldown.toFixed(1)) : ''
				if (seconds !== shown.seconds) left.textContent = shown.seconds = String(seconds)
			}
			if (device !== shownDevice) {
				shownDevice = device
				for (const [i, s] of slots.entries())
					s.key.textContent = (device === 'gamepad' ? ['RB', 'RT', 'LB'] : ['Q', 'W', 'E'])[i]
				help.textContent = HELP[device] ?? HELP.keyboard
			}
			paused.hidden = !pausedNow
		},
		dispose() {
			style.remove()
			root.remove()
			paused.remove()
		},
	}
}
