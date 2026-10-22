import { projectLaneSnapshot } from './lane-replica.js'
import { packStatuses } from './statuses.js'

const q = (v) => Math.round(v * 1000) / 1000 || 0

// The sim's whole state as plain JSON, for replicas, replays and traces; `wire` packs the lane for the network.
export function createSnapshot(ctx) {
	const {
		heroes,
		dummies,
		lane,
		ball,
		flag,
		boss,
		obstacles,
		matchStats,
		botIds,
		readySeats,
		lobby,
		floor,
		layout,
		field,
		boards,
		cutouts,
		zones,
		shots,
	} = ctx

	function snapshot({ wire = false } = {}) {
		matchStats?.sync(heroes, botIds)
		const pos = (b) => ({ x: q(b.position.x), z: q(b.position.z) })
		const ballState = ball?.snapshot()
		const state = {
			t: ctx.t,
			...((lane || ball) && {
				match: { ...(lane && { ...lane.match, nextWave: lane.nextWave }), ...ballState?.match },
			}),
			...(ballState && { ball: ballState.ball }),
			...(matchStats && { matchStats: structuredClone(matchStats.rows) }),
			...(lane
				? {
						globes: structuredClone(lane.globes),
						teams: structuredClone(lane.teams),
						minions: lane.minions.map((u) => ({
							id: u.id,
							kind: u.kind,
							team: u.team,
							hp: u.hp,
							maxHp: u.maxHp,
							dead: u.dead,
							damageScale: u.damageScale,
							pos: pos(u.body),
							yaw: q(u.yaw ?? 0),
							target: u.target,
							attackTick: u.attackTick,
							attack: u.attack && { ...u.attack },
							aggroUntil: u.aggroUntil,
							forced: u.forced,
							returning: !!u.returning,
							aggroOrigin: u.aggroOrigin ? { x: q(u.aggroOrigin.x), z: q(u.aggroOrigin.z) } : null,
							returnGoal: u.returnGoal ? { x: q(u.returnGoal.x), z: q(u.returnGoal.z) } : null,
							statuses: wire ? packStatuses(u.statuses) : structuredClone(u.statuses ?? []),
						})),
						structures: lane.structures.map((u) => ({
							id: u.id,
							team: u.team,
							kind: u.kind,
							vulnerable: lane.vulnerable(u),
							statuses: wire ? packStatuses(u.statuses) : structuredClone(u.statuses ?? []),
							silentUntil: u.silentUntil,
							hp: u.hp,
							maxHp: u.maxHp,
							dead: u.dead,
							target: u.target,
							attackTick: u.attackTick,
							attack: u.attack && { ...u.attack },
							aggroUntil: u.aggroUntil,
							forced: u.forced,
						})),
					}
				: {}),
			...(flag && { flag: structuredClone(flag.state) }),
			...(boss && { boss: structuredClone(boss.state) }),
			// Cover an ability placed (Cushion), so a guest sees and aims around the same walls.
			cover: obstacles
				.filter((o) => o.kind === 'cushion')
				.map((o) => ({ ...o, x: q(o.x), z: q(o.z) })),
			map: floor.id ?? layout.bounds.id ?? field.id,
			...(readySeats && { readySeats: structuredClone(readySeats.seats) }),
			...(readySeats?.party && { partyRevision: readySeats.revision }),
			heroes: heroes.map((h) => ({
				id: h.id,
				team: h.team,
				...(lobby && { seatTeam: h.seatTeam, joinOrder: h.joinOrder, readyWalk: h.readyWalk }),
				heroId: h.heroId,
				abilityState: structuredClone(h.abilityState),
				dashAbility: h.dashAbility ?? null,
				statuses: wire ? packStatuses(h.statuses) : structuredClone(h.statuses ?? []),
				hp: h.hp,
				maxHp: h.maxHp,
				level: h.level,
				dead: h.dead,
				respawnTick: wire && !Number.isFinite(h.respawnTick) ? null : h.respawnTick,
				ballThrow: h.ballThrow && structuredClone(h.ballThrow),
				attack: h.attack && { ...h.attack },
				attackTick: h.attackTick,
				pos: pos(h.body),
				vel: { x: q(h.body.velocity.x), z: q(h.body.velocity.z) },
				yaw: q(h.yaw),
				order: h.order && {
					kind: h.order.kind,
					target: h.order.target,
					goal: h.order.goal && { x: q(h.order.goal.x), z: q(h.order.goal.z) },
					...(h.order.resume ? { resume: { ...h.order.resume } } : {}),
				},
				cast: h.cast && { ...structuredClone(h.cast), yaw: q(h.cast.yaw) },
				cd: h.cd.slice(),
				cancelUntil: h.cancelUntil.slice(),
				stance: h.stance && { ...h.stance },
				channel: h.channel && structuredClone(h.channel),
				recall: h.recall && structuredClone(h.recall),
				recallReady: h.recallReady,
				catchWindow: h.catchWindow && { ...h.catchWindow },
			})),
			dummies: dummies.map((d) => ({
				id: d.id,
				pos: d.dead ? null : pos(d.body),
				yaw: q(d.yaw),
				hp: d.hp,
				maxHp: d.maxHp,
				cast: d.cast && {
					ability: d.cast.ability,
					slot: d.cast.slot,
					left: d.cast.left,
					total: d.cast.total,
					yaw: q(d.cast.yaw),
					target: { x: q(d.cast.target.x), z: q(d.cast.target.z) },
				},
				...(d.boss && { target: d.target, threat: { ...d.threat } }),
				castTick: d.castTick,
				statuses: wire ? packStatuses(d.statuses) : structuredClone(d.statuses ?? []),
				dead: d.dead,
				respawnTick: wire && !Number.isFinite(d.respawnTick) ? null : d.respawnTick,
			})),
			boards: structuredClone(boards),
			cutouts: structuredClone(cutouts),
			groundFields: structuredClone(ctx.groundFields),
			summons: ctx.snapshotSummons(wire),
			zones: zones.map((z) => ({
				...structuredClone(z),
				pos: { x: q(z.x), z: q(z.z) },
				left: z.left,
				total: z.total,
			})),
			projectiles: shots.map((s) => ({
				...structuredClone(s),
				x: q(s.x),
				z: q(s.z),
				target: s.target ?? null,
				damage: s.damage,
				pos: { x: q(s.x), z: q(s.z) },
				dir: { x: q(s.dx), z: q(s.dz) },
				travelled: q(s.travelled),
			})),
		}
		if (!wire) return state
		if (lane) return projectLaneSnapshot(state)
		return state
	}

	return { snapshot }
}
