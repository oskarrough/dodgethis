import { STEP } from '../../core/app.js'
import { tune } from './tune.js'
import { clampWalkable } from './obstacles.js'

const ticks = (s) => Math.max(1, Math.round(s / STEP))
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

// Mercenary camps at `layout.camps`: neutral guards (team 'N') that stand still until hit,
// fight back within a leash, and heal when left alone. The team that lands the last kill
// gets the camp's mercs, which march the nearest lane as ordinary minions. Guards and mercs
// live in `lane.minions`, so damage, fog, targeting and views treat them like any minion.
export function createCamps({ layout, lane, heroes, makeBody, present, obstacles }) {
	const c = tune.camps
	let serial = 0
	const taken = { A: 0, B: 0 }
	const camps = (layout.camps ?? []).map((at, i) => ({
		id: `camp-${i + 1}`,
		at,
		guards: [],
		provoked: false,
		calmTick: 0,
		respawnTick: ticks(c.first),
	}))
	const place = (camp, i, n) => {
		const angle = (i / n) * Math.PI * 2
		const point = {
			x: camp.at.x + Math.cos(angle) * (n > 1 ? c.spread : 0),
			z: camp.at.z + Math.sin(angle) * (n > 1 ? c.spread : 0),
		}
		return clampWalkable(point, tune.waves.radius, tune.orders.clearance, obstacles, layout.bounds)
	}
	const unit = (fields, kind, at, team, hp, damageScale, t) => ({
		...fields,
		team,
		kind,
		hp,
		maxHp: hp,
		damageScale,
		dead: false,
		body: makeBody(at.x, at.z, team, kind),
		target: null,
		forced: null,
		aggroUntil: 0,
		attackTick: t,
		attack: null,
		slow: { until: 0, factor: 1 },
	})
	function fill(camp, t) {
		camp.guards = c.guards.map(({ kind, hp, damage }, i) => {
			const at = place(camp, i, c.guards.length)
			// A two-point route home: with no target the guard walks back to its post.
			return unit(
				{
					id: `${camp.id}-${++serial}`,
					camp: camp.id,
					passive: true,
					lane: camp.id,
					route: [{ x: camp.at.x, z: camp.at.z }, at],
					routeLeg: 1,
					file: 0,
				},
				kind,
				at,
				'N',
				hp,
				damage,
				t,
			)
		})
		lane.minions.push(...camp.guards)
		camp.provoked = false
		camp.respawnTick = null
		present({ type: 'camp', state: 'spawn', target: camp.id, point: { ...camp.at, y: 0 } })
	}
	function enlist(camp, team, t) {
		const nearest = layout.lanes
			.map((l) => ({ l, d: Math.min(...l.path.map((p) => Math.abs(p.z - camp.at.z))) }))
			.sort((a, b) => a.d - b.d)[0]?.l
		if (!nearest) return
		const ahead = (p) => (team === 'A' ? p.x > camp.at.x : p.x < camp.at.x)
		for (const [i, { kind, hp, damage }] of c.mercs.entries()) {
			const route = lane.route(nearest, team, 0)
			const next = route.findIndex(ahead)
			const at = place(camp, i, c.mercs.length)
			const merc = unit(
				{
					id: `merc-${++serial}`,
					merc: true,
					lane: nearest.id,
					route,
					routeLeg: next === -1 ? route.length - 1 : Math.max(1, next),
					file: 0,
				},
				kind,
				at,
				team,
				hp,
				damage,
				t,
			)
			lane.minions.push(merc)
			present({ type: 'spawn', target: merc.id, point: { ...merc.body.position } })
		}
	}
	function step(t) {
		const live = (u) => !u.dead && u.team !== 'N' && !u.structure
		for (const camp of camps) {
			if (camp.respawnTick !== null) {
				if (t >= camp.respawnTick) fill(camp, t)
				continue
			}
			const alive = camp.guards.filter((g) => !g.dead)
			if (!alive.length) {
				const team = camp.guards.at(-1)?.killedBy
				camp.guards = []
				camp.respawnTick = t + ticks(c.respawn)
				if (team === 'A' || team === 'B') {
					taken[team]++
					present({
						type: 'camp',
						state: 'taken',
						team,
						target: camp.id,
						point: { ...camp.at, y: 0 },
					})
					enlist(camp, team, t)
				}
				continue
			}
			if (!camp.provoked && alive.some((g) => g.hp < g.maxHp)) camp.provoked = true
			if (!camp.provoked) continue
			const foes = [...lane.minions, ...heroes].filter(
				(u) => live(u) && distance(u.body.position, camp.at) <= c.leash,
			)
			if (foes.length) camp.calmTick = t + ticks(c.calm)
			else if (t >= camp.calmTick) {
				// Left alone: heal up and settle back to waiting.
				camp.provoked = false
				for (const g of alive) {
					g.hp = g.maxHp
					g.forced = null
					g.aggroUntil = 0
				}
				continue
			}
			for (const g of alive) {
				const p = g.body.position
				const foe = foes.sort(
					(a, b) =>
						distance(a.body.position, p) - distance(b.body.position, p) || a.id.localeCompare(b.id),
				)[0]
				if (!foe) continue
				g.forced = foe.id
				g.aggroUntil = t + 2
			}
		}
	}
	return {
		camps,
		taken,
		step,
		botView: () =>
			camps.map((camp) => ({
				id: camp.id,
				pos: { ...camp.at },
				provoked: camp.provoked,
				guards: camp.guards
					.filter((g) => !g.dead)
					.map((g) => ({
						id: g.id,
						hp: g.hp,
						pos: { x: g.body.position.x, z: g.body.position.z },
					})),
			})),
	}
}
