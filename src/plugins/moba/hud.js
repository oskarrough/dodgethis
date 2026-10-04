import * as THREE from 'three'
import './hud.css'
import { heroDefinition } from './heroes.js'
import { tune } from './tune.js'
import {
	abilityCard,
	ballCard,
	clock,
	clockCard,
	abilityName,
	createTooltip,
	heroCard,
	heroTrait,
	killsCard,
	traitCard,
	levelCard,
	levelProgress,
	minionCard,
	structureCard,
	waveCard,
} from './tooltip.js'

// The match HUD: a top bar (levels, takedowns, the lane's structures, clock, wave and Ball rings),
// the portrait with HP and XP, three ability slots, and tooltips on all of it plus world units.
// Every DOM write goes through `put`, which skips unchanged values. Removed with the run.

const SLOTS = ['slot1', 'slot2', 'slot3']
const KEYS = { keyboard: ['Q', 'W', 'E'], gamepad: ['RB', 'RT', 'LB'] }
// Controls line from the hero's own kit, for the active device.
function helpText(device, abilities) {
	const names = SLOTS.map((slot) => abilityName(abilities?.[slot]).toLowerCase())
	return device === 'gamepad'
		? `L stick move · hold RB / RT / LB to aim ${names.join(' / ')}, release to fire · A attack · B cancel · hold Y inspect · Start pause`
		: `RMB move / attack · ${KEYS.keyboard.map((key, i) => `${key} ${names[i]}`).join(' · ')} · S stop · arrows pan · hold Space follow · hover for details · Esc pause`
}
const PAD_INSPECT = 3
const PAD_LEFT = 14
const PAD_RIGHT = 15

const rosette = (() => {
	const bumps = 14,
		r = 21,
		bump = 3.2
	let d = ''
	for (let i = 0; i <= bumps; i++) {
		const a = (i / bumps) * Math.PI * 2
		const x = 24 + Math.cos(a) * r,
			y = 24 + Math.sin(a) * r
		d += i
			? ` A ${bump} ${bump} 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`
			: `M ${x.toFixed(2)} ${y.toFixed(2)}`
	}
	return `<svg viewBox="0 0 48 48" aria-hidden="true"><path class="tone" d="${d} Z"/></svg>`
})()
const svg = (body) => `<svg viewBox="0 0 48 48" aria-hidden="true">${body}</svg>`
export const ICONS = {
	loose: svg(
		'<path class="ink-line" d="M10 38 L36 12"/><path class="gold" d="M30 9 L40 8 L39 18 Z"/><path class="tone" d="M9 33 L15 39 L11 43 L5 37 Z"/>',
	),
	vault: svg(
		'<path class="tone" d="M8 30 L20 18 L20 25 L34 25 L34 35 L20 35 L20 42 Z" transform="rotate(-20 24 30)"/><path class="ink-line" d="M30 12 L38 8 M33 18 L42 15"/>',
	),
	rain: svg(
		'<ellipse class="cream" cx="24" cy="37" rx="17" ry="7"/><path class="ink-line" d="M14 8 L16 32 M24 5 L24 33 M34 8 L32 32"/><path class="gold" d="M12 28 L20 28 L16 36 Z M20 29 L28 29 L24 37 Z M28 28 L36 28 L32 36 Z"/>',
	),
	ball: svg(
		'<circle class="gold" cx="24" cy="24" r="15"/><path class="ink-line" d="M10 20 Q24 28 38 20 M18 10 Q26 24 18 38"/>',
	),
	wave: svg(
		'<path class="ink-line" d="M14 40 L14 8"/><path class="tone" d="M15 9 L36 14 L15 21 Z"/><circle class="cream" cx="28" cy="34" r="6"/><circle class="cream" cx="38" cy="36" r="5"/>',
	),
	tower: svg(
		'<path class="stone" d="M16 44 L18 22 L30 22 L32 44 Z"/><path class="tone" d="M14 22 L24 6 L34 22 Z"/>',
	),
	fort: svg(
		'<path class="stone" d="M9 44 L9 18 L14 18 L14 23 L19 23 L19 18 L24 18 L24 23 L29 23 L29 18 L34 18 L34 23 L39 23 L39 18 L39 44 Z"/><path class="ink-line" d="M24 18 L24 5"/><path class="tone" d="M25 5 L36 9 L25 13 Z"/>',
	),
	core: svg(
		'<path class="stone" d="M10 44 L13 36 L35 36 L38 44 Z"/><path class="tone" d="M24 3 L36 19 L24 35 L12 19 Z"/><path class="ink-line" d="M12 19 L36 19 M24 3 L24 35"/>',
	),
	fletcher: svg(
		'<path class="ink-line" d="M30 30 L40 6 M33 31 L44 10 M27 29 L34 4"/><circle class="tone" cx="22" cy="28" r="15"/><circle class="cream" cx="17" cy="24" r="4"/>',
	),
	momentum: svg('<path class="gold" d="M8 30 L22 6 L20 22 L40 18 L24 42 L26 28 Z"/>'),
	toss: svg(
		'<path class="tone" d="M6 34 Q6 22 16 22 L24 22 Q28 22 28 27 Q28 31 24 31 L18 31 L18 36 Q18 42 12 42 Q6 42 6 34 Z"/><circle class="gold" cx="35" cy="14" r="7"/><path class="ink-line" d="M27 22 L31 19"/>',
	),
	catch: svg(
		'<path class="cream" d="M24 40 L8 14 A26 26 0 0 1 40 14 Z"/><path class="tone" d="M14 40 Q10 30 16 26 L22 30 L22 18 Q22 14 25 14 Q28 14 28 18 L28 28 L34 24 Q38 28 34 40 Z"/>',
	),
	dive: svg(
		'<rect class="tone" x="12" y="20" width="22" height="15" rx="5" transform="rotate(-18 23 27)"/><path class="tone" d="M34 14 L44 10 L40 20 Z"/><path class="ink-line" d="M4 38 L14 38 M6 44 L20 44"/>',
	),
	pocket: svg(
		'<path class="cream" d="M10 14 L38 14 L36 38 Q24 44 12 38 Z"/><circle class="gold" cx="24" cy="24" r="6"/>',
	),
	mitts: svg(
		'<rect class="tone" x="9" y="13" width="30" height="27" rx="8"/><path class="cream" d="M30 9 Q34 6 37 9 L38 18 L31 19 Z M37 22 Q42 20 44 24 L40 31 L36 28 Z"/><circle class="cream" cx="18" cy="24" r="4"/>',
	),
	carom: svg('<path class="tone" d="M24 8 L42 40 L6 40 Z"/>'),
	skip: svg('<rect class="tone" x="8" y="18" width="32" height="14" rx="5"/>'),
	empty: svg('<path class="ink-line" d="M16 24 L32 24" opacity="0.4"/>'),
}

function el(tag, className, parent, html) {
	const node = document.createElement(tag)
	if (className) node.className = className
	if (html) node.innerHTML = html
	parent?.append(node)
	return node
}

// Countdown ring fraction for a timer that resets to `total`, quantised so the ring only rewrites when it moves.
const ring = (left, total) =>
	total > 0 ? Math.round(Math.max(0, Math.min(1, left / total)) * 200) / 200 : 0

// Seconds until a live Ball pops: at its own pop time, or sooner if the next spawn replaces it. Null while none is live.
export const ballPopIn = (ball, tick, blend, step) =>
	ball.state && ball.state.state !== 'warning'
		? Math.max(0, Math.min(ball.state.popAt, ball.nextBall) - tick - blend) * step
		: null

// The HUD's view of a running match for the local hero, `blend` ticks past the last step.
export function matchFrame(sim, hero, blend, step) {
	const until = (tick) => (tick - sim.tick - blend) * step
	return {
		hero,
		sim,
		step,
		cooldowns: hero.cd.slice(0, 3).map((cd) => Math.max(0, cd - blend) * step),
		elapsed: sim.tick * step,
		teams: sim.lane.teams,
		carryingBall: sim.ball.carrying(hero),
		ballPop: ballPopIn(sim.ball, sim.tick, blend, step),
		nextBall: until(sim.ball.nextBall),
		nextWave: until(sim.lane.nextWave),
		localTeam: hero.team,
		hp: hero.hp,
		maxHp: hero.maxHp,
		respawn: hero.dead ? Math.max(0, until(hero.respawnTick)) : null,
	}
}

export function createHud() {
	// Unchanged values never touch the DOM. Keyed per node, then per field.
	const shown = new WeakMap()
	function put(node, field, value, write) {
		let fields = shown.get(node)
		if (!fields) shown.set(node, (fields = new Map()))
		if (fields.get(field) === value) return
		fields.set(field, value)
		write(value)
	}
	const text = (node, value) => put(node, 'text', value, (v) => (node.textContent = v))
	const prop = (node, name, value) => put(node, name, value, (v) => node.style.setProperty(name, v))
	const flag = (node, name, on) =>
		put(node, `.${name}`, on, (v) => (v ? node.classList.add(name) : node.classList.remove(name)))
	const data = (node, name, value) => put(node, `@${name}`, value, (v) => (node.dataset[name] = v))

	// Hover, long-press and focus targets. The card itself takes no pointer events.
	let hover = null
	let press = null
	const hot = (node, source) => {
		node.classList.add('hot')
		node.setAttribute('aria-describedby', 'moba-tip')
		const anchor = () => {
			const r = node.getBoundingClientRect?.()
			return r ? { x: r.left + r.width / 2, y: r.top } : { x: 0, y: 0 }
		}
		node.addEventListener('pointerenter', (e) => {
			if (e.pointerType === 'mouse') hover = { source, anchor: anchor() }
		})
		node.addEventListener('pointerleave', () => {
			if (hover?.source === source) hover = null
		})
		node.addEventListener('pointerdown', (e) => {
			if (e.button === 0) e.preventDefault?.() // keep focus on the game, never on a HUD button
			if (e.pointerType !== 'mouse') press = { source, anchor: anchor(), held: 0 }
		})
		for (const type of ['pointerup', 'pointercancel'])
			node.addEventListener(type, () => {
				if (press?.source === source) press = null
			})
		node.addEventListener('contextmenu', (e) => e.preventDefault?.())
		return node
	}

	// --- Top bar: [structures][takedowns][LEVEL] clock [LEVEL][takedowns][structures] ---
	const top = el('div', 'moba-score moba-top')
	top.setAttribute('role', 'group')
	top.setAttribute('aria-label', 'Match status')
	const summary = el('span', 'moba-sr', top)
	const sides = {}
	const side = (which) => {
		const node = el('div', `moba-side ${which}`, top)
		const forts = el('div', 'moba-forts', node)
		const structures = {}
		for (const kind of ['core', 'fort', 'tower']) {
			const icon = hot(el('div', 'moba-fort', forts, ICONS[kind]), {
				kind: 'structure',
				which,
				structure: kind,
			})
			icon.dataset.kind = kind
			structures[kind] = { icon, bar: el('i', '', icon) }
		}
		const kills = hot(el('div', 'moba-kills', node), { kind: 'kills', which })
		const killCount = el('b', '', kills)
		el('small', '', kills).textContent = 'kills'
		const level = hot(el('div', 'moba-level', node, rosette), { kind: 'level', which })
		const xp = el('i', 'moba-ring', level)
		const levelNumber = el('b', '', level)
		level.setAttribute('aria-label', which === 'mine' ? 'Your team level' : 'Enemy team level')
		sides[which] = { node, structures, killCount, level, xp, levelNumber }
	}
	side('mine')
	const clockNode = hot(el('div', 'moba-clock', top), { kind: 'clock' })
	const clockText = el('b', '', clockNode)
	const timers = el('div', 'moba-timers', clockNode)
	const timer = (kind) => {
		const node = hot(el('div', `moba-timer ${kind}`, timers), { kind })
		const face = el('i', 'moba-ring', node, ICONS[kind])
		const seconds = el('b', '', node)
		return { node, face, seconds }
	}
	const wave = timer('wave')
	const ball = timer('ball')
	side('theirs')

	// --- Bottom: portrait, slots, help ---
	const root = el('div', 'moba-hud')
	const bar = el('div', 'moba-bar', root)
	const portrait = hot(el('div', 'moba-portrait', bar), { kind: 'portrait' })
	const avatar = el('div', 'moba-avatar', portrait)
	const face = el('span', '', avatar)
	const heroLevel = el('b', 'moba-lv', avatar)
	const respawnNode = el('b', 'moba-respawn', avatar)
	const vitals = el('div', 'moba-vitals', portrait)
	const nameRow = el('div', 'moba-name', vitals)
	const heroName = el('span', '', nameRow)
	const trait = hot(el('span', 'moba-trait', nameRow), { kind: 'trait' })
	const traitIcon = el('span', '', trait)
	const traitText = el('span', '', trait)
	const health = el('div', 'moba-health moba-meter', vitals)
	health.setAttribute('role', 'status')
	const healthText = el('span', '', health)
	const xpBar = el('div', 'moba-xp moba-meter', vitals)
	const xpText = el('span', '', xpBar)
	const slotRow = el('div', 'moba-slots', bar)
	const slots = SLOTS.map((action, index) => {
		const slot = hot(el('button', 'moba-slot', slotRow), { kind: 'slot', index })
		slot.type = 'button'
		slot.tabIndex = -1
		const icon = el('span', 'icon', slot)
		el('span', 'sweep', slot)
		const key = el('span', 'key', slot)
		const left = el('span', 'left', slot)
		return { action, slot, icon, key, left, deniedFor: 0, fraction: -1 }
	})
	const help = el('div', 'moba-help', root)
	const banner = el('div', 'moba-banner')
	banner.hidden = true
	document.body.append(top, root, banner)
	const tip = createTooltip(document.body)
	let bannerLeft = 0

	const pointer = { x: 0, y: 0 }
	const onMove = (e) => {
		pointer.x = e.clientX
		pointer.y = e.clientY
	}
	globalThis.window?.addEventListener('pointermove', onMove, { passive: true })

	// Takedowns from death edges: a hero alive last frame and dead now was downed by the other team.
	const kills = { A: 0, B: 0 }
	const wasDead = new Map()
	// Pad inspect: hold Y, d-pad steps through the aimed unit and the three slots.
	let inspectHeld = 0
	let inspectIndex = 0
	let previousPad = []
	let world = null
	const projected = new THREE.Vector3()

	function pickUnit(sim, aim) {
		let best = null
		let bestGap = Infinity
		const units = [...sim.heroes, ...(sim.lane?.minions ?? []), ...(sim.lane?.structures ?? [])]
		for (const unit of units) {
			if (unit.dead) continue
			const p = unit.body.mesh?.position ?? unit.body.position
			const gap = Math.hypot(p.x - aim.x, p.z - aim.z) - (unit.body.radius ?? 0.5)
			// Ties fall to the unit whose id sorts first, never to list order.
			if (gap > tune.orders.pick) continue
			if (gap < bestGap || (gap === bestGap && String(unit.id) < String(best.id))) {
				best = unit
				bestGap = gap
			}
		}
		return best
	}

	function screenOf(unit, camera) {
		const p = unit.body.mesh?.position ?? unit.body.position
		projected.set(p.x, p.y ?? 0, p.z).project(camera)
		const w = globalThis.innerWidth ?? 1024
		const h = globalThis.innerHeight ?? 768
		return {
			x: Math.max(0, Math.min(w, ((projected.x + 1) / 2) * w)),
			y: Math.max(0, Math.min(h, ((1 - projected.y) / 2) * h - 24)),
		}
	}

	function cardFor(source, frame) {
		const { hero, sim, teams, localTeam, elapsed, nextWave, nextBall, ballPop, carryingBall } =
			frame
		const enemy = localTeam === 'A' ? 'B' : 'A'
		const team = (which) => (which === 'mine' ? localTeam : enemy)
		switch (source.kind) {
			case 'slot': {
				const ability = frame.definition.abilities[SLOTS[source.index]]
				return abilityCard(ability, {
					level: hero?.level ?? 1,
					key: (KEYS[frame.device] ?? KEYS.keyboard)[source.index],
				})
			}
			case 'portrait':
				return hero ? heroCard(hero, { localTeam, localId: hero.id }) : null
			case 'trait':
				return traitCard(frame.heroId)
			case 'level':
				return teams
					? levelCard(teams[team(source.which)], {
							mine: source.which === 'mine',
							tone: team(source.which),
						})
					: null
			case 'kills':
				return killsCard(kills[team(source.which)], { mine: source.which === 'mine' })
			case 'structure': {
				const unit = sim?.lane?.structures.find(
					(s) => s.team === team(source.which) && s.kind === source.structure,
				)
				if (!unit) return null
				if (unit.dead)
					return {
						title: `${source.which === 'mine' ? 'Your' : 'Enemy'} ${unit.kind}`,
						tone: unit.team,
						summary: 'Destroyed.',
						rows: [],
						notes: [],
					}
				return structureCard(unit, {
					localTeam,
					vulnerable: sim.lane.vulnerable(unit),
					tick: sim.tick,
					step: frame.step,
				})
			}
			case 'clock':
				return clockCard({ elapsed })
			case 'wave':
				return waveCard({ nextWave, elapsed })
			case 'ball':
				return ballCard({ nextBall, ballPop, carrying: carryingBall })
			case 'unit': {
				const unit = source.unit
				if (!unit || unit.dead) return null
				if (unit.structure)
					return structureCard(unit, {
						localTeam,
						vulnerable: sim.lane.vulnerable(unit),
						tick: sim.tick,
						step: frame.step,
					})
				if (unit.kind) return minionCard(unit, { localTeam })
				return heroCard(unit, { localTeam, localId: hero?.id })
			}
		}
		return null
	}

	function updateTip(dt, frame) {
		const { sim, aim, camera, pad, device } = frame
		// Pad: Y held past the threshold opens the aimed unit (your hero at rest); d-pad steps on.
		const buttons = pad?.buttons ?? []
		const edge = (i) => buttons[i] && !previousPad[i]
		if (buttons[PAD_INSPECT]) inspectHeld += dt
		else inspectHeld = inspectIndex = 0
		const inspecting = inspectHeld >= tune.hud.inspectHold
		if (inspecting && edge(PAD_RIGHT)) inspectIndex = (inspectIndex + 1) % 4
		if (inspecting && edge(PAD_LEFT)) inspectIndex = (inspectIndex + 3) % 4
		previousPad = buttons.slice()
		if (press) press.held += dt

		let source = null
		let anchor = null
		if (inspecting) {
			if (inspectIndex === 0 && sim) {
				const unit = (aim && pickUnit(sim, aim)) ?? frame.hero
				if (unit && !unit.dead) {
					source = { kind: 'unit', unit }
					anchor = camera ? screenOf(unit, camera) : { x: 0, y: 0 }
				}
			} else if (inspectIndex > 0) {
				const s = slots[inspectIndex - 1]
				const r = s.slot.getBoundingClientRect?.()
				source = { kind: 'slot', index: inspectIndex - 1 }
				anchor = r ? { x: r.left + r.width / 2, y: r.top } : { x: 0, y: 0 }
			}
		} else if (press && press.held >= tune.hud.longPress) ({ source, anchor } = press)
		else if (hover) ({ source, anchor } = hover)
		else if (sim && aim && device !== 'gamepad') {
			const unit = pickUnit(sim, aim)
			if (unit !== world?.unit) world = unit ? { unit, dwell: 0 } : null
			else if (world) world.dwell += dt
			if (world && world.dwell >= tune.hud.hoverDelay) {
				source = { kind: 'unit', unit: world.unit }
				anchor = { x: pointer.x, y: pointer.y - 16 }
			}
		} else world = null
		const card = source && cardFor(source, frame)
		if (card) tip.show(card, anchor)
		else tip.hide()
	}

	return {
		banner(message, seconds = tune.hud.bannerLife) {
			banner.textContent = message
			banner.hidden = false
			bannerLeft = seconds
		},
		// A press on cooldown outside the buffer: the icon flashes for 60 ms.
		deny(action) {
			const s = slots[SLOTS.indexOf(action)]
			if (!s) return
			s.deniedFor = 0.06
			s.slot.classList.add('denied')
		},
		get tooltip() {
			return tip
		},
		get kills() {
			return { ...kills }
		},
		update(dt, frame) {
			const {
				cooldowns,
				device = 'keyboard',
				hp,
				maxHp,
				respawn,
				elapsed = 0,
				teams,
				nextWave,
				nextBall,
				ballPop,
				carryingBall,
				localTeam = 'A',
				hero,
				sim,
			} = frame
			const enemy = localTeam === 'A' ? 'B' : 'A'
			if (sim)
				for (const h of sim.heroes) {
					if (h.dead && wasDead.get(h.id) === false) kills[h.team === 'A' ? 'B' : 'A']++
					wasDead.set(h.id, !!h.dead)
				}

			// Top bar.
			if (teams) {
				for (const [which, team] of [
					['mine', localTeam],
					['theirs', enemy],
				]) {
					const s = sides[which]
					const progress = levelProgress(teams[team].xp)
					data(s.node, 'team', team)
					text(s.levelNumber, String(teams[team].level))
					prop(s.xp, '--f', String(progress.need ? ring(progress.into, progress.need) : 1))
					text(s.killCount, String(kills[team]))
					for (const kind of ['tower', 'fort', 'core']) {
						const unit = sim?.lane?.structures.find((u) => u.team === team && u.kind === kind)
						if (!unit) continue
						const { icon, bar: hpBar } = s.structures[kind]
						flag(icon, 'down', !!unit.dead)
						flag(icon, 'shielded', !unit.dead && !sim.lane.vulnerable(unit))
						prop(hpBar, '--f', String(unit.dead ? 0 : ring(unit.hp, unit.maxHp)))
					}
				}
				text(clockText, clock(elapsed))
				const late = elapsed >= tune.match.late
				const waveLeft = Math.max(0, nextWave ?? 0)
				const waveTotal =
					elapsed < tune.waves.first
						? tune.waves.first
						: late
							? tune.waves.lateInterval
							: tune.waves.interval
				text(wave.seconds, `${Math.ceil(waveLeft)}`)
				prop(wave.face, '--f', String(ring(waveLeft, waveTotal)))
				flag(wave.node, 'warn', waveLeft <= tune.hud.warn)
				const ballState = carryingBall
					? 'carried'
					: ballPop != null
						? 'live'
						: nextBall === undefined
							? 'off'
							: 'next'
				data(ball.node, 'state', ballState)
				const ballLeft = ballPop ?? Math.max(0, nextBall ?? 0)
				const ballTotal =
					ballPop != null
						? tune.ball.life
						: elapsed < tune.ball.first
							? tune.ball.first
							: late
								? tune.ball.lateInterval
								: tune.ball.interval
				text(
					ball.seconds,
					carryingBall ? 'yours' : ballState === 'off' ? '' : `${Math.ceil(ballLeft)}`,
				)
				prop(ball.face, '--f', String(carryingBall ? 1 : ring(ballLeft, ballTotal)))
				flag(
					ball.node,
					'warn',
					ballState === 'live' || (ballState === 'next' && ballLeft <= tune.hud.warn),
				)
				// One plain sentence for screen readers and scripts; only rewritten when a whole second ticks.
				text(
					summary,
					`Your team level ${teams[localTeam].level}, ${kills[localTeam]} kills · ${clock(elapsed)} · Enemy level ${teams[enemy].level}, ${kills[enemy]} kills · wave ${Math.ceil(waveLeft)}s${ballPop != null ? ` · Ball pops in ${Math.ceil(ballPop)}s` : nextBall === undefined ? '' : ` · Ball ${Math.ceil(ballLeft)}s`}`,
				)
			}
			if (bannerLeft > 0 && (bannerLeft -= dt) <= 0) banner.hidden = true

			// Portrait.
			const level = hero?.level ?? teams?.[localTeam].level ?? 1
			data(root, 'team', localTeam)
			data(top, 'local', localTeam)
			const definition = hero?.definition ?? heroDefinition()
			const heroId = hero?.heroId ?? definition.id
			text(
				heroName,
				heroId.replace(/^./, (c) => c.toUpperCase()),
			)
			put(face, 'icon', heroId, (id) => (face.innerHTML = ICONS[id] ?? ICONS.empty))
			text(heroLevel, String(level))
			const heroicTrait = heroTrait(heroId)
			flag(trait, 'none', !heroicTrait)
			put(
				traitIcon,
				'icon',
				heroicTrait?.icon ?? '',
				(id) => (traitIcon.innerHTML = ICONS[id] ?? ''),
			)
			text(traitText, heroicTrait?.chip ?? '')
			flag(portrait, 'dead', respawn != null)
			text(respawnNode, respawn != null ? String(Math.ceil(respawn)) : '')
			prop(health, '--f', String(respawn != null ? 0 : ring(hp, maxHp)))
			prop(health, '--tick', `${((tune.hud.hpTick / Math.max(1, maxHp)) * 100).toFixed(3)}%`)
			text(
				healthText,
				respawn != null
					? `Respawn in ${Math.ceil(respawn)} s`
					: `${Math.min(Math.ceil(hp), Math.round(maxHp))} / ${Math.round(maxHp)}`,
			)
			if (teams) {
				const progress = levelProgress(teams[localTeam].xp)
				prop(xpBar, '--f', String(progress.need ? ring(progress.into, progress.need) : 1))
				text(
					xpText,
					progress.need
						? `Lv ${teams[localTeam].level} · ${Math.round(progress.into)} / ${Math.round(progress.need)} XP`
						: `Lv ${teams[localTeam].level} · max`,
				)
			}

			// Slots.
			const keys = KEYS[device] ?? KEYS.keyboard
			for (const [i, s] of slots.entries()) {
				const ability = definition.abilities[s.action]
				const total = ability?.stats.cooldown ?? 0
				const cooldown = cooldowns?.[i] ?? 0
				if (s.deniedFor > 0 && (s.deniedFor -= dt) <= 0) s.slot.classList.remove('denied')
				put(s.icon, 'icon', ability?.id ?? 'empty', (id) => (s.icon.innerHTML = ICONS[id] ?? ''))
				text(s.key, keys[i])
				flag(s.slot, 'ball', !!carryingBall)
				const fraction = total > 0 ? ring(cooldown, total) : 0
				if (fraction !== s.fraction) {
					if (fraction === 0 && s.fraction > 0) {
						s.slot.classList.remove('ready')
						void s.slot.offsetWidth // restart the animation
						s.slot.classList.add('ready')
					}
					s.fraction = fraction
				}
				prop(s.slot, '--cd', `${fraction}turn`)
				flag(s.slot, 'cooling', cooldown > 0)
				text(
					s.left,
					cooldown > 0 ? (cooldown > 1 ? String(Math.ceil(cooldown)) : cooldown.toFixed(1)) : '',
				)
			}
			const controls = carryingBall
				? `Ball: ${tune.ball.range} m throw · ${tune.ball.silence} s silence · ${device === 'gamepad' ? 'A or release RB / RT / LB to throw' : 'Q/W/E or click to throw'} toward aim · ${tune.ball.carrySpeed * 100}% speed`
				: `${helpText(device, definition.abilities)} · Ball: stand still ${tune.ball.channel} s to pick up · ${tune.ball.range} m throw`
			text(help, controls)

			updateTip(dt, {
				...frame,
				device,
				localTeam,
				level,
				definition,
				heroId,
				step: frame.step ?? 1 / 60,
			})
		},
		dispose() {
			globalThis.window?.removeEventListener('pointermove', onMove)
			top.remove()
			root.remove()
			banner.remove()
			tip.dispose()
		},
	}
}
