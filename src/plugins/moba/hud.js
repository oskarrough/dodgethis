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
.moba-score { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); padding: 8px 14px; background: var(--ui-cream); border: 3px solid var(--ui-text); border-radius: 12px; z-index: 4; white-space: nowrap; font: var(--fs-base)/1 var(--ui-font); }
.moba-banner { position: fixed; top: 28%; left: 50%; transform: translateX(-50%); text-align: center; padding: 12px; background: var(--ui-cream); border: 3px solid var(--ui-text); border-radius: 12px; z-index: 5; font: var(--fs-base)/1.4 var(--ui-font); }
.moba-banner[hidden] { display: none; }
@media (max-width: 600px) { .moba-help { white-space: normal !important; text-align: center; max-width: 94vw; } .moba-health { font-size: 12px; text-align: center; width: 94vw; } .moba-score { font-size: 13px; } }
.moba-help { font: 12px/1.4 system-ui, sans-serif; color: var(--ui-text); opacity: 0.75; width: min(94vw, 700px); text-align: center; white-space: normal; }
`
const HELP = {
	keyboard:
		'RMB move / attack · Q loose · W vault · E rain · S stop · arrows pan · hold Space follow · Esc pause',
	gamepad:
		'L stick move · hold RB / RT / LB to aim Q / W / E, release to fire · A attack · B cancel · Start pause',
}

export function createHud() {
	const style = document.createElement('style')
	style.textContent = CSS
	const root = document.createElement('div')
	root.className = 'moba-hud'
	root.innerHTML = `<div class="moba-health" role="status"></div><div class="moba-slots">${['Q', 'W', 'E'].map((key) => `<div class="moba-slot"><div class="sweep"></div><span class="key">${key}</span><span class="left"></span></div>`).join('')}</div><div class="moba-help"></div>`
	const score = document.createElement('div')
	score.className = 'moba-score'
	const banner = document.createElement('div')
	banner.className = 'moba-banner'
	banner.hidden = true
	let bannerLeft = 0
	let shownScore = ''
	document.head.append(style)
	document.body.append(root, score, banner)
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
	let shownHelp = ''
	let shownHealth = ''

	return {
		banner(text, seconds = tune.hud.bannerLife) {
			banner.textContent = text
			banner.hidden = false
			bannerLeft = seconds
		},
		// A press on cooldown outside the buffer: the icon flashes for 60 ms.
		deny(action) {
			const s = slots[['slot1', 'slot2', 'slot3'].indexOf(action)]
			if (!s) return
			s.deniedFor = 0.06
			s.slot.classList.add('denied')
		},
		update(
			dt,
			{
				cooldowns,
				totals,
				device,
				hp,
				maxHp,
				respawn,
				elapsed,
				teams,
				nextWave,
				nextBall,
				ballPop,
				carryingBall,
				localTeam = 'A',
			},
		) {
			if (teams) {
				const seconds = Math.floor(elapsed)
				const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
				const enemyTeam = localTeam === 'A' ? 'B' : 'A'
				const status = `Your team level ${teams[localTeam].level} · ${clock} · Enemy level ${teams[enemyTeam].level} · wave ${Math.max(0, Math.ceil(nextWave))}s${ballPop != null ? ` · Ball pops in ${Math.ceil(ballPop)}s` : nextBall === undefined ? '' : ` · Ball ${Math.max(0, Math.ceil(nextBall))}s`}`
				if (status !== shownScore) score.textContent = shownScore = status
			}
			if (bannerLeft > 0 && (bannerLeft -= dt) <= 0) banner.hidden = true
			const text =
				respawn !== null
					? `Respawn in ${Math.ceil(respawn)} s`
					: `${Math.ceil(hp)} / ${Math.round(maxHp)} HP · Momentum: Q hits cut Vault by ${tune.momentum.reduction} s`
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
			}
			const controls = carryingBall
				? `Ball: ${tune.ball.range} m throw · ${tune.ball.silence} s silence · ${device === 'gamepad' ? 'A or release RB / RT / LB to throw' : 'Q/W/E or click to throw'} toward aim · ${tune.ball.carrySpeed * 100}% speed`
				: `${HELP[device] ?? HELP.keyboard} · Ball: stand still ${tune.ball.channel} s to pick up · ${tune.ball.range} m throw`
			if (controls !== shownHelp) help.textContent = shownHelp = controls
		},
		dispose() {
			style.remove()
			root.remove()
			score.remove()
			banner.remove()
		},
	}
}
