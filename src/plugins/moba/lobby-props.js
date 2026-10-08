import * as THREE from 'three'
import { makeStyleMaterial } from '../../core/stylepass.js'
import { HEROES } from './heroes.js'
import { ICONS } from './hud.js'
import { tune } from './tune.js'
import { closest } from './skillshot.js'

// DOM-free picking: the sim offers only the footprint that actually happened,
// clipped by cover/body contact, and retains a successful result on its cast token.
export function createDifficultyGallery({ local, difficulty, present, dummies = () => [] }) {
	const v = tune.lobby.gallery
	const standees = ['easy', 'normal', 'hard'].map((id, i) => ({
		id,
		x: v.x + (i - 1) * v.spacing,
		z: v.z,
		radius: v.radius,
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
	function aimsAt(aim, radius = v.aimRadius) {
		return !!aim && standees.some((s) => Math.hypot(aim.x - s.x, aim.z - s.z) <= radius)
	}
	function contact(f) {
		if (f.hero !== local || !aimsAt(f.aim)) return false
		if (f.phase === 'aim') return true
		const centre = f.from ? { x: (f.from.x + f.to.x) / 2, z: (f.from.z + f.to.z) / 2 } : f.point
		let best = null,
			nearest = Infinity
		for (const s of standees) {
			const aimDistance = Math.hypot(f.aim.x - s.x, f.aim.z - s.z)
			if (aimDistance > v.aimRadius) continue
			if (
				dummies().some(
					(d) =>
						!d.dead &&
						Math.hypot(f.aim.x - d.body.position.x, f.aim.z - d.body.position.z) < aimDistance,
				)
			)
				continue
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

// Handmade cardboard props, not combatants. All animation reads the interpolated sim clock.
export function createLobbyProps(scene, el, gallery, readySeats, local, heroFor = () => null) {
	const v = tune.lobby.cutout
	const root = new THREE.Group()
	root.name = 'lobby-props'
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
		for (const [i, mat] of [ink, cream, ink].entries()) {
			const target = mesh(new THREE.CircleGeometry(g.radius * (1 - i / 3), v.segments), mat, card)
			target.position.set(0, g.height / 2, v.thickness / 2 + g.printGap * (i + 2))
		}
		const pad = mesh(
			new THREE.RingGeometry(g.radius, g.radius + g.ringWidth, v.segments),
			ink,
			root,
		)
		pad.rotation.x = -Math.PI / 2
		pad.position.set(stand.x, g.ringY, stand.z)
		const label = document.createElement('div')
		label.className = 'lobby-label lobby-gallery-label'
		label.dataset.difficulty = stand.id
		label.append(document.createElement('kbd'), document.createTextNode(stand.id))
		el.append(label)
		return { stand, card, pad, label }
	})
	const r = tune.lobby.ready
	const seatColors = { A: material('teamA'), B: material('teamB') }
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
		const label = document.createElement('div')
		label.className = 'lobby-seat-label'
		label.setAttribute('role', 'img')
		const portrait = document.createElement('span')
		portrait.setAttribute('aria-hidden', 'true')
		const ownerLabel = document.createElement('small')
		label.append(portrait, ownerLabel)
		el.append(label)
		return { seat, fill, cards, label, portrait, ownerLabel }
	})
	function syncSeats() {
		for (const p of seatProps) {
			const owner = p.seat.occupant,
				mine = owner?.id === local
			for (const card of p.cards) card.group.visible = !!owner?.bot && owner.heroId === card.id
			p.fill.material = mine ? picked : seatColors[p.seat.team]
			const heroId = heroFor(owner?.id)?.heroId ?? owner?.heroId
			const name = heroId ?? 'Empty'
			const who = mine ? 'You' : owner?.bot ? 'Bot' : owner ? 'Player' : 'Empty'
			if (p.portrait.dataset.hero !== (heroId ?? '')) {
				p.portrait.dataset.hero = heroId ?? ''
				p.portrait.innerHTML = ICONS[heroId] ?? ''
			}
			const accessibleName = owner ? `${name}, ${who}` : 'Empty'
			if (p.label.getAttribute('aria-label') !== accessibleName)
				p.label.setAttribute('aria-label', accessibleName)
			if (p.ownerLabel.textContent !== who) p.ownerLabel.textContent = who
			p.label.dataset.local = String(mine)
		}
	}
	// Presentation-only inspection targets: these never enter the sim's unit database.
	const inspectables = []
	const bounds = new THREE.Box3()
	function inspectTarget(id, card, position, build, visible = () => true) {
		inspectables.push({
			id,
			position,
			card: build,
			visible,
			bounds() {
				card.updateWorldMatrix(true, true)
				bounds.setFromObject(card)
				position.x = (bounds.min.x + bounds.max.x) / 2
				position.y = bounds.max.y
				position.z = (bounds.min.z + bounds.max.z) / 2
				return bounds
			},
		})
	}
	for (const p of galleryProps)
		inspectTarget('difficulty:' + p.stand.id, p.card, { x: p.stand.x, y: 0, z: p.stand.z }, () => ({
			type: 'difficulty',
			difficulty: p.stand.id,
			selected: p.stand.id === gallery.difficulty,
		}))
	for (const p of seatProps)
		for (const card of p.cards)
			inspectTarget(
				'bot:' + p.seat.id + ':' + card.id,
				card.group,
				{ x: p.seat.x, y: r.cardY, z: p.seat.z },
				() => ({ type: 'bot', heroId: card.id, seat: p.seat.id }),
				() => card.group.visible,
			)
	const point = new THREE.Vector3()
	// Left/top, not a transform: the labels' tilt and scale turn about their own centre,
	// and would swing a transform's screen offset with them.
	function place(label) {
		label.style.left = `${((point.x + 1) * innerWidth) / 2}px`
		label.style.top = `${((1 - point.y) * innerHeight) / 2}px`
	}
	function labels() {
		for (const p of galleryProps) {
			const chosen = p.stand.id === gallery.difficulty
			p.pad.visible = chosen
			p.label.dataset.picked = String(chosen)
			p.label.querySelector('kbd').hidden = !chosen
		}
	}
	labels()
	return {
		galleryProps,
		seatProps,
		inspectables,
		syncSeats,
		selectDifficulty: labels,
		setDevice(device) {
			for (const p of galleryProps)
				p.label.querySelector('kbd').textContent =
					device === 'gamepad' ? '✛↓' : device === 'keyboard' ? 'G' : ''
		},
		update(tick, camera, step) {
			syncSeats()
			for (const p of seatProps) {
				point.set(p.seat.x, r.fillY, p.seat.z).project(camera)
				p.label.hidden = point.z < -1 || point.z > 1
				place(p.label)
				const progress = readySeats.progress(p.seat, tick, step)
				p.fill.visible = progress > 0
				p.fill.scale.x = progress
				p.fill.position.x = ((progress - 1) * (r.width - r.borderWidth * 2)) / 2
			}
			for (const p of galleryProps) {
				p.card.rotation.x = gallery.angle(p.stand, tick, step)
				point.set(p.stand.x, tune.lobby.gallery.labelY, p.stand.z).project(camera)
				p.label.hidden = point.z < -1 || point.z > 1
				place(p.label)
			}
		},
		dispose() {
			root.removeFromParent()
			for (const p of [...galleryProps, ...seatProps]) p.label.remove()
			for (const item of owned) item.dispose()
		},
	}
}
