import { tune } from './tune.js'
import { closest } from './skillshot.js'

// How far a footprint's edge falls short of the point s (x, z), in metres: a shot's swept segment,
// a zone's disc or a cone's wedge. Zero or less touches.
function reach(f, s) {
	let distance = f.from
		? closest(f.from.x, f.from.z, f.to.x, f.to.z, s.x, s.z).d - f.radius
		: Math.hypot(s.x - f.point.x, s.z - f.point.z) - f.radius
	if (f.dir && f.angle < 360) {
		const dx = s.x - f.point.x,
			dz = s.z - f.point.z
		const len = Math.hypot(dx, dz)
		const half = (f.angle * Math.PI) / 360
		if ((dx * f.dir.x + dz * f.dir.z) / (len || 1) < Math.cos(half)) {
			distance = Math.min(
				...[-1, 1].map((sign) => {
					const a = Math.atan2(f.dir.x, f.dir.z) + sign * half
					return closest(
						f.point.x,
						f.point.z,
						f.point.x + Math.sin(a) * f.radius,
						f.point.z + Math.cos(a) * f.radius,
						s.x,
						s.z,
					).d
				}),
			)
		}
	}
	return distance
}

// DOM-free picking: three plates on the floor, and the local hero standing on one has chosen it.
// The pick is answered the same tick the hero's feet cross the plate's edge.
export function createDifficultyGallery({ local, difficulty, present }) {
	const v = tune.lobby.gallery
	const standees = ['easy', 'normal', 'hard'].map((id, i) => ({
		id,
		x: v.x + (i - 1) * v.spacing,
		z: v.z,
		from: id === difficulty ? 0 : -Math.PI / 2,
		to: id === difficulty ? 0 : -Math.PI / 2,
		changedAt: -Infinity,
	}))
	let picked = difficulty
	function angle(stand, tick, step) {
		if (!Number.isFinite(stand.changedAt)) return stand.to
		const age = Math.max(0, Math.min(1, ((tick - stand.changedAt) * step) / v.settleTime))
		const ease = 1 - (1 - age) ** 3
		return stand.from + (stand.to - stand.from) * (ease + Math.sin(age * Math.PI) * v.overshoot)
	}
	// Which plate the point (x, z) stands on, if any.
	function under(x, z) {
		return standees.find(
			(s) => Math.abs(x - s.x) <= v.plate.halfX && Math.abs(z - s.z) <= v.plate.halfZ,
		)
	}
	// Called every tick with the local hero's feet: stepping onto a plate other than the picked one picks it.
	function stand(hero, tick, step) {
		if (!hero || hero.dead || hero.body.dashing) return
		const p = hero.body.position
		const plate = under(p.x, p.z)
		if (!plate || plate.id === picked) return
		select(plate.id, tick, step)
		present({
			type: 'pick',
			hero: local,
			difficulty: picked,
			point: { x: plate.x, y: 0, z: plate.z },
			tick,
		})
	}
	function select(id, tick, step) {
		picked = id
		for (const s of standees) {
			s.from = angle(s, tick, step)
			s.to = s.id === picked ? 0 : -Math.PI / 2
			s.changedAt = tick
		}
	}
	return {
		standees,
		select,
		stand,
		under,
		angle,
		get difficulty() {
			return picked
		},
	}
}

// The bell in its arch by the tear: anyone's attack or ability aimed at it and touching it rings it.
// The sim offers each footprint once; a ring is a `bell` fact, which the view swings and sounds.
export function createBell({ present }) {
	const v = tune.lobby.bell
	const bell = { x: v.x, z: v.z, radius: v.radius }
	function contact(f) {
		if (!f.aim || Math.hypot(f.aim.x - bell.x, f.aim.z - bell.z) > v.aimRadius) return false
		if (f.phase === 'aim') return true
		if (reach(f, bell) > bell.radius) return false
		present({
			type: 'bell',
			hero: f.hero,
			ability: f.ability,
			footprint: f.kind,
			point: { x: bell.x, y: 0, z: bell.z },
			from: f.from ?? f.point,
			tick: f.tick,
		})
		return true
	}
	return { ...bell, contact }
}
