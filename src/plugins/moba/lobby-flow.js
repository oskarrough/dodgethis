import * as THREE from 'three'
import { PALETTE } from '../../core/style.js'
import { FORWARD_LAYER } from '../../core/stylepass.js'
import { tune } from './tune.js'

// What the plates are for, shown rather than said: bots walk onto their plates as you arrive, your
// own plate ripples until you stand in it, and every glazed plate sends its light to the weather bowl.
// `?flow=` picks the look (motes, thread, off); off is the lobby without any of it. Read at load,
// before the splash rewrites the address, so it holds through the splash and back from a match.
const askedFlow = new URLSearchParams(globalThis.location?.search).get('flow')
export function lobbyFlowStyle() {
	return ['motes', 'thread', 'off'].includes(askedFlow) ? askedFlow : tune.lobby.flow.style
}

// A rounded rectangle laid flat, centred on its group.
function plateShape(width, depth, corner) {
	const w = width / 2,
		d = depth / 2,
		c = Math.min(corner, w, d)
	const s = new THREE.Shape()
	s.moveTo(-w + c, -d)
	s.lineTo(w - c, -d)
	s.quadraticCurveTo(w, -d, w, -d + c)
	s.lineTo(w, d - c)
	s.quadraticCurveTo(w, d, w - c, d)
	s.lineTo(-w + c, d)
	s.quadraticCurveTo(-w, d, -w, d - c)
	s.lineTo(-w, -d + c)
	s.quadraticCurveTo(-w, -d, -w + c, -d)
	return new THREE.ShapeGeometry(s, 6).rotateX(-Math.PI / 2)
}

const moteShader = {
	vertexShader: `
		attribute float aAlpha;
		uniform float uSize;
		varying float vAlpha;
		void main() {
			vAlpha = aAlpha;
			vec4 view = modelViewMatrix * vec4(position, 1.0);
			gl_PointSize = uSize / -view.z;
			gl_Position = projectionMatrix * view;
		}`,
	fragmentShader: `
		uniform vec3 uColor;
		varying float vAlpha;
		void main() {
			// Solid team sparks with a pale heart: the saucer is cream, so light alone would vanish.
			float d = length(gl_PointCoord - 0.5) * 2.0;
			float heart = smoothstep(0.55, 0.0, d);
			gl_FragColor = vec4(mix(uColor * 0.9, vec3(1.0), heart * 0.6), smoothstep(1.0, 0.75, d) * vAlpha);
		}`,
}

const threadShader = {
	vertexShader: `
		varying float vAlong;
		void main() {
			vAlong = uv.x;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}`,
	fragmentShader: `
		uniform vec3 uColor;
		uniform float uReveal;
		uniform float uTime;
		uniform float uPulses;
		varying float vAlong;
		void main() {
			if (vAlong > uReveal) discard;
			float pulse = pow(0.5 + 0.5 * sin((vAlong * uPulses - uTime) * 6.2832), 6.0);
			float tip = smoothstep(uReveal - 0.04, uReveal, vAlong);
			gl_FragColor = vec4(mix(uColor, vec3(1.0), max(pulse * 0.6, tip)), 0.45 + 0.55 * max(pulse, tip));
		}`,
}

export function createLobbyFlow(scene, readySeats, local, style = lobbyFlowStyle()) {
	const f = tune.lobby.flow,
		r = tune.lobby.ready,
		b = tune.lobby.bowl
	const on = style !== 'off'
	const root = new THREE.Group()
	root.name = 'lobby-flow'
	scene.add(root)
	const owned = []
	const own = (...items) => (owned.push(...items), items[0])
	const forward = (object) => {
		object.layers.set(FORWARD_LAYER)
		object.frustumCulled = false
		root.add(object)
		return object
	}
	const color = (team) => new THREE.Color(PALETTE[team === 'A' ? 'teamA' : 'teamB'])
	// Each plate's arc: up off the plate, over the saucer, down into the bowl's mouth.
	const mouth = new THREE.Vector3(b.x, b.height + f.mouth, b.z)
	const lanes = readySeats.seats.map((seat) => {
		const from = new THREE.Vector3(seat.x, r.fillY, seat.z)
		const mid = from.clone().lerp(mouth, 0.5)
		mid.y += f.arc + from.distanceTo(mouth) * f.arcPerMetre
		const curve = new THREE.QuadraticBezierCurve3(from, mid, mouth)
		const lane = { seat, curve, startedAt: null }
		if (style === 'motes') {
			const positions = new Float32Array(f.motes.count * 3)
			const alphas = new Float32Array(f.motes.count)
			const geometry = own(new THREE.BufferGeometry())
			geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
			geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1))
			const material = own(
				new THREE.ShaderMaterial({
					...moteShader,
					uniforms: {
						uColor: { value: color(seat.team) },
						uSize: { value: 0 },
					},
					transparent: true,
					depthWrite: false,
				}),
			)
			lane.motes = forward(new THREE.Points(geometry, material))
			lane.positions = positions
			lane.alphas = alphas
		}
		if (style === 'thread') {
			const material = own(
				new THREE.ShaderMaterial({
					...threadShader,
					uniforms: {
						uColor: { value: color(seat.team) },
						uReveal: { value: 0 },
						uTime: { value: 0 },
						uPulses: { value: f.thread.pulses },
					},
					transparent: true,
					depthWrite: false,
				}),
			)
			const geometry = own(new THREE.TubeGeometry(curve, 64, f.thread.radius, 6))
			lane.thread = forward(new THREE.Mesh(geometry, material))
		}
		return lane
	})
	// Your plate ripples out from under its rim until you stand in it.
	const ripple = forward(
		new THREE.Mesh(
			own(plateShape(r.width, r.depth, r.corner)),
			own(
				new THREE.MeshBasicMaterial({
					color: PALETTE.ammo,
					transparent: true,
					depthWrite: false,
					polygonOffset: true,
					polygonOffsetFactor: -1,
					polygonOffsetUnits: -4,
				}),
			),
		),
	)
	ripple.position.y = tune.map.printLayers.lobby
	ripple.renderOrder = -2
	ripple.visible = false
	// Bots walk on: each from where it last stood (the saucer's middle when new), one after another.
	const arrivals = new Map() // bot id → { seat, from, at }
	let start = null,
		queued = 0
	function arrive(seat, time) {
		const bot = seat.occupant
		const known = arrivals.get(bot.id)
		if (known?.seat === seat.id) return known
		const was = known && readySeats.seats.find((s) => s.id === known.seat)
		const from = was ? { x: was.x, z: was.z } : { x: seat.x * f.walk.from, z: seat.z }
		const first = time - start < f.walk.delay
		const at = first ? start + f.walk.delay + queued++ * f.walk.stagger : time
		const entry = { seat: seat.id, from, at }
		arrivals.set(bot.id, entry)
		return entry
	}
	function walkOf(seat, time) {
		if (!on || !seat.occupant?.bot) return null
		const a = arrive(seat, time)
		const k = Math.max(0, Math.min(1, (time - a.at) / f.walk.time))
		return { a, k }
	}
	let now = 0
	return {
		style,
		// Where a bot's hologram stands on its way to its plate, relative to the plate; null once on it.
		offset(seat) {
			const w = walkOf(seat, now)
			if (!w || w.k >= 1) return null
			const e = 1 - (1 - w.k) ** 2
			return {
				x: (w.a.from.x - seat.x) * (1 - e),
				z: (w.a.from.z - seat.z) * (1 - e),
				y: Math.abs(Math.sin(w.k * Math.PI * f.walk.hops)) * f.walk.hop,
				hidden: now < w.a.at,
			}
		},
		// A bot's plate glazes over once it has stepped on, like yours does.
		progress(seat, progress) {
			const w = walkOf(seat, now)
			if (!w) return progress
			return Math.max(0, Math.min(1, (now - w.a.at - f.walk.time) / r.fillTime))
		},
		update(time, progressOf) {
			now = time
			start ??= time
			if (!on) return
			const mine = readySeats.seatOf(local)
			ripple.visible = !!mine && progressOf(mine) === 0
			if (ripple.visible) {
				const k = (time / f.ripple.period) % 1
				ripple.position.x = mine.x
				ripple.position.z = mine.z
				ripple.scale.set(1 + k * f.ripple.grow, 1, 1 + (k * f.ripple.grow * r.width) / r.depth)
				ripple.material.opacity = f.ripple.opacity * (1 - k) ** 2
			}
			for (const lane of lanes) {
				const progress = progressOf(lane.seat)
				if (progress <= 0) lane.startedAt = null
				else lane.startedAt ??= time
				if (lane.thread) {
					lane.thread.visible = progress > 0
					lane.thread.material.uniforms.uReveal.value = progress
					lane.thread.material.uniforms.uTime.value = time * f.thread.speed
				}
				if (lane.motes) {
					const m = f.motes
					lane.motes.visible = lane.startedAt !== null
					if (!lane.motes.visible) continue
					lane.motes.material.uniforms.uSize.value = m.size * innerHeight * devicePixelRatio
					const flown = (time - lane.startedAt) / m.flight
					for (let i = 0; i < m.count; i++) {
						// Mote i leaves i/count of a flight after the first, and loops for as long as the plate glows.
						const u = flown - i / m.count
						const t = ((u % 1) + 1) % 1
						const live = u >= 0 && i < Math.ceil(m.count * progress)
						const p = lane.curve.getPoint(t)
						const sway = Math.sin(t * Math.PI) * m.sway
						lane.positions[i * 3] = p.x + Math.sin(i * 2.4 + time * 3) * sway
						lane.positions[i * 3 + 1] = p.y + Math.cos(i * 1.7 + time * 2.6) * sway
						lane.positions[i * 3 + 2] = p.z + Math.sin(i * 3.1 + time * 2.2) * sway
						// Fade in off the plate and out into the bowl.
						lane.alphas[i] = live ? Math.min(1, t * 8, (1 - t) * 6) : 0
					}
					lane.motes.geometry.attributes.position.needsUpdate = true
					lane.motes.geometry.attributes.aAlpha.needsUpdate = true
				}
			}
		},
		dispose() {
			root.removeFromParent()
			for (const item of owned) item.dispose()
		},
	}
}
