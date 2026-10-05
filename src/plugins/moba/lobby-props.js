import * as THREE from 'three'
import { makeStyleMaterial } from '../../core/stylepass.js'
import { HEROES } from './heroes.js'
import { tune } from './tune.js'
import { closest } from './skillshot.js'

// DOM-free picking: the sim offers only the footprint that actually happened,
// clipped by cover/body contact, and retains a successful result on its cast token.
export function createDifficultyGallery({ local, difficulty, present }) {
	const v = tune.lobby.gallery
	const standees = ['easy', 'normal', 'hard'].map((id, i) => ({
		id,
		x: v.x + (i - 1) * v.spacing,
		z: v.z,
		radius: v.radius,
		from: 0,
		to: 0,
		changedAt: -Infinity,
	}))
	let picked = difficulty
	function angle(stand, tick, step) {
		if (!Number.isFinite(stand.changedAt)) return stand.to
		const age = Math.max(0, Math.min(1, ((tick - stand.changedAt) * step) / v.settleTime))
		const ease = 1 - (1 - age) ** 3
		return stand.from + (stand.to - stand.from) * (ease + Math.sin(age * Math.PI) * v.overshoot)
	}
	function aimsAt(aim) {
		return !!aim && standees.some((s) => Math.hypot(aim.x - s.x, aim.z - s.z) <= v.aimRadius)
	}
	function contact(f) {
		if (f.hero !== local || !aimsAt(f.aim)) return false
		if (f.phase === 'aim') return true
		const centre = f.from ? { x: (f.from.x + f.to.x) / 2, z: (f.from.z + f.to.z) / 2 } : f.point
		let best = null,
			nearest = Infinity
		for (const s of standees) {
			if (Math.hypot(f.aim.x - s.x, f.aim.z - s.z) > v.aimRadius) continue
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
			if (distance > s.radius) continue
			const d = Math.hypot(s.x - centre.x, s.z - centre.z)
			if (d < nearest || (d === nearest && (!best || s.id < best.id))) {
				best = s
				nearest = d
			}
		}
		if (!best) return false
		picked = best.id
		for (const s of standees) {
			s.from = angle(s, f.tick, f.step)
			s.to = s.id === picked ? 0 : -Math.PI / 2
			s.changedAt = f.tick
		}
		present({
			type: 'pick',
			hero: local,
			difficulty: picked,
			cast: f.cast,
			ability: f.ability,
			footprint: f.kind,
			point: { x: best.x, y: 0, z: best.z },
			tick: f.tick,
		})
		return true
	}
	return {
		standees,
		aimsAt,
		contact,
		angle,
		get difficulty() {
			return picked
		},
	}
}

// Seat ids name boxes; participant ids name their occupants. The host can feed
// contested claims through this same function later (tick, then join order, then id).
export function createReadySeats({ present }) {
	const v = tune.lobby.ready
	const seats = ['A', 'B'].flatMap((team) =>
		Array.from({ length: 3 }, (_, index) => ({
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
		return true
	}
	return {
		seats,
		seatOf,
		contains,
		claim,
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

// Handmade cutouts, not combatants. All animation reads the interpolated sim clock.
export function createLobbyStands(scene, el, gallery, readySeats, local, onReady) {
	const v = tune.lobby.stands
	const root = new THREE.Group()
	root.name = 'lobby-stands'
	scene.add(root)
	const owned = []
	const material = (role) => {
		const m = makeStyleMaterial(role, { flat: true, side: THREE.DoubleSide })
		owned.push(m)
		return m
	}
	const ink = material('ink'),
		cream = material('cream'),
		cardboard = material('ammoShaft')
	const colors = { circle: material('teamA'), square: material('bowl') }
	const picked = material('ammo')
	function mesh(geometry, mat, parent) {
		owned.push(geometry)
		const m = new THREE.Mesh(geometry, mat)
		parent.add(m)
		return m
	}
	function shape(kind, width, height) {
		const s = new THREE.Shape()
		if (kind === 'circle') s.absellipse(0, height / 2, width / 2, height / 2, 0, Math.PI * 2)
		else {
			const points =
				kind === 'triangle'
					? [
							[-width / 2, 0],
							[width / 2, 0],
							[0, height],
						]
					: [
							[-width / 2, 0],
							[width / 2, 0],
							[width / 2, height],
							[-width / 2, height],
						]
			s.moveTo(...points[0])
			for (const p of points.slice(1)) s.lineTo(...p)
			s.closePath()
		}
		return s
	}
	function cutout(definition, group, color = null) {
		const card = new THREE.Group()
		group.add(card)
		const width = v.width * (definition.silhouette === 'bar' ? v.barWidth : 1)
		const height = v.height * (definition.silhouette === 'bar' ? v.barHeight : 1)
		const outline = shape(definition.silhouette, width, height)
		const board = mesh(
			new THREE.ExtrudeGeometry(outline, {
				depth: v.thickness,
				bevelEnabled: false,
				curveSegments: v.segments,
			}),
			cardboard,
			card,
		)
		board.position.y = v.legHeight
		const face = mesh(
			new THREE.ShapeGeometry(outline, v.segments),
			definition.playable ? (color ?? colors[definition.silhouette] ?? cream) : ink,
			card,
		)
		face.position.set(0, v.legHeight, v.thickness + v.printGap)
		for (const side of [-1, 1]) {
			const leg = mesh(new THREE.BoxGeometry(v.legWidth, v.legHeight, v.thickness), cardboard, card)
			leg.position.set(side * width * v.legSpread, v.legHeight / 2, v.thickness / 2)
			const foot = mesh(new THREE.BoxGeometry(v.footWidth, v.footHeight, v.footDepth), cream, group)
			foot.position.set(side * width * v.legSpread, v.footHeight / 2, 0)
		}
		const head = mesh(
			new THREE.CircleGeometry(v.headRadius, v.segments),
			definition.playable ? cream : ink,
			card,
		)
		head.position.set(0, v.legHeight + height + v.headRadius, v.thickness + v.printGap)
		return card
	}
	const definitions = Object.values(HEROES)
	const stands = definitions.map((definition, i) => {
		const x = (i - (definitions.length - 1) / 2) * v.spacing
		const group = new THREE.Group()
		group.position.set(x, 0, v.z)
		root.add(group)
		const card = cutout(definition, group)
		const pad = mesh(new THREE.CircleGeometry(v.radius, v.segments), cream, root)
		pad.rotation.x = -Math.PI / 2
		pad.position.set(x, v.padY, v.z + v.padForward)
		const ring = mesh(
			new THREE.RingGeometry(v.radius - v.ringWidth, v.radius, v.segments),
			ink,
			root,
		)
		ring.rotation.x = -Math.PI / 2
		ring.position.set(x, v.ringY, pad.position.z)
		const selected = mesh(
			new THREE.RingGeometry(v.radius - v.selectedWidth, v.radius, v.segments),
			picked,
			root,
		)
		selected.rotation.x = -Math.PI / 2
		selected.position.set(x, v.selectedY, pad.position.z)
		selected.visible = false
		const label = document.createElement('div')
		label.className = 'lobby-stand-label'
		label.dataset.hero = definition.id
		label.dataset.playable = String(definition.playable)
		label.innerHTML = `<span>${definition.id.replace(/^./, (c) => c.toUpperCase())}</span><small>${definition.playable ? 'Walk here' : 'soon'}</small>`
		el.append(label)
		return {
			id: definition.id,
			playable: definition.playable,
			x,
			z: pad.position.z,
			card,
			selected,
			label,
			deniedAt: -Infinity,
		}
	})
	const galleryProps = gallery.standees.map((stand) => {
		const g = tune.lobby.gallery
		const group = new THREE.Group()
		group.position.set(stand.x, v.footHeight, stand.z)
		root.add(group)
		const card = new THREE.Group()
		group.add(card)
		const board = mesh(new THREE.BoxGeometry(g.width, g.height, v.thickness), cardboard, card)
		board.position.y = g.height / 2
		const print = mesh(
			new THREE.PlaneGeometry(g.width - v.thickness, g.height - v.thickness),
			cream,
			card,
		)
		print.position.set(0, g.height / 2, v.thickness / 2 + g.printGap)
		for (const [i, mat] of [ink, cream, picked].entries()) {
			const target = mesh(new THREE.CircleGeometry(g.radius * (1 - i / 3), v.segments), mat, card)
			target.position.set(0, g.height / 2, v.thickness / 2 + g.printGap * (i + 2))
		}
		const pad = mesh(
			new THREE.RingGeometry(g.radius, g.radius + g.ringWidth, v.segments),
			picked,
			root,
		)
		pad.rotation.x = -Math.PI / 2
		pad.position.set(stand.x, g.ringY, stand.z)
		const label = document.createElement('div')
		label.className = 'lobby-stand-label lobby-gallery-label'
		label.dataset.difficulty = stand.id
		label.innerHTML = `<span>${stand.id.replace(/^./, (c) => c.toUpperCase())}</span><small>Shoot here</small>`
		el.append(label)
		return { stand, card, pad, label }
	})
	const galleryHelp = document.createElement('div')
	galleryHelp.className = 'lobby-stand-label lobby-gallery-help'
	el.append(galleryHelp)
	// The six recovery marks are real ground prints, so their camera fit is visible too.
	const mark = tune.lobby.mark
	for (const position of tune.lobby.marks) {
		const fill = mesh(new THREE.CircleGeometry(mark.radius, v.segments), cream, root)
		fill.rotation.x = -Math.PI / 2
		fill.position.set(position.x, mark.y, position.z)
		const border = mesh(
			new THREE.RingGeometry(mark.radius - mark.lineWidth, mark.radius, v.segments),
			ink,
			root,
		)
		border.rotation.x = -Math.PI / 2
		border.position.set(position.x, mark.ringY, position.z)
	}
	const r = tune.lobby.ready
	const seatColors = { A: material('teamA'), B: material('teamB') }
	for (const sign of [-1, 1]) {
		const line = mesh(
			new THREE.PlaneGeometry(r.lineInkWidth, r.lineLength).rotateX(-Math.PI / 2),
			ink,
			root,
		)
		line.position.set(sign * r.lineX, r.lineInkY, r.z)
		const chalk = mesh(
			new THREE.PlaneGeometry(r.lineWidth, r.lineLength).rotateX(-Math.PI / 2),
			cream,
			root,
		)
		chalk.position.set(sign * r.lineX, r.lineY, r.z)
	}
	const seatProps = readySeats.seats.map((seat) => {
		const group = new THREE.Group()
		group.position.set(seat.x, 0, seat.z)
		root.add(group)
		const border = mesh(new THREE.PlaneGeometry(r.width, r.depth).rotateX(-Math.PI / 2), ink, group)
		border.position.y = r.borderY
		const background = mesh(
			new THREE.PlaneGeometry(r.width - r.borderWidth * 2, r.depth - r.borderWidth * 2).rotateX(
				-Math.PI / 2,
			),
			cream,
			group,
		)
		background.position.y = r.boxY
		// The inset covers the backing print, leaving an ink frame; fill has its own layer.
		const fill = mesh(
			new THREE.PlaneGeometry(r.width - r.borderWidth * 2, r.depth - r.borderWidth * 2).rotateX(
				-Math.PI / 2,
			),
			seatColors[seat.team],
			group,
		)
		fill.position.y = r.fillY
		const cards = definitions
			.filter((d) => d.playable)
			.map((definition) => {
				const g = new THREE.Group()
				g.position.y = r.cardY
				g.scale.setScalar(r.cardScale)
				group.add(g)
				cutout(definition, g, seatColors[seat.team])
				return { id: definition.id, group: g }
			})
		const label = document.createElement('button')
		label.type = 'button'
		label.className = 'lobby-stand-label lobby-seat-label'
		label.dataset.seat = seat.id
		label.onclick = onReady
		label.innerHTML = '<span></span><small></small>'
		el.append(label)
		return { seat, fill, cards, label }
	})
	function syncSeats() {
		for (const p of seatProps) {
			const owner = p.seat.occupant,
				mine = owner?.id === local
			for (const card of p.cards) card.group.visible = !!owner?.bot && owner.heroId === card.id
			p.fill.material = mine ? picked : seatColors[p.seat.team]
			p.label.dataset.mine = String(mine)
			p.label.disabled = !mine
			const title = mine
				? 'Ready'
				: owner
					? owner.heroId.replace(/^./, (c) => c.toUpperCase())
					: 'Open'
			const help = mine
				? device === 'gamepad'
					? 'A · Start'
					: 'Enter'
				: owner?.bot
					? 'bot'
					: 'seat'
			if (p.label.firstChild.textContent !== title) p.label.firstChild.textContent = title
			if (p.label.lastChild.textContent !== help) p.label.lastChild.textContent = help
		}
	}
	const point = new THREE.Vector3()
	let device = 'keyboard'
	function labels() {
		for (const stand of stands) {
			const text = stand.selected.visible
				? `${device === 'gamepad' ? '✛↑' : 'H'} next`
				: stand.playable
					? 'Walk here'
					: 'soon'
			const small = stand.label.querySelector('small')
			if (small.textContent !== text) small.textContent = text
		}
		const help = `Shoot · ${device === 'gamepad' ? '✛↓' : 'G'} next`
		if (galleryHelp.textContent !== help) galleryHelp.textContent = help
		for (const p of galleryProps) {
			const chosen = p.stand.id === gallery.difficulty
			p.pad.visible = chosen
			p.label.dataset.picked = String(chosen)
			const text = chosen ? `${device === 'gamepad' ? '✛↓' : 'G'} next` : 'Shoot here'
			const small = p.label.querySelector('small')
			if (small.textContent !== text) small.textContent = text
		}
	}
	return {
		stands,
		galleryProps,
		seatProps,
		syncSeats,
		selectDifficulty: labels,
		select(id) {
			for (const stand of stands) {
				stand.selected.visible = stand.id === id
				stand.label.dataset.picked = String(stand.id === id)
			}
			labels()
		},
		setDevice(next) {
			device = next
			labels()
			syncSeats()
		},
		deny(id, tick) {
			stands.find((stand) => stand.id === id).deniedAt = tick
		},
		update(tick, camera, step) {
			for (const p of seatProps) {
				const progress = readySeats.progress(p.seat, tick, step)
				p.fill.visible = progress > 0
				p.fill.scale.x = progress
				p.fill.position.x = ((progress - 1) * (r.width - r.borderWidth * 2)) / 2
				point
					.set(
						p.seat.x + (p.seat.team === 'A' ? -1 : 1) * r.labelOutward,
						r.labelY,
						p.seat.z + r.labelForward,
					)
					.project(camera)
				p.label.style.transform = `translate(${((point.x + 1) * innerWidth) / 2}px, ${((1 - point.y) * innerHeight) / 2}px) translate(-50%, -50%)`
			}
			point
				.set(tune.lobby.gallery.x, tune.lobby.gallery.helpY, tune.lobby.gallery.z)
				.project(camera)
			galleryHelp.style.transform = `translate(${((point.x + 1) * innerWidth) / 2}px, ${((1 - point.y) * innerHeight) / 2}px) translate(-50%, -50%)`
			for (const p of galleryProps) {
				p.card.rotation.x = gallery.angle(p.stand, tick, step)
				point.set(p.stand.x, tune.lobby.gallery.labelY, p.stand.z).project(camera)
				p.label.hidden = point.z < -1 || point.z > 1
				p.label.style.transform = `translate(${((point.x + 1) * innerWidth) / 2}px, ${((1 - point.y) * innerHeight) / 2}px) translate(-50%, -50%)`
			}
			for (const stand of stands) {
				const age = (tick - stand.deniedAt) * step
				const f = Math.max(0, 1 - age / v.wobbleTime)
				stand.card.rotation.z =
					f > 0
						? Math.sin((age / v.wobbleTime) * v.wobbleTurns * Math.PI * 2) * v.wobbleAngle * f
						: 0
				point.set(stand.x, v.labelY, v.z + v.labelForward).project(camera)
				stand.label.hidden = point.z < -1 || point.z > 1
				stand.label.style.transform = `translate(${((point.x + 1) * innerWidth) / 2}px, ${((1 - point.y) * innerHeight) / 2}px) translate(-50%, -50%)`
			}
		},
		dispose() {
			root.removeFromParent()
			for (const stand of stands) stand.label.remove()
			for (const p of galleryProps) p.label.remove()
			galleryHelp.remove()
			for (const p of seatProps) p.label.remove()
			for (const item of owned) item.dispose()
		},
	}
}
