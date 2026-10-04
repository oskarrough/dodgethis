import { afterEach, expect, test } from 'bun:test'
import { HEROES } from '../src/plugins/moba/heroes.js'
import { tune } from '../src/plugins/moba/tune.js'
import {
	abilityCard,
	ballCard,
	clockCard,
	createTooltip,
	heroCard,
	levelProgress,
	minionCard,
	structureCard,
	traitCard,
	waveCard,
} from '../src/plugins/moba/tooltip.js'

const STEP = 1 / 60
const row = (card, label) => card.rows.find(([k]) => k === label)?.[1]
const growth = (level) => 1 + tune.levels.growth * (level - 1)

test('every built ability card shows its tune numbers exactly, scaled by level', () => {
	const units = {
		range: ' m',
		radius: ' m',
		speed: ' m/s',
		time: ' s',
		delay: ' s',
		prone: ' s',
		cooldown: ' s',
	}
	const labels = {
		range: 'Range',
		radius: 'Radius',
		speed: 'Speed',
		time: 'Travel time',
		delay: 'Lands after',
		prone: 'Prone after',
		cooldown: 'Cooldown',
	}
	for (const hero of [HEROES.fletcher, HEROES.mitts])
		for (const ability of Object.values(hero.abilities).filter(Boolean)) {
			const s = tune[ability.id]
			for (const level of [1, 3, tune.levels.cap]) {
				const card = abilityCard(ability, { level, key: 'Q' })
				for (const [key, label] of Object.entries(labels))
					if (s[key] !== undefined) expect(row(card, label)).toBe(`${s[key]}${units[key]}`)
				if (s.damage) {
					expect(row(card, 'Damage')).toBe(String(Math.round(s.damage * growth(level))))
					expect(row(card, 'vs structures')).toBe(
						String(Math.round(s.damage * growth(level) * tune.waves.abilityStructure)),
					)
				}
				expect(row(card, 'Cast time')).toBe(s.castPoint > 0 ? `${s.castPoint} s` : 'instant')
			}
		}
})

test('Catch and Dive cards carry their window, cone, speed, reset and prone time', () => {
	const catchCard = abilityCard(HEROES.mitts.abilities.slot2)
	expect(row(catchCard, 'Window')).toBe(`${tune.catch.duration} s`)
	expect(row(catchCard, 'Cone')).toBe(`${tune.catch.angle}°`)
	expect(row(catchCard, 'Move speed')).toBe(
		`${Math.round(tune.catch.speedFactor * 100)}% while open`,
	)
	expect(row(catchCard, 'After a catch')).toBe(`cooldown drops to ${tune.catch.resetCooldown} s`)
	const dive = abilityCard(HEROES.mitts.abilities.slot3)
	expect(row(dive, 'Prone after')).toBe(`${tune.dive.prone} s`)
	expect(row(dive, 'Cone')).toBe(tune.dive.angle >= 360 ? 'all around' : `${tune.dive.angle}°`)
	// Rain's duration belongs to its slow, not a window.
	const rain = abilityCard(HEROES.fletcher.abilities.slot3)
	expect(row(rain, 'Slow')).toBe(`${Math.round(tune.rain.slow * 100)}% for ${tune.rain.duration} s`)
	expect(row(rain, 'Window')).toBeUndefined()
})

const old = { loose: tune.loose.damage, gun: tune.match.lateGunDamage }
afterEach(() => {
	tune.loose.damage = old.loose
	tune.match.lateGunDamage = old.gun
})

test('cards follow live tuning edits', () => {
	const loose = HEROES.fletcher.abilities.slot1
	expect(row(abilityCard(loose), 'Damage')).toBe(String(tune.loose.damage))
	tune.loose.damage = 161
	expect(row(abilityCard(loose), 'Damage')).toBe('161')
	expect(traitCard('fletcher').summary).toContain(`${tune.momentum.reduction} s`)
	expect(traitCard('mitts').title).toBe('Pocket')
	expect(traitCard('carom')).toBeNull()
})

test('structure guns drop to the late fraction across the late mark, live', () => {
	const tower = { id: 'tower-B', team: 'B', kind: 'tower', hp: 1000, maxHp: 1777, silentUntil: 0 }
	const lateTick = Math.round(tune.match.late / STEP)
	const before = structureCard(tower, { localTeam: 'A', tick: lateTick - 1, step: STEP })
	expect(row(before, 'Shot')).toBe(`${tune.tower.damage} damage · ${tune.tower.rate}/s`)
	expect(row(before, 'HP')).toBe('1000 / 1777') // captured max, not the tune value
	const after = structureCard(tower, { localTeam: 'A', tick: lateTick, step: STEP })
	expect(row(after, 'Shot')).toBe(
		`${Math.round(tune.tower.damage * tune.match.lateGunDamage)} damage · ${tune.tower.rate}/s`,
	)
	expect(after.notes.join()).toContain('Late game')
	tune.match.lateGunDamage = 0.5
	expect(row(structureCard(tower, { tick: lateTick, step: STEP }), 'Shot')).toContain(
		`${Math.round(tune.tower.damage * 0.5)} damage`,
	)
	expect(row(clockCard(), 'Late guns')).toBe('50% of their damage')
	expect(structureCard({ ...tower, kind: 'fort' }, { vulnerable: false }).notes.join()).toContain(
		'Protected',
	)
})

test('minion, hero, wave, Ball and level cards read their numbers from tune', () => {
	const minion = { team: 'B', kind: 'ranged', hp: 200, maxHp: 280, damageScale: 1.08 }
	const m = minionCard(minion, { localTeam: 'A' })
	expect(m.title).toBe('Enemy ranged')
	expect(row(m, 'Attack')).toBe(
		`${Math.round(tune.minions.ranged.damage * 1.08)} · ${tune.minions.ranged.rate}/s`,
	)
	expect(row(m, 'XP')).toBe(`${tune.minions.ranged.xp} within ${tune.waves.soak} m`)
	const hero = {
		id: 'x',
		team: 'A',
		heroId: 'mitts',
		definition: HEROES.mitts,
		level: 4,
		hp: 900,
		maxHp: 1800,
	}
	const h = heroCard(hero, { localTeam: 'A' })
	expect(row(h, 'Basic attack')).toBe(
		`${Math.round(tune.gloveSlap.damage * growth(4))} · ${tune.gloveSlap.range} m · ${tune.gloveSlap.rate}/s`,
	)
	expect(row(h, 'Respawn')).toBe(`${tune.respawn.base + tune.respawn.perLevel * 4} s`)
	expect(waveCard({ nextWave: 3.2 }).tag).toBe('4 s')
	expect(waveCard().summary).toContain(`${tune.minions.melee.count} melee`)
	expect(row(ballCard(), 'Hero hit')).toBe(`${tune.ball.damage} · stun ${tune.ball.stun} s`)
	expect(ballCard({ ballPop: 9.1 }).summary).toContain('Pops in 10 s')
	expect(levelProgress(0)).toEqual({ level: 1, into: 0, need: tune.levels.first })
	expect(levelProgress(tune.levels.first + 50)).toEqual({
		level: 2,
		into: 50,
		need: tune.levels.first + tune.levels.increment,
	})
})

test('the card stays inside small viewports, above its anchor when it fits and below otherwise', () => {
	const saved = {
		document: globalThis.document,
		w: globalThis.innerWidth,
		h: globalThis.innerHeight,
	}
	const element = {
		hidden: true,
		dataset: {},
		style: {},
		innerHTML: '',
		offsetWidth: 300,
		offsetHeight: 330,
		setAttribute() {},
		remove() {},
	}
	globalThis.document = { body: { append() {} }, createElement: () => element }
	const place = (vw, vh, anchor) => {
		globalThis.innerWidth = vw
		globalThis.innerHeight = vh
		tip.show(abilityCard(HEROES.fletcher.abilities.slot1), anchor)
		const [, x, y] = element.style.transform.match(/translate\((-?\d+)px, (-?\d+)px\)/).map(Number)
		return { x, y }
	}
	const tip = createTooltip()
	try {
		// 390 × 400: neither above nor below fits, so it pins inside the viewport.
		let p = place(390, 400, { x: 40, y: 360 })
		expect(p.y).toBeGreaterThanOrEqual(8)
		expect(p.y + element.offsetHeight).toBeLessThanOrEqual(400 - 8)
		expect(p.x).toBe(8)
		// Room above the slot: the card sits above it.
		p = place(1440, 900, { x: 700, y: 800 })
		expect(p.y + element.offsetHeight).toBeLessThanOrEqual(800)
		// A top-bar anchor: no room above, so below.
		p = place(1440, 900, { x: 1430, y: 20 })
		expect(p.y).toBeGreaterThan(20)
		expect(p.x + element.offsetWidth).toBeLessThanOrEqual(1440 - 8)
	} finally {
		globalThis.document = saved.document
		globalThis.innerWidth = saved.w
		globalThis.innerHeight = saved.h
		if (saved.w === undefined) delete globalThis.innerWidth
		if (saved.h === undefined) delete globalThis.innerHeight
	}
})
