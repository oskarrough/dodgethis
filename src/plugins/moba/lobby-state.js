import { HEROES } from './heroes.js'
import { tune } from './tune.js'
import { practiceRoster } from './bots.js'

// Seat ids name boxes; participant ids name their occupants. Host claims resolve
// by tick, then join order, then id; starting reservations have no claim tick.
export function createReadySeats({ present }) {
	const v = tune.lobby.ready
	const seats = ['A', 'B'].flatMap((team) =>
		Array.from({ length: tune.lobby.capacity / ['A', 'B'].length }, (_, index) => ({
			id: `${team}:${index}`,
			team,
			x: (team === 'A' ? -1 : 1) * v.x,
			z: v.z + (index - 1) * v.spacing,
			occupant: null,
			claimTick: null,
			inside: false,
			enteredAt: null,
			full: false,
			blocked: false,
		})),
	)
	let humans = []
	const enteredSeats = new Map()
	const seatOf = (id) => seats.find((s) => s.occupant?.id === id)
	const contains = (seat, p) =>
		!!p && Math.abs(p.x - seat.x) <= v.width / 2 && Math.abs(p.z - seat.z) <= v.depth / 2
	const fact = (type, seat, tick) =>
		present({
			type,
			hero: seat.occupant.id,
			seat: seat.id,
			tick,
			point: { x: seat.x, y: v.fillY, z: seat.z },
		})
	function reset(seat) {
		seat.enteredAt = null
		seat.inside = false
		seat.full = !!seat.occupant?.bot
	}
	function claim(seatId, participant, tick) {
		const seat = seats.find((s) => s.id === seatId)
		if (
			!seat ||
			!participant?.id ||
			!HEROES[participant.heroId]?.playable ||
			!Number.isInteger(tick) ||
			tick < 0 ||
			!Number.isInteger(participant.joinOrder) ||
			participant.joinOrder < 0
		)
			return false
		const current = seat.occupant
		if (current?.id === participant.id) {
			if (current.heroId !== participant.heroId || current.bot !== !!participant.bot) {
				const changedKind = current.bot !== !!participant.bot
				current.heroId = participant.heroId
				current.bot = !!participant.bot
				current.joinOrder = participant.joinOrder
				if (changedKind) reset(seat)
				fact('seatClaim', seat, tick)
			}
			return true
		}
		const wins =
			!current ||
			seat.claimTick === null ||
			(current.bot && !participant.bot) ||
			(current.bot === !!participant.bot &&
				(tick < seat.claimTick ||
					(tick === seat.claimTick &&
						(participant.joinOrder < current.joinOrder ||
							(participant.joinOrder === current.joinOrder && participant.id < current.id)))))
		if (!wins) {
			present({ type: 'seatDenied', hero: participant.id, seat: seatId, tick })
			return false
		}
		const previous = seatOf(participant.id)
		if (previous) {
			previous.occupant = null
			previous.claimTick = null
			previous.blocked = false
			reset(previous)
		}
		seat.occupant = {
			id: participant.id,
			heroId: participant.heroId,
			bot: !!participant.bot,
			joinOrder: participant.joinOrder,
		}
		seat.claimTick = tick
		seat.blocked = false
		reset(seat)
		fact('seatClaim', seat, tick)
		const vacant = previous ?? seats.find((s) => !s.occupant)
		if (current?.bot && vacant) claim(vacant.id, current, tick)
		return true
	}
	return {
		seats,
		seatOf,
		contains,
		claim,
		release(id, tick) {
			humans = humans.filter((human) => human !== id)
			enteredSeats.delete(id)
			const seat = seatOf(id)
			if (!seat) return
			fact('seatEmpty', seat, tick)
			seat.occupant = null
			seat.claimTick = null
			seat.blocked = false
			reset(seat)
		},
		cancel(id, tick) {
			const seat = seatOf(id)
			if (!seat) return
			if (seat.enteredAt !== null) fact('seatEmpty', seat, tick)
			reset(seat)
			seat.blocked = true // cancelling inside a box cannot load a second later
		},
		resume(id) {
			const seat = seatOf(id)
			if (seat) seat.blocked = false
		},
		step(tick, step, heroes) {
			humans = heroes.map((h) => h.id)
			for (const hero of heroes
				.slice()
				.sort(
					(a, b) =>
						(a.joinOrder ?? 0) - (b.joinOrder ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
				)) {
				if (hero.dead) {
					enteredSeats.delete(hero.id)
					continue
				}
				const entered = seats.find((s) => contains(s, hero.body.position))
				const previous = enteredSeats.get(hero.id)
				enteredSeats.set(hero.id, entered?.id)
				if (entered && (previous !== entered.id || !entered.occupant)) {
					if (entered.occupant?.id === hero.id && entered.claimTick === null)
						entered.claimTick = tick
					claim(
						entered.id,
						{
							id: hero.id,
							heroId: hero.heroId,
							joinOrder: hero.joinOrder ?? 0,
							bot: false,
						},
						tick,
					)
				}
			}
			for (const seat of seats) {
				if (!seat.occupant || seat.occupant.bot) continue
				const hero = heroes.find((h) => h.id === seat.occupant.id)
				const inside = hero && !hero.dead && contains(seat, hero.body.position)
				if (!inside) {
					if (seat.enteredAt !== null) fact('seatEmpty', seat, tick)
					reset(seat)
					seat.blocked = false
					continue
				}
				seat.inside = true
				if (seat.blocked) continue
				if (seat.enteredAt === null) {
					seat.enteredAt = tick
					fact('seatEnter', seat, tick)
				}
				if (!seat.full && (tick - seat.enteredAt) * step >= v.fillTime) {
					seat.full = true
					fact('seatReady', seat, tick)
				}
			}
		},
		progress(seat, tick, step) {
			return seat.full
				? 1
				: seat.enteredAt === null
					? 0
					: Math.max(0, Math.min(1, ((tick - seat.enteredAt) * step) / v.fillTime))
		},
		laneRoster(local, difficulty, seed) {
			const picks = Object.fromEntries(
				seats
					.filter((s) => s.occupant)
					.map((s) => [s.occupant.id, { heroId: s.occupant.heroId, team: s.team }]),
			)
			const humans = seats.filter((s) => s.occupant && !s.occupant.bot).map((s) => s.occupant.id)
			const roster = practiceRoster(local, difficulty, picks, seed, humans)
			const used = new Set()
			return seats.map((box) => {
				const participant = box.occupant
					? roster.find((p) => p.id === box.occupant.id)
					: roster.find((p) => p.team === box.team && !picks[p.id] && !used.has(p.id))
				used.add(participant.id)
				return {
					...participant,
					...(box.occupant && { joinOrder: box.occupant.joinOrder }),
					controller: box.occupant && !box.occupant.bot ? 'human' : 'bot',
				}
			})
		},
		allReady() {
			return (
				humans.length > 0 &&
				humans.every((id) => {
					const seat = seatOf(id)
					return seat && !seat.occupant.bot && seat.full
				})
			)
		},
	}
}
