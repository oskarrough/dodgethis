// Moba's HTML chrome: Q's cooldown sweep and its denied flash, a controls line, and the pause card. Removed with the run.
const CSS = `
.moba-hud { position: fixed; bottom: 14px; left: 50%; transform: translateX(-50%); z-index: 3; display: grid;
	justify-items: center; gap: 8px; pointer-events: none; font: var(--fs-base)/1 var(--ui-font); color: var(--ui-text); }
.moba-slot { position: relative; width: 56px; height: 56px; box-sizing: border-box; display: grid; place-items: center;
	background: var(--ui-cream); border: 3px solid var(--ui-text); border-radius: 14px; box-shadow: 3px 3px 0 var(--ui-text);
	overflow: hidden; transition: transform 0.06s; }
.moba-slot .sweep { position: absolute; inset: 0; background: conic-gradient(rgba(38, 68, 95, 0.55) var(--cd, 0turn), transparent 0); }
.moba-slot .key { position: relative; font-size: 24px; }
.moba-slot .left { position: absolute; bottom: 3px; right: 6px; font: 12px/1 system-ui, sans-serif; color: var(--ui-cream); }
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
	keyboard: 'RMB move / attack · Q loose · S stop · Space centre · Esc pause',
	gamepad: 'L stick move · hold RB aim Q, release to loose · B cancel · A attack',
}

export function createHud() {
	const style = document.createElement('style')
	style.textContent = CSS
	const root = document.createElement('div')
	root.className = 'moba-hud'
	root.innerHTML = `<div class="moba-slot"><div class="sweep"></div><span class="key">Q</span><span class="left"></span></div><div class="moba-help"></div>`
	const paused = document.createElement('div')
	paused.className = 'moba-paused'
	paused.textContent = 'PAUSED'
	paused.hidden = true
	document.head.append(style)
	document.body.append(root, paused)
	const slot = root.querySelector('.moba-slot')
	const key = root.querySelector('.key')
	const left = root.querySelector('.left')
	const help = root.querySelector('.moba-help')
	let deniedFor = 0
	let shown = { fraction: -1, seconds: '', device: '' }

	return {
		// A press on cooldown outside the buffer: the icon flashes for 60 ms.
		deny() {
			deniedFor = 0.06
			slot.classList.add('denied')
		},
		update(dt, { cooldown, total, device, pausedNow }) {
			if (deniedFor > 0 && (deniedFor -= dt) <= 0) slot.classList.remove('denied')
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
			const seconds = cooldown > 0 ? (cooldown > 1 ? Math.ceil(cooldown) : cooldown.toFixed(1)) : ''
			if (seconds !== shown.seconds) left.textContent = shown.seconds = String(seconds)
			if (device !== shown.device) {
				shown.device = device
				key.textContent = device === 'gamepad' ? 'RB' : 'Q'
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
