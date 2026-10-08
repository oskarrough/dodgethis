import { aimArrowSpeed } from './arrow.js'
import { WEAPONS, bowlSpeed, createChargeMeter } from './weapons.js'

// Weapon slots in the intent vocabulary: slot1 is the bow, slot2 the bowl.
export const SLOTS = Object.fromEntries(Object.entries(WEAPONS).map(([id, def]) => [def.slot, id]))

// Dodgeball's rules for a human's intent frames: weapon slots, the bow's charge, the bowl, jump and dash.
// Every human seat runs them, local or remote, one frame per participant per step. A seat's weapon outlives rounds; its meter does not.
export function createActions() {
	const seats = new Map()

	function seat(id) {
		let s = seats.get(id)
		if (!s) seats.set(id, (s = { weapon: 'bow', meter: createChargeMeter() }))
		return s
	}

	// Apply `frames` (participant id → frame) to `round` for one step and return each seat's move.
	// `consume(id, action)` acknowledges a buffered press that took effect, so it is not retried.
	function step(round, frames, dt, consume = () => {}) {
		const moves = new Map()
		for (const [id, frame] of frames) {
			const unit = round.units.find((u) => u.participantId === id)
			if (!unit) continue
			apply(round, unit, seat(id), frame, dt, (action) => consume(id, action))
			moves.set(id, frame.move)
		}
		return moves
	}

	// A replica's own seat, for its HUD and aim preview only: weapon switches and the bow's charge. Nothing fires; the authority does that.
	function preview(id, frame, dt, armed) {
		const s = seat(id)
		for (const { action } of frame.pressed) {
			if (action === 'cancel') s.meter.cancel()
			else if (SLOTS[action] && s.weapon !== SLOTS[action]) {
				s.meter.cancel()
				s.weapon = SLOTS[action]
			} else if (action === 'primary' && armed && s.weapon === 'bow') s.meter.press()
		}
		if (armed && frame.held.primary) s.meter.update(dt)
		else s.meter.cancel()
	}

	return {
		step,
		seat,
		preview,
		// Drop every charge in progress (round changes, modals, blur).
		cancel() {
			for (const s of seats.values()) s.meter.cancel()
		},
	}
}

function apply(round, unit, seat, frame, dt, consume) {
	const { meter } = seat
	const armed = !round.lobby
	const edge = (action) => frame.pressed.find((e) => e.action === action)
	for (const { action } of frame.pressed) {
		if (action === 'cancel') meter.cancel()
		else if (armed && SLOTS[action] && seat.weapon !== SLOTS[action]) {
			meter.cancel()
			seat.weapon = SLOTS[action]
		}
	}
	unit.weapon = seat.weapon

	// The bow charges while held and fires on release; the bowl fires on press.
	const press = () => {
		const e = edge('primary')
		if (!e || !unit.heldArrow) return
		if (seat.weapon === 'bow') meter.press()
		else fire(round, unit, seat, e.at ?? frame.aim)
	}
	const release = () => {
		if (frame.released.includes('primary') && seat.weapon === 'bow')
			fire(round, unit, seat, frame.aim)
	}
	if (armed) {
		// A press and a release in one step arrive unordered; `held` says which came last.
		if (frame.held.primary) {
			release()
			press()
		} else {
			press()
			release()
		}
	}
	if (edge('jump') && !round.over && unit.jump()) consume('jump')
	if (edge('dash') && !round.over && round.dashUnit(unit, frame.move)) consume('dash')

	aimAt(unit, frame.aim)
	if (!unit.alive || !unit.heldArrow || !frame.held.primary) meter.cancel()
	else meter.update(dt)
	unit.windup = meter.charging ? meter.value : 0
}

function fire(round, unit, seat, target) {
	if (!unit.alive || !unit.heldArrow || round.over) {
		seat.meter.cancel()
		return
	}
	aimAt(unit, target)
	if (seat.weapon === 'bowl') {
		round.looseArrow(unit, unit.aim, bowlSpeed(), { kind: 'bowl' })
		return
	}
	const shot = seat.meter.release()
	if (!shot) return
	// Measured from the hand, not the feet; no ground point means full power.
	const distance = target
		? Math.max(0, Math.hypot(target.x - unit.position.x, target.z - unit.position.z) - 0.6)
		: Infinity
	round.looseArrow(unit, unit.aim, aimArrowSpeed(distance, unit.handPosition().y, shot.speed), {
		kind: 'arrow',
		perfect: shot.perfect,
	})
}

// Point the unit at a ground point; no point keeps the old aim.
export function aimAt(unit, target) {
	if (!target) return
	unit.aim.set(target.x - unit.position.x, 0, target.z - unit.position.z)
	if (unit.aim.lengthSq() < 1e-6) unit.aim.set(0, 0, -1)
	unit.aim.normalize()
}
