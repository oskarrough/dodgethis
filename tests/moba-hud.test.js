import { afterEach, beforeEach, expect, test } from 'bun:test'
import { createHud } from '../src/plugins/moba/hud.js'
import { HEROES } from '../src/plugins/moba/heroes.js'
import { createSounds } from '../src/plugins/moba/sounds.js'
import { tune } from '../src/plugins/moba/tune.js'

// A small DOM that counts every write, so "the HUD writes only on change" is measured, not assumed.
let writes = 0
class Node {
	constructor(tag) {
		this.tagName = tag
		this.children = []
		this.attrs = {}
		this.listeners = {}
		this.parent = null
		this._text = ''
		this._html = ''
		this._hidden = false
		this._className = ''
		const classes = new Set()
		this.classes = classes
		this.classList = {
			add: (name) => (writes++, classes.add(name)),
			remove: (name) => (writes++, classes.delete(name)),
			contains: (name) => classes.has(name),
		}
		const style = {}
		this.style = new Proxy(style, {
			get: (target, key) =>
				key === 'setProperty'
					? (name, value) => {
							writes++
							target[name] = value
						}
					: target[key],
			set: (target, key, value) => {
				writes++
				target[key] = value
				return true
			},
		})
		this.dataset = new Proxy(
			{},
			{
				set: (target, key, value) => {
					writes++
					target[key] = value
					return true
				},
			},
		)
	}
	get className() {
		return this._className
	}
	set className(value) {
		this._className = value
		for (const name of value.split(' ').filter(Boolean)) this.classes.add(name)
	}
	get textContent() {
		return this._text + this.children.map((c) => c.textContent).join('')
	}
	set textContent(value) {
		writes++
		this._text = String(value)
		this.children = []
	}
	get innerHTML() {
		return this._html
	}
	set innerHTML(value) {
		writes++
		this._html = value
	}
	get hidden() {
		return this._hidden
	}
	set hidden(value) {
		writes++
		this._hidden = value
	}
	get offsetWidth() {
		return 300
	}
	get offsetHeight() {
		return 200
	}
	append(...nodes) {
		for (const node of nodes) {
			node.parent = this
			this.children.push(node)
		}
	}
	remove() {
		if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this)
		this.parent = null
	}
	setAttribute(name, value) {
		this.attrs[name] = value
	}
	addEventListener(type, fn) {
		;(this.listeners[type] ??= []).push(fn)
	}
	dispatch(type, event = {}) {
		for (const fn of this.listeners[type] ?? []) fn({ preventDefault() {}, button: 0, ...event })
	}
	getBoundingClientRect() {
		return { left: 600, top: 800, width: 64, height: 64 }
	}
	all(test, out = []) {
		if (test(this)) out.push(this)
		for (const child of this.children) child.all(test, out)
		return out
	}
	find(className) {
		return this.all((node) => node.classes.has(className))[0]
	}
}

let previous
beforeEach(() => {
	previous = { document: globalThis.document, window: globalThis.window }
	globalThis.window = new EventTarget()
	globalThis.innerWidth = 1440
	globalThis.innerHeight = 900
	const body = new Node('body')
	globalThis.document = { head: new Node('head'), body, createElement: (tag) => new Node(tag) }
})
afterEach(() => {
	for (const [key, value] of Object.entries(previous))
		if (value === undefined) delete globalThis[key]
		else globalThis[key] = value
	delete globalThis.innerWidth
	delete globalThis.innerHeight
})

const body = () => globalThis.document.body
const at = (x, z) => ({ x, y: 0, z })
function heroUnit(id, team, heroId = 'fletcher', x = 0) {
	return {
		id,
		team,
		heroId,
		definition: HEROES[heroId],
		level: 1,
		hp: 1400,
		maxHp: 1400,
		dead: false,
		body: { radius: 0.45, position: at(x, 0), mesh: { position: at(x, 0) } },
	}
}
function world({ heroId = 'fletcher' } = {}) {
	const local = heroUnit('local', 'A', heroId, -10)
	const enemy = heroUnit('bot-B-0', 'B', 'fletcher', 10)
	const structures = ['tower', 'fort', 'core'].flatMap((kind) =>
		['A', 'B'].map((team) => ({
			id: `${kind}-${team}`,
			team,
			kind,
			structure: true,
			hp: tune[kind].hp,
			maxHp: tune[kind].hp,
			dead: false,
			silentUntil: 0,
			body: {
				radius: tune[kind].radius,
				mesh: { position: at(team === 'A' ? -tune[kind].x : tune[kind].x, 0) },
			},
		})),
	)
	const minion = {
		id: 'm1',
		team: 'B',
		kind: 'melee',
		hp: 400,
		maxHp: 400,
		damageScale: 1,
		dead: false,
		body: { radius: tune.waves.radius, mesh: { position: at(3, 2) } },
	}
	const teams = { A: { xp: 600, level: 2 }, B: { xp: 0, level: 1 } }
	const sim = {
		tick: 0,
		heroes: [local, enemy],
		lane: { minions: [minion], structures, teams, vulnerable: (u) => u.kind === 'tower' },
	}
	return { local, enemy, sim, minion, teams }
}
function frameOf(w, extra = {}) {
	return {
		hero: w.local,
		sim: w.sim,
		cooldowns: [0, 0, 0],
		device: 'keyboard',
		hp: w.local.hp,
		maxHp: w.local.maxHp,
		respawn: null,
		elapsed: 65,
		teams: w.teams,
		nextWave: 10,
		nextBall: 147,
		ballPop: null,
		localTeam: 'A',
		step: 1 / 60,
		...extra,
	}
}

test('unchanged HUD frames write nothing; a ticking second rewrites only what moved', () => {
	const w = world()
	const hud = createHud()
	try {
		hud.update(0, frameOf(w))
		let before = writes
		hud.update(0.016, frameOf(w))
		expect(writes - before).toBe(0)
		// Sub-second drift on the timers moves the rings only when their quantised fraction changes.
		before = writes
		hud.update(0.016, frameOf(w, { elapsed: 65.01, nextWave: 9.99, nextBall: 146.99 }))
		expect(writes - before).toBeLessThanOrEqual(2)
		const summary = body().find('moba-sr')
		expect(summary.textContent).toBe(
			'Your team level 2, 0 kills · 1:05 · Enemy level 1, 0 kills · wave 10s · Ball 147s',
		)
		hud.update(0, frameOf(w, { elapsed: 66, nextWave: 9, nextBall: 146 }))
		expect(summary.textContent).toContain('1:06')
		expect(body().find('moba-clock').children[0].textContent).toBe('1:06')
		hud.update(0, frameOf(w, { ballPop: 42.4 }))
		expect(summary.textContent).toContain('Ball pops in 43s')
		expect(body().find('ball').dataset.state).toBe('live')
		before = writes
		hud.update(0, frameOf(w, { ballPop: 42.2 }))
		expect(writes - before).toBeLessThanOrEqual(1) // the ring, never the text
		hud.update(0, frameOf(w, { carryingBall: true }))
		expect(body().find('ball').dataset.state).toBe('carried')
		expect(body().find('moba-help').textContent).toContain('Q/W/E or click to throw')
	} finally {
		hud.dispose()
	}
})

test('portrait shows HP, respawn and team XP; slots show cooldown sweeps and denied flashes', () => {
	const w = world()
	const hud = createHud()
	try {
		hud.update(0, frameOf(w, { hp: 1180 }))
		const health = body().find('moba-health')
		expect(health.textContent).toBe('1180 / 1400')
		expect(health.style['--tick']).toBe(`${((tune.hud.hpTick / 1400) * 100).toFixed(3)}%`)
		expect(body().find('moba-xp').textContent).toBe(
			`Lv 2 · 0 / ${tune.levels.first + tune.levels.increment} XP`,
		)
		hud.update(0, frameOf(w, { respawn: 7.6 }))
		hud.update(0, frameOf(w, { respawn: 7.4 }))
		expect(health.textContent).toBe('Respawn in 8 s')
		expect(body().find('moba-portrait').classes.has('dead')).toBe(true)
		hud.update(0, frameOf(w, { cooldowns: [2, 0, 0.4] }))
		const slots = body().all((n) => n.classes.has('moba-slot'))
		expect(slots[0].style['--cd']).toBe(`${2 / tune.loose.cooldown}turn`)
		expect(slots[0].find('left').textContent).toBe('2')
		expect(slots[2].find('left').textContent).toBe('0.4')
		hud.update(0, frameOf(w))
		expect(slots[0].classes.has('ready')).toBe(true)
		hud.deny('slot2')
		expect(slots[1].classes.has('denied')).toBe(true)
		hud.update(0.1, frameOf(w))
		expect(slots[1].classes.has('denied')).toBe(false)
	} finally {
		hud.dispose()
	}
})

test('kit, trait and controls come from the local hero, and read tuning live', () => {
	const old = tune.momentum.reduction
	for (const heroId of ['fletcher', 'mitts']) {
		const w = world({ heroId })
		const hud = createHud()
		try {
			hud.update(0, frameOf(w))
			const names = Object.values(HEROES[heroId].abilities)
				.slice(0, 3)
				.map((a) => a.id)
			const help = body().find('moba-help').textContent
			expect(help).toContain(`Q ${names[0]} · W ${names[1]} · E ${names[2]}`)
			const icons = body().all((n) => n.classes.has('icon'))
			expect(icons.map((n) => n.innerHTML.length > 0)).toEqual([true, true, true])
			const trait = body().find('moba-trait')
			if (heroId === 'fletcher') {
				expect(trait.textContent).toBe(`−${tune.momentum.reduction}s`)
				tune.momentum.reduction = 1.25
				hud.update(0, frameOf(w))
				expect(trait.textContent).toBe('−1.25s')
				expect(help).not.toContain('toss')
			} else {
				expect(trait.textContent).toBe(`${tune.catching.pocketLife}s`)
				expect(trait.textContent).not.toContain('−')
				expect(help).not.toContain('loose')
			}
			hud.update(0, frameOf(w, { device: 'gamepad' }))
			expect(body().find('moba-help').textContent).toContain(`aim ${names.join(' / ')}`)
			expect(body().find('moba-help').textContent).toContain('hold Y inspect')
			expect(
				body()
					.all((n) => n.classes.has('key'))
					.map((n) => n.textContent),
			).toEqual(['RB', 'RT', 'LB'])
		} finally {
			hud.dispose()
			tune.momentum.reduction = old
		}
	}
})

test('takedowns count each death edge once, through respawns, for the killing side', () => {
	const w = world()
	const hud = createHud()
	try {
		hud.update(0, frameOf(w))
		w.enemy.dead = true
		hud.update(0, frameOf(w))
		hud.update(0, frameOf(w)) // still dead: no second count
		expect(hud.kills).toEqual({ A: 1, B: 0 })
		w.enemy.dead = false
		hud.update(0, frameOf(w))
		w.enemy.dead = true
		w.local.dead = true
		hud.update(0, frameOf(w))
		expect(hud.kills).toEqual({ A: 2, B: 1 })
		const kills = body().all((n) => n.classes.has('moba-kills'))
		expect(kills.map((n) => n.children[0].textContent)).toEqual(['2', '1'])
	} finally {
		hud.dispose()
	}
})

test('structure row greys out fallen structures and marks protected ones', () => {
	const w = world()
	const hud = createHud()
	try {
		const tower = w.sim.lane.structures.find((s) => s.id === 'tower-B')
		tower.hp = tower.maxHp / 2
		hud.update(0, frameOf(w))
		const icon = (side, kind) =>
			body()
				.find(side)
				.all((n) => n.classes.has('moba-fort') && n.dataset.kind === kind)[0]
		expect(icon('theirs', 'tower').children.at(-1).style['--f']).toBe('0.5')
		expect(icon('theirs', 'fort').classes.has('shielded')).toBe(true)
		tower.dead = true
		hud.update(0, frameOf(w))
		expect(icon('theirs', 'tower').classes.has('down')).toBe(true)
		expect(icon('mine', 'tower').classes.has('down')).toBe(false)
	} finally {
		hud.dispose()
	}
})

test('tooltips open on slot hover, touch long-press, world rest and pad inspect, with live numbers', () => {
	const w = world()
	const hud = createHud()
	const old = tune.loose.damage
	try {
		hud.update(0, frameOf(w))
		const tip = hud.tooltip.element
		const slot = body().all((n) => n.classes.has('moba-slot'))[0]
		expect(slot.attrs['aria-describedby']).toBe('moba-tip')
		slot.dispatch('pointerenter', { pointerType: 'mouse' })
		hud.update(0, frameOf(w))
		expect(tip.hidden).toBe(false)
		expect(tip.innerHTML).toContain(`<dd>${tune.loose.damage}</dd>`)
		const before = writes
		hud.update(0, frameOf(w))
		expect(writes - before).toBe(0) // an open, unchanged card is not rebuilt
		tune.loose.damage = 155
		hud.update(0, frameOf(w))
		expect(tip.innerHTML).toContain('<dd>155</dd>')
		slot.dispatch('pointerleave')
		hud.update(0, frameOf(w))
		expect(tip.hidden).toBe(true)

		// Touch: nothing until the hold passes `longPress`; release closes it.
		const wave = body().find('wave')
		wave.dispatch('pointerdown', { pointerType: 'touch' })
		hud.update(tune.hud.longPress / 2, frameOf(w))
		expect(tip.hidden).toBe(true)
		hud.update(tune.hud.longPress, frameOf(w))
		expect(tip.hidden).toBe(false)
		expect(tip.innerHTML).toContain('Next wave')
		wave.dispatch('pointerup')
		hud.update(0, frameOf(w))
		expect(tip.hidden).toBe(true)

		// The cursor resting on a minion opens its card after `hoverDelay`.
		const aim = { x: 3.2, z: 2 }
		hud.update(0, frameOf(w, { aim }))
		hud.update(tune.hud.hoverDelay / 2, frameOf(w, { aim }))
		expect(tip.hidden).toBe(true)
		hud.update(tune.hud.hoverDelay, frameOf(w, { aim }))
		expect(tip.innerHTML).toContain('Enemy melee')
		expect(tip.innerHTML).toContain(
			`<dd>${tune.minions.melee.damage} · ${tune.minions.melee.rate}/s</dd>`,
		)
		w.minion.dead = true
		hud.update(0, frameOf(w, { aim }))
		expect(tip.hidden).toBe(true)

		// Pad: hold Y past `inspectHold` for your own hero at rest, d-pad right steps to Q.
		const pad = (y, right = false) => ({
			buttons: Object.assign(Array(17).fill(false), { 3: y, 15: right }),
		})
		const padFrame = (p) => frameOf(w, { device: 'gamepad', pad: p, aim: null })
		hud.update(tune.hud.inspectHold / 2, padFrame(pad(true)))
		expect(tip.hidden).toBe(true)
		hud.update(tune.hud.inspectHold, padFrame(pad(true)))
		expect(tip.innerHTML).toContain('Fletcher')
		expect(tip.innerHTML).toContain('You · level 1')
		hud.update(0, padFrame(pad(true, true)))
		expect(tip.innerHTML).toContain('Loose')
		expect(tip.innerHTML).toContain('RB')
		hud.update(0, padFrame(pad(false)))
		expect(tip.hidden).toBe(true)
	} finally {
		tune.loose.damage = old
		hud.dispose()
	}
})

test('MOBA combat cues have separate synth presets and read tuning live', () => {
	const calls = []
	const sounds = createSounds({ sfx: { step() {} }, blip: (options) => calls.push(options) })
	const point = { x: 2, z: 3 }
	for (const name of Object.keys(tune.sounds)) sounds[name](point)
	expect(calls).toHaveLength(Object.keys(tune.sounds).length)
	expect(new Set(calls.map((c) => `${c.freq}:${c.slideTo}:${c.type}:${c.dur}`)).size).toBe(
		Object.keys(tune.sounds).length,
	)
	expect(calls.every((c) => c.point === point)).toBe(true)
	const old = tune.sounds.attack.freq
	try {
		tune.sounds.attack.freq = 990
		sounds.attack(point, 0.5)
		expect(calls.at(-1).freq).toBe(990)
		expect(calls.at(-1).gain).toBe(tune.sounds.attack.gain * 0.5)
	} finally {
		tune.sounds.attack.freq = old
	}
})
