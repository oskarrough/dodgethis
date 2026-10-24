import { STEP } from '../../../../core/app.js'
import { tune } from '../../tune.js'
import { clampWalkable } from '../../obstacles.js'
import { distance } from '../../../../core/spatial.js'

const ticks = (s) => Math.max(1, Math.round(s / STEP))

// The packs at `layout.packs`: each `{ x, z, guards: [kind…], patrol?: [{ x, z }…] }`. Guards are
// neutral (team 'N') lane minions that stand at their post, or walk the patrol loop, until a hero
// comes near or strikes one; then the whole pack fights. A pack left alone heals and goes home. Dead guards stay dead: a dungeon is cleared once.
export function createPacks({ layout, lane, heroes, makeMinion, obstacles }) {
	const p = tune.packs
	const packs = (layout.packs ?? []).map((spec, i) => ({
		id: `pack-${i + 1}`,
		post: { x: spec.x, z: spec.z },
		patrol: spec.patrol ?? null,
		leg: 0,
		kinds: spec.guards,
		guards: [],
		provoked: false,
		calmTick: 0,
	}))
	const spot = (pack, i) => {
		const n = pack.kinds.length
		const angle = (i / n) * Math.PI * 2
		const at = {
			x: pack.post.x + Math.cos(angle) * (n > 1 ? p.spread : 0),
			z: pack.post.z + Math.sin(angle) * (n > 1 ? p.spread : 0),
		}
		return clampWalkable(at, tune.waves.radius, tune.orders.clearance, obstacles, layout.bounds)
	}
	// A two-point route: with no target the guard walks to its place beside the post.
	const homeward = (pack) =>
		pack.guards.forEach((g, i) => {
			g.route = [{ ...pack.post }, spot(pack, i)]
			g.routeLeg = 1
			g.path = null
		})
	for (const pack of packs) {
		pack.guards = pack.kinds.map((kind, i) => {
			const at = spot(pack, i)
			const { hp, damage } = p.guards[kind]
			return {
				id: `${pack.id}-${i + 1}`,
				pack: pack.id,
				passive: true,
				lane: pack.id,
				route: [{ ...pack.post }, at],
				routeLeg: 1,
				file: 0,
				team: 'N',
				kind,
				hp,
				maxHp: hp,
				damageScale: damage,
				dead: false,
				body: makeMinion(at.x, at.z, 'N', kind),
				target: null,
				forced: null,
				aggroUntil: 0,
				attackTick: 0,
				attack: null,
				statuses: [],
			}
		})
		lane.minions.push(...pack.guards)
	}
	const living = () => heroes.filter((h) => !h.dead)
	function walk(pack) {
		const arrived = pack.guards.every(
			(g) => g.dead || distance(g.body.position, g.route[g.routeLeg]) <= tune.orders.arrival * 2,
		)
		if (!arrived) return
		pack.leg = (pack.leg + 1) % pack.patrol.length
		pack.post = { ...pack.patrol[pack.leg] }
		homeward(pack)
	}
	function step(t) {
		for (const pack of packs) {
			const alive = pack.guards.filter((g) => !g.dead)
			if (!alive.length) continue
			if (!pack.provoked)
				pack.provoked = alive.some(
					(g) =>
						g.hp < g.maxHp ||
						living().some((h) => distance(h.body.position, g.body.position) <= p.aggro),
				)
			if (!pack.provoked) {
				if (pack.patrol) walk(pack)
				continue
			}
			const foes = living().filter((h) => distance(h.body.position, pack.post) <= p.leash)
			if (foes.length) pack.calmTick = t + ticks(p.calm)
			else if (t >= pack.calmTick) {
				pack.provoked = false
				for (const g of alive) {
					g.hp = g.maxHp
					g.forced = null
					g.aggroUntil = 0
				}
				continue
			}
			for (const g of alive) {
				const at = g.body.position
				const foe = foes.sort(
					(a, b) =>
						distance(a.body.position, at) - distance(b.body.position, at) ||
						a.id.localeCompare(b.id),
				)[0]
				if (!foe) continue
				g.forced = foe.id
				g.aggroUntil = t + 2
			}
		}
	}
	return {
		packs,
		step,
		// What bots see: each pack still standing, whether it fights, and its guards.
		botView: () =>
			packs
				.filter((pack) => pack.guards.some((g) => !g.dead))
				.map((pack) => ({
					id: pack.id,
					pos: { ...pack.post },
					provoked: pack.provoked,
					guards: pack.guards
						.filter((g) => !g.dead)
						.map((g) => ({
							id: g.id,
							pos: { x: g.body.position.x, z: g.body.position.z },
						})),
				})),
	}
}
