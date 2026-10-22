const share = (part, whole) => (whole > 0 ? part / whole : 0)

// Facts are the entire contract: no tune, live units, or simulation dependencies.
export function reduceFight(facts) {
	const startIndex = facts.findIndex((fact) => fact.type === 'pull' && fact.state === 'start')
	if (startIndex < 0) return null
	const start = facts[startIndex]
	const endIndex = facts.findIndex(
		(fact, index) => index > startIndex && fact.type === 'pull' && fact.state === 'end',
	)
	if (endIndex < 0) return null
	const end = facts[endIndex]
	const time = (tick) => Math.max(0, (tick - start.tick) * start.step)
	const duration = time(end.tick)
	const party = Object.values(start.party).map((hero) => ({
		...hero,
		damage: 0,
		healing: 0,
		overheal: 0,
		absorbed: 0,
		shieldGiven: 0,
		shieldWasted: 0,
		damageTaken: 0,
		deaths: 0,
		hurtSeconds: 0,
		busySeconds: 0,
		threatSeconds: 0,
	}))
	const rows = new Map(party.map((hero) => [hero.id, hero]))
	const health = new Map(party.map((hero) => [hero.id, { hp: hero.maxHp, at: 0 }]))
	const histories = new Map(party.map((hero) => [hero.id, []]))
	const name = (id) =>
		rows.get(id)?.name ?? (id === start.boss.id ? start.boss.name : (id ?? 'Environment'))
	const abilityName = (id) => start.abilities[id] ?? id ?? 'Unknown'
	const spells = new Map()
	const casts = new Map()
	const shields = new Map()
	const deaths = []
	const switches = []
	const wastedCasts = []
	let holder = null
	let heldSince = 0
	function spell(source, ability) {
		if (rows.get(source)?.heroId !== 'mender') return null
		const key = `${source}:${ability}`
		if (!spells.has(key))
			spells.set(key, {
				source,
				ability,
				name: abilityName(ability),
				casts: 0,
				healing: 0,
				overheal: 0,
				absorbed: 0,
				crits: 0,
			})
		return spells.get(key)
	}
	function healthUntil(id, at, hp) {
		const previous = health.get(id)
		if (!previous) return
		if (previous.hp > 0 && previous.hp < rows.get(id).maxHp * 0.3)
			rows.get(id).hurtSeconds += at - previous.at
		previous.at = at
		if (hp != null) previous.hp = hp
	}
	function finishCast(id, at) {
		const cast = casts.get(id)
		if (!cast) return
		rows.get(id).busySeconds += Math.max(0, Math.min(at, cast.until) - cast.at)
		casts.delete(id)
	}
	function creditWaste(shield, amount) {
		const row = rows.get(shield.source)
		if (row) row.shieldWasted += amount
	}
	for (const fact of facts.slice(startIndex + 1, endIndex + 1)) {
		const at = time(fact.tick)
		const source = rows.get(fact.source)
		const target = rows.get(fact.target)
		if (fact.type === 'hit' || fact.type === 'heal') {
			if (fact.type === 'hit') {
				if (source) source.damage += fact.damage
				if (target) target.damageTaken += fact.damage
			} else {
				if (source) {
					source.healing += fact.amount
					source.overheal += fact.overheal
				}
				const row = spell(fact.source, fact.ability)
				if (row) {
					row.healing += fact.amount
					row.overheal += fact.overheal
					row.crits += Number(!!fact.crit)
				}
				const overheal = share(fact.overheal, fact.amount + fact.overheal)
				if (fact.ability === 'mend' && !fact.periodic && overheal >= 0.8)
					wastedCasts.push({
						time: at,
						source: fact.source,
						name: abilityName(fact.ability),
						overheal,
					})
			}
			if (target) {
				healthUntil(target.id, at, fact.hp)
				const history = histories.get(target.id)
				history.push({
					type: fact.type,
					time: at,
					ability: abilityName(fact.ability),
					source: name(fact.source),
					amount: fact.type === 'hit' ? fact.damage : fact.amount,
					absorbed: fact.absorbed ?? 0,
					overheal: fact.overheal ?? 0,
				})
				if (history.length > 5) history.shift()
			}
		} else if (fact.type === 'cast' && rows.has(fact.hero)) {
			finishCast(fact.hero, at)
			casts.set(fact.hero, {
				at,
				until: at + Math.max(0, fact.lock ?? 0),
				ability: fact.ability,
				slot: fact.slot,
			})
			if (fact.slot !== 'primary') {
				const row = spell(fact.hero, fact.ability)
				if (row) row.casts++
			}
		} else if (fact.type === 'castCancelled') {
			const cast = casts.get(fact.hero)
			if (cast?.ability === fact.ability && cast.slot === fact.slot) finishCast(fact.hero, at)
		} else if (fact.type === 'absorb') {
			if (source) source.absorbed += fact.amount
			const row = spell(fact.source, fact.key.split('.')[0])
			if (row) row.absorbed += fact.amount
			const shield = shields.get(`${fact.target}:${fact.status}`)
			if (shield) shield.remaining = Math.max(0, shield.remaining - fact.amount)
		} else if (fact.type === 'status') {
			// Status facts may precede their hit on the same tick. They never change HP.
			// The current fact contract uses positive amounts only for absorb shields.
			const key = `${fact.target}:${fact.status}`
			const previous = shields.get(key)
			if (fact.state === 'off') {
				if (previous) {
					creditWaste(previous, fact.wasted ?? previous.remaining)
					shields.delete(key)
				}
			} else if (fact.amount > 0 || previous) {
				const amount = Math.max(0, fact.amount ?? 0)
				if (source) source.shieldGiven += Math.max(0, amount - (previous?.remaining ?? 0))
				if (previous && amount < previous.remaining)
					creditWaste(previous, previous.remaining - amount)
				shields.set(key, { source: fact.source, remaining: amount })
			}
		} else if (fact.type === 'death' && target) {
			target.deaths++
			healthUntil(target.id, at, 0)
			finishCast(target.id, at)
			deaths.push({
				target: target.id,
				name: target.name,
				time: at,
				events: [...histories.get(target.id)],
			})
		} else if (fact.type === 'threat' && fact.unit === start.boss.id) {
			if (rows.has(holder)) rows.get(holder).threatSeconds += at - heldSince
			holder = fact.target
			heldSince = at
			switches.push({ time: at, target: holder, name: name(holder), previous: fact.previous })
		}
	}
	for (const shield of shields.values()) creditWaste(shield, shield.remaining)
	if (rows.has(holder)) rows.get(holder).threatSeconds += duration - heldSince
	for (const hero of party) {
		healthUntil(hero.id, duration)
		finishCast(hero.id, duration)
		hero.overhealShare = share(hero.overheal, hero.healing + hero.overheal)
		hero.shieldWastedShare = share(hero.shieldWasted, hero.shieldGiven)
		hero.hurt = share(hero.hurtSeconds, duration)
		hero.busy = share(hero.busySeconds, duration)
	}
	return {
		result: end.result,
		duration,
		boss: { ...start.boss, hp: end.bossHp },
		party,
		spells: [...spells.values()].map((row) => ({
			...row,
			total: row.healing + row.absorbed,
			average: share(row.healing + row.absorbed, row.casts),
			overhealShare: share(row.overheal, row.healing + row.overheal),
		})),
		deaths,
		threat: {
			holders: party.map(({ id, name, threatSeconds }) => ({ id, name, seconds: threatSeconds })),
			switches,
		},
		wastedCasts,
	}
}
