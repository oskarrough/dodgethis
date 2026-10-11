import { STEP } from '../../core/app.js'
import { tune } from './tune.js'
import { interceptShot, stepShot } from './skillshot.js'
import { clampWalkable } from './obstacles.js'

const ticks = (s) => Math.max(1, Math.round(s / STEP))
const pos = (p) => ({ x: p.x, z: p.z })

// One objective per sim. Its fixed clock is independent of pickup, spending and expiry.
export function createBall({
	heroes,
	targets,
	vulnerable,
	obstacles,
	present,
	damage,
	endCast,
	layout,
}) {
	let ball = null
	let serial = 0
	let nextBall = ticks(tune.ball.first)
	let now = 0
	const fact = (type, extra = {}) =>
		present({ type, id: ball.id, point: { ...ball.pos, y: tune.ballView.height }, ...extra })
	const carrying = (h) => ball?.state === 'carried' && ball.carrier === h.id
	function drop(reason, point = null) {
		if (!ball || ball.state === 'warning') return false
		if (point) ball.pos = pos(point)
		const h = heroes.find((u) => u.id === ball.carrier)
		if (h) {
			ball.pos = pos(h.body.position)
			h.ballThrow = null
		}
		ball.pos = clampWalkable(ball.pos, tune.ball.radius, 0, obstacles)
		ball.state = 'loose'
		ball.carrier = null
		ball.channel = null
		ball.shot = null
		ball.pickableAt = now + ticks(tune.ball.lock)
		fact('ballDrop', { reason, hero: h?.id ?? null })
		return true
	}
	function interrupt(h, reason) {
		if (ball?.channel?.hero !== h.id) return
		ball.state = 'loose'
		ball.channel = null
		ball.pickableAt = now + 1 // damaged heroes cannot restart on the same tick
		fact('ballInterrupted', { hero: h.id, reason })
	}
	function hurt(h) {
		interrupt(h, 'damage')
		if (h.dead && carrying(h)) drop('death')
	}
	function begin(t) {
		now = t
		if (ball && ball.state !== 'warning' && t >= ball.popAt) {
			const h = heroes.find((u) => u.id === ball.carrier)
			if (h) h.ballThrow = null
			fact('ballPop', { reason: 'expired' })
			ball = null
		}
		if (!ball && t >= nextBall - ticks(tune.ball.warning)) {
			ball = {
				id: ++serial,
				state: 'warning',
				pos: { x: 0, z: 0 },
				carrier: null,
				channel: null,
				shot: null,
				pickableAt: nextBall,
				popAt: nextBall + ticks(tune.ball.life),
				spawnAt: nextBall,
				warnAt: nextBall - ticks(tune.ball.warning),
			}
			fact('ballWarn', { seconds: Math.max(0, (nextBall - t) * STEP) })
		}
		if (t >= nextBall) {
			if (ball?.state !== 'warning') {
				if (ball) {
					const carrier = heroes.find((h) => h.id === ball.carrier)
					if (carrier?.ballThrow) {
						carrier.ballThrow = null
						fact('ballDenied', { hero: carrier.id, reason: 'replaced' })
					}
					fact('ballPop', { reason: 'replaced' })
				}
				ball = { id: ++serial, pos: { x: 0, z: 0 }, carrier: null, channel: null, shot: null }
			}
			ball.state = 'loose'
			ball.pos = { x: 0, z: 0 }
			ball.pickableAt = nextBall
			ball.popAt = nextBall + ticks(tune.ball.life)
			fact('ballSpawn')
			nextBall += ticks(
				t >= ticks(layout?.late ?? tune.match.late) ? tune.ball.lateInterval : tune.ball.interval,
			)
		}
		if (ball?.state === 'carried') {
			const h = heroes.find((u) => u.id === ball.carrier)
			if (h.dead) drop('death')
			else ball.pos = pos(h.body.position)
		}
	}
	// Catch/redirect resolvers call this before collision; lifetime is never refreshed.
	function give(h, reason = 'caught') {
		if (!ball || ball.state === 'warning' || now >= ball.popAt || h.dead || !heroes.includes(h))
			return false
		const previous = heroes.find((u) => u.id === ball.carrier)
		if (previous) previous.ballThrow = null
		h.ballThrow = null
		endCast(h, 'ball')
		h.attack = null
		h.order = null
		h.body.cancelDash?.()
		ball.state = 'carried'
		ball.carrier = h.id
		ball.team = h.team
		ball.pos = pos(h.body.position)
		ball.channel = null
		ball.shot = null
		ball.contested = false
		fact('ballPickup', { hero: h.id, team: h.team, reason })
		return true
	}
	function control(h, frame, intents, facing) {
		if (!carrying(h)) return false
		endCast(h, 'ball')
		h.attack = null
		const edges = frame.pressed.filter((e) => e.action === 'primary' || e.action.startsWith('slot'))
		if (h.ballThrow && frame.pressed.some((e) => ['stop', 'cancel'].includes(e.action))) {
			h.ballThrow = null
			fact('ballDenied', { hero: h.id, reason: 'cancelled' })
		}
		if (edges.length) {
			for (const e of edges) intents.consume(h.id, e.action)
			for (const e of edges.slice(0, -1))
				fact('ballDenied', { hero: h.id, reason: 'superseded', slot: e.action })
			if (h.ballThrow) fact('ballDenied', { hero: h.id, reason: 'windup' })
			else {
				const at = edges.at(-1).at ?? frame.aim
				const p = h.body.position
				const dx = at ? at.x - p.x : facing.x,
					dz = at ? at.z - p.z : facing.z
				const length = Math.hypot(dx, dz)
				const dir = length > tune.collision.epsilon ? { x: dx / length, z: dz / length } : facing
				h.ballThrow = { dir, endTick: now + ticks(tune.ball.tell), startTick: now }
				h.order = null
				fact('ballWindup', { hero: h.id, direction: dir })
			}
		}
		if (h.ballThrow && now >= h.ballThrow.endTick) {
			const { dir } = h.ballThrow
			ball.pos = pos(h.body.position)
			ball.state = 'flying'
			ball.carrier = null
			ball.releaseTick = now
			ball.releasePos = { ...ball.pos }
			ball.team = h.team
			ball.shot = {
				id: ball.id,
				slot: 'ball',
				owner: h.id,
				team: h.team,
				x: ball.pos.x,
				z: ball.pos.z,
				dx: dir.x,
				dz: dir.z,
				range: tune.ball.range,
				speed: tune.ball.speed,
				radius: tune.ball.radius,
				travelled: 0,
				passed: [],
			}
			h.ballThrow = null
			fact('ballThrow', { hero: h.id, direction: dir })
		}
		return true
	}
	function finish(dt, intercept = null) {
		if (!ball || ball.state === 'warning') return
		if (ball.state === 'flying') {
			const shot = ball.shot
			if (interceptShot(shot, dt, intercept, { kind: 'ball', tick: now, ball: api, obstacles })) {
				if (ball?.state === 'flying') {
					fact('ballPop', { reason: 'intercepted' })
					ball = null
				}
				return
			}
			const candidates = targets()
				.filter((u) => !u.dead && u.team !== shot.team)
				.map((u) => ({
					id: u.id,
					unit: u,
					x: u.body.position.x,
					z: u.body.position.z,
					radius: u.body.radius,
				}))
			const result = stepShot(shot, dt, candidates, -Infinity, obstacles)
			ball.pos = { x: shot.x, z: shot.z }
			if (result.hit) {
				const u = result.hit.unit
				if (u.structure && !vulnerable(u)) {
					fact('ballBounce', { target: u.id, reason: 'shielded' })
					drop('shielded')
				} else {
					if (u.structure) {
						u.silentUntil = now + ticks(tune.ball.silence)
						u.attack = null
					} else {
						endCast(u, 'ball')
						u.attack = null
						u.ballThrow = null
					}
					fact('ballHit', {
						hero: shot.owner,
						target: u.id,
						kind: u.structure ? 'structure' : 'hero',
					})
					damage(shot, u, u.structure ? u.maxHp * tune.ball.structureDamage : tune.ball.damage)
					// The landed hit reads the stance before this impact's stun disables it.
					if (!u.structure) u.stunUntil = now + ticks(tune.ball.stun)
					if (u.structure) {
						fact('ballPop', { reason: 'spent' })
						ball = null
					} else drop('hero')
				}
			} else if (result.blocked || result.expired) {
				if (result.blocked) fact('ballBounce', { reason: 'cover' })
				drop(result.blocked ? 'cover' : 'miss')
			}
			return
		}
		if (ball.state === 'carried') {
			ball.pos = pos(heroes.find((h) => h.id === ball.carrier).body.position)
			return
		}
		const eligible = (h) =>
			!h.dead &&
			now >= (h.stunUntil ?? 0) &&
			!h.cast &&
			!h.attack &&
			!h.body.dashing &&
			Math.hypot(h.body.position.x - ball.pos.x, h.body.position.z - ball.pos.z) <=
				tune.ball.pickup &&
			Math.hypot(h.body.velocity.x, h.body.velocity.z) <= tune.ball.still
		const candidates = heroes.filter(eligible)
		const contested = new Set(candidates.map((h) => h.team)).size > 1
		if (contested && now >= ball.pickableAt) {
			if (ball.channel)
				interrupt(
					heroes.find((h) => h.id === ball.channel.hero),
					'contested',
				)
			if (!ball.contested) fact('ballContested')
			ball.contested = true
			return
		}
		ball.contested = false
		if (ball.channel) {
			const h = heroes.find((u) => u.id === ball.channel.hero)
			if (!eligible(h)) interrupt(h, 'moved')
			else if (now >= ball.channel.endTick) {
				give(h, 'pickup')
			}
		} else if (now >= ball.pickableAt) {
			const h = candidates.sort(
				(a, b) =>
					Math.hypot(a.body.position.x - ball.pos.x, a.body.position.z - ball.pos.z) -
						Math.hypot(b.body.position.x - ball.pos.x, b.body.position.z - ball.pos.z) ||
					a.id.localeCompare(b.id),
			)[0]
			if (h) {
				ball.state = 'channel'
				ball.channel = { hero: h.id, endTick: now + ticks(tune.ball.channel), startTick: now }
				fact('ballChannel', { hero: h.id })
			}
		}
	}
	const api = {
		drop,
		give,
		begin,
		finish,
		control,
		hurt,
		carrying,
		interrupt,
		snapshot() {
			return {
				match: { nextBall },
				ball:
					ball &&
					structuredClone({
						...ball,
						shot: ball.shot && {
							pos: { x: ball.shot.x, z: ball.shot.z },
							dir: { x: ball.shot.dx, z: ball.shot.dz },
							travelled: ball.shot.travelled,
						},
					}),
			}
		},
		get state() {
			return ball
		},
		get nextBall() {
			return nextBall
		},
	}
	return api
}
