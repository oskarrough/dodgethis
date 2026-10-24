import * as THREE from 'three'

// Nine hit-feel sketches on one renderer: each tile is its own scene drawn into its rect with the scissor.
// Blue lunges at red every PERIOD seconds; the blow lands at HIT, and each sketch reacts to it.
const C = {
	court: 0xd4cea9,
	ink: 0x26445f,
	cream: 0xfffdf4,
	blue: 0x5db4ff,
	red: 0xff5d5d,
	shade: 0x968a9e,
}
const PERIOD = 2.2
const HIT = 0.55
const easeOut = (x) => 1 - (1 - x) ** 3
const clamp01 = (x) => Math.min(1, Math.max(0, x))

const canvas = document.getElementById('gl')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setScissorTest(true)

const ramp = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat)
ramp.magFilter = ramp.minFilter = THREE.NearestFilter
ramp.needsUpdate = true
const toon = (color) => new THREE.MeshToonMaterial({ color, gradientMap: ramp })
const flat = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, ...extra })
const inkHull = new THREE.MeshBasicMaterial({ color: C.ink, side: THREE.BackSide })
const creamFlat = flat(C.cream)
const inkFlat = flat(C.ink)

function outlined(geometry, material, hull = 1.09) {
	const g = new THREE.Group()
	const m = new THREE.Mesh(geometry, material)
	const h = new THREE.Mesh(geometry, inkHull)
	h.scale.setScalar(hull)
	g.add(m, h)
	g.userData.skin = m
	return g
}

function unit(color) {
	const root = new THREE.Group()
	const disc = new THREE.Mesh(new THREE.CircleGeometry(0.62, 40).rotateX(-Math.PI / 2), flat(color))
	disc.position.y = 0.012
	const rim = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.7, 40).rotateX(-Math.PI / 2), inkFlat)
	rim.position.y = 0.013
	const pose = new THREE.Group() // squash and lean live here, the disc stays put
	const body = outlined(new THREE.CapsuleGeometry(0.34, 0.5, 6, 16), toon(0xe9dcc4))
	body.position.y = 0.62
	const band = outlined(new THREE.CylinderGeometry(0.36, 0.36, 0.14, 20), toon(color), 1.06)
	band.position.y = 0.55
	const horn = outlined(new THREE.ConeGeometry(0.1, 0.32, 5), toon(0xe9dcc4), 1.15)
	horn.position.set(0, 1.2, 0.08)
	horn.rotation.x = 0.4
	pose.add(body, band, horn)
	root.add(disc, rim, pose)
	root.userData = { pose, skins: [body.userData.skin, horn.userData.skin], skinColor: 0xe9dcc4 }
	return root
}

// One tile: court, two units, its own camera. `fx` reacts to the blow.
function tile(fx) {
	const scene = new THREE.Scene()
	scene.background = new THREE.Color(C.shade)
	scene.add(new THREE.AmbientLight(0xffffff, 1.1))
	const sun = new THREE.DirectionalLight(0xfff1dc, 2.2)
	sun.position.set(-4, 8, 3)
	scene.add(sun)
	const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 10).rotateX(-Math.PI / 2), flat(C.court))
	scene.add(floor)
	const a = unit(C.blue)
	const b = unit(C.red)
	a.position.set(-1.5, 0, 0)
	b.position.set(1.1, 0, 0)
	a.rotation.y = Math.PI / 2
	b.rotation.y = -Math.PI / 2
	scene.add(a, b)
	const camera = new THREE.PerspectiveCamera(34, 4 / 3, 0.1, 60)
	const base = new THREE.Vector3(0.25, 4.6, 2.9) // the match camera's 58°, pulled in
	camera.position.copy(base)
	camera.lookAt(0.25, 0.4, 0)
	const t = {
		fx,
		scene,
		floor,
		camera,
		base,
		fov: 34,
		a,
		b,
		time: 0, // world clock, frozen by hit-stop
		freeze: 0,
		since: Infinity, // world seconds since the blow
		shake: 0,
		shakeDir: new THREE.Vector3(),
		frame: 0,
		el: null,
	}
	fx.setup?.(t)
	return t
}

// Flash a unit's skin cream for `s` seconds.
function flashUnit(u, s) {
	u.userData.flash = s
}

const star = (points, outer, inner) => {
	const s = new THREE.Shape()
	for (let i = 0; i < points * 2; i++) {
		const r = i % 2 ? inner : outer
		const a = (i / (points * 2)) * Math.PI * 2
		s[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r)
	}
	return new THREE.ShapeGeometry(s)
}

const ringErode = new THREE.ShaderMaterial({
	uniforms: { uK: { value: 0 } },
	transparent: true,
	depthWrite: false,
	vertexShader: `varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
	fragmentShader: `
		uniform float uK; varying vec2 vUv; varying vec3 vP;
		float h(float n){ return fract(sin(n)*43758.5453); }
		float noise(float x){ float i=floor(x), f=fract(x); return mix(h(i),h(i+1.),f*f*(3.-2.*f)); }
		void main(){
			float r = length(vP.xz);
			float a = atan(vP.z, vP.x);
			float band = (r - 0.82) / 0.18; // 0 inner edge, 1 outer edge of the ring geometry
			float n = noise(a*7.0 + 3.0) * 0.6 + noise(a*19.0) * 0.4;
			float cut = uK * 1.25 - 0.15;
			if (n < cut) discard;
			// ink keyline on both edges and along the eroded break
			bool edge = band < 0.22 || band > 0.78 || n < cut + 0.06;
			gl_FragColor = vec4(edge ? vec3(0.149,0.267,0.373) : vec3(1.0,0.992,0.957), 1.0);
		}`,
})

const smearMat = new THREE.ShaderMaterial({
	uniforms: { uHead: { value: 0 }, uTail: { value: 0 } },
	side: THREE.DoubleSide,
	transparent: true,
	depthWrite: false,
	vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
	fragmentShader: `
		uniform float uHead, uTail; varying vec2 vUv;
		void main(){
			float s = vUv.x; // along the arc
			if (s > uHead || s < uTail) discard;
			float k = (s - uTail) / max(0.001, uHead - uTail); // 0 tail, 1 head
			float w = mix(0.15, 1.0, k); // thin tail, fat head
			float d = abs(vUv.y - 0.5) * 2.0;
			if (d > w) discard;
			gl_FragColor = vec4(d > w - 0.28 ? vec3(0.149,0.267,0.373) : vec3(1.0,0.992,0.957), 1.0);
		}`,
})

function arcGeometry(radius, width, from, to, segments = 48) {
	const pos = []
	const uv = []
	const idx = []
	for (let i = 0; i <= segments; i++) {
		const s = i / segments
		const a = from + (to - from) * s
		for (const [j, r] of [radius - width / 2, radius + width / 2].entries()) {
			pos.push(Math.cos(a) * r, 0, Math.sin(a) * r)
			uv.push(s, j)
		}
		if (i < segments) {
			const k = i * 2
			idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
		}
	}
	const g = new THREE.BufferGeometry()
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
	g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
	g.setIndex(idx)
	return g
}

function crackGeometry(seed) {
	// Jagged ink strokes radiating from the impact, as thin triangles strips.
	const pos = []
	let s = seed
	const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
	for (let arm = 0; arm < 6; arm++) {
		let a = (arm / 6) * Math.PI * 2 + rnd() * 0.6
		let x = Math.cos(a) * 0.35
		let z = Math.sin(a) * 0.35
		let w = 0.07
		const len = 3 + Math.floor(rnd() * 3)
		for (let i = 0; i < len; i++) {
			a += (rnd() - 0.5) * 0.9
			const step = 0.22 + rnd() * 0.2
			const nx = x + Math.cos(a) * step
			const nz = z + Math.sin(a) * step
			const px = -Math.sin(a) * w
			const pz = Math.cos(a) * w
			const nw = w * 0.7
			const qx = -Math.sin(a) * nw
			const qz = Math.cos(a) * nw
			pos.push(x + px, 0, z + pz, x - px, 0, z - pz, nx + qx, 0, nz + qz)
			pos.push(x - px, 0, z - pz, nx - qx, 0, nz - qz, nx + qx, 0, nz + qz)
			x = nx
			z = nz
			w = nw
		}
	}
	const g = new THREE.BufferGeometry()
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
	return g
}

// The sketches. Each caption says what it is, where it comes from and what it costs us.
const SKETCHES = [
	{
		title: 'Hit pause',
		text: 'The world holds for 90 ms when the blow lands, the struck unit prints cream, the camera jolts. Smash and every fighting game since Street Fighter II.',
		note: 'look.md says "no hit-stop" today; it would need lifting for heavy hits.',
		hit(t) {
			t.freeze = 0.09
			flashUnit(t.b, 0.07)
			t.shake = 0.12
		},
	},
	{
		title: 'Impact frame',
		text: 'For three frames the whole picture turns two-tone: cream shapes on ink, then ink on cream. The anime impact frame, used by Guilty Gear and Hi-Fi Rush for the biggest blows.',
		note: 'Ultimates and takedowns only, or it tires the eye.',
		hit(t) {
			t.freeze = 0.07
			t.impact = 3
		},
	},
	{
		title: 'Ink starburst',
		text: 'A flat eight-point star with a thick ink keyline pops at the point of contact and steps away in three sizes. Already written into look.md and never built.',
		note: 'The cheapest of the nine and the most on-brand.',
		setup(t) {
			const g = new THREE.Group()
			const back = new THREE.Mesh(star(8, 0.8, 0.38), inkFlat)
			const front = new THREE.Mesh(star(8, 0.62, 0.26), creamFlat)
			front.position.z = 0.01
			g.add(back, front)
			g.visible = false
			t.scene.add(g)
			t.starburst = g
		},
		hit(t) {
			t.freeze = 0.05
			flashUnit(t.b, 0.07)
			t.starburst.rotation.z = Math.random() * Math.PI
		},
		update(t) {
			const g = t.starburst
			const s = t.since
			g.visible = s < 0.24
			if (!g.visible) return
			g.position.set(t.b.position.x - 0.35, 0.85, t.b.position.z)
			g.quaternion.copy(t.camera.quaternion)
			// pop in over two frames, then step down instead of easing: printed, not tweened
			const size = s < 0.03 ? 1.25 : s < 0.1 ? 1 : s < 0.17 ? 0.7 : 0.4
			g.scale.setScalar(size)
		},
	},
	{
		title: 'Eroding shockwave',
		text: 'A cream ring with inked edges rushes out along the floor and breaks apart as it goes, eaten by noise rather than faded. The stylised-VFX staple of Gabriel Aguiar and Riot.',
		note: 'Must never be mistaken for a telegraph: cream only, and gone in 0.3 s.',
		setup(t) {
			const m = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 72).rotateX(-Math.PI / 2), ringErode.clone())
			m.position.y = 0.02
			m.visible = false
			t.scene.add(m)
			t.wave = m
		},
		hit(t) {
			t.freeze = 0.04
			flashUnit(t.b, 0.07)
		},
		update(t) {
			const k = t.since / 0.32
			t.wave.visible = k < 1
			if (!t.wave.visible) return
			t.wave.position.x = t.b.position.x
			t.wave.scale.setScalar(0.5 + 1.3 * easeOut(k))
			t.wave.material.uniforms.uK.value = k
		},
	},
	{
		title: 'Smear arc',
		text: 'The swing leaves a crescent that is fat at its head and thin at its tail, drawn on for two frames and wiped off from behind. The smear frame of a Looney Tunes punch, as Hades and Hollow Knight draw it.',
		note: 'Belongs to melee: Swing, Slam, Palm strike, Tag out.',
		setup(t) {
			const m = new THREE.Mesh(arcGeometry(1.0, 0.42, -1.2, 1.2), smearMat.clone())
			m.visible = false
			t.scene.add(m)
			t.smear = m
		},
		hit(t) {
			t.freeze = 0.06
			flashUnit(t.b, 0.07)
		},
		update(t) {
			const s = t.time % PERIOD
			const k = (s - (HIT - 0.12)) / 0.3
			t.smear.visible = k > 0 && k < 1
			if (!t.smear.visible) return
			t.smear.position.set(t.a.position.x, 0.75, t.a.position.z)
			t.smear.rotation.y = 0
			t.smear.material.uniforms.uHead.value = clamp01(k * 3)
			t.smear.material.uniforms.uTail.value = clamp01((k - 0.35) * 1.6)
		},
	},
	{
		title: 'Focus lines',
		text: 'Thin ink spokes rush in toward the struck unit for a few frames, redrawn each frame so they shiver. The manga speed line, from Dragon Ball to Smash Ultimate’s KO shots.',
		note: 'For crits and finishing blows, never for every tick.',
		setup(t) {
			const pos = []
			for (let i = 0; i < 36; i++) {
				const a = (i / 36) * Math.PI * 2
				const w = 0.012 + (i % 3) * 0.006
				pos.push(Math.cos(a - w) * 3, Math.sin(a - w) * 3, 0)
				pos.push(Math.cos(a + w) * 3, Math.sin(a + w) * 3, 0)
				pos.push(Math.cos(a) * (0.55 + (i % 4) * 0.12), Math.sin(a) * (0.55 + (i % 4) * 0.12), 0)
			}
			const g = new THREE.BufferGeometry()
			g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
			t.lines = new THREE.Mesh(g, flat(C.ink, { depthTest: false }))
			t.lines.renderOrder = 10
			t.lines.visible = false
			t.scene.add(t.lines)
		},
		hit(t) {
			t.freeze = 0.08
			flashUnit(t.b, 0.08)
			t.shake = 0.08
		},
		update(t) {
			t.lines.visible = t.since < 0.16
			if (!t.lines.visible) return
			t.lines.position.set(t.b.position.x, 0.7, t.b.position.z)
			t.lines.quaternion.copy(t.camera.quaternion)
			t.lines.rotateZ(t.frame * 0.37)
			t.lines.scale.setScalar(1 + (t.frame % 2) * 0.12)
		},
	},
	{
		title: 'Knockback and dust',
		text: 'The struck unit stretches along the blow, skids back on its heels and squashes as it stops, kicking up flat cel puffs and leaving scuffs on the floor.',
		note: 'Visual only; the hitbox and position stay where the server says.',
		setup(t) {
			t.puffs = []
			const geo = new THREE.IcosahedronGeometry(0.3, 1)
			for (let i = 0; i < 6; i++) {
				const p = outlined(geo, toon(C.cream), 1.12)
				p.visible = false
				t.scene.add(p)
				t.puffs.push({ mesh: p, vx: 0, vz: 0, born: 0 })
			}
		},
		hit(t) {
			t.freeze = 0.06
			flashUnit(t.b, 0.07)
			t.puffs.forEach((p, i) => {
				const a = Math.PI + (i - 2.5) * 0.9
				p.vx = -Math.cos(a) * (1.4 + (i % 3) * 0.5)
				p.vz = Math.sin(a) * (1.2 + (i % 2) * 0.6)
				p.mesh.position.set(t.b.position.x - 0.2, 0.15, t.b.position.z)
			})
		},
		update(t, dt) {
			// skid back 0.8 m with ease-out over 0.3 s, then walk home before the next swing
			const s = t.since
			const back = s < 0.3 ? easeOut(s / 0.3) : s < 1.2 ? 1 : Math.max(0, 1 - (s - 1.2) / 0.3)
			t.b.position.x = 1.1 + back * 0.8
			const pose = t.b.userData.pose
			if (s < 0.12) pose.scale.set(1.18, 0.82, 0.86)
			else if (s < 0.3) pose.scale.set(0.9, 1.12, 1.0)
			else if (s < 0.42) pose.scale.set(1.12, 0.86, 1.1)
			else pose.scale.set(1, 1, 1)
			pose.rotation.x = s < 0.3 ? -0.35 * (1 - s / 0.3) : 0
			for (const p of t.puffs) {
				const k = s / 0.45
				p.mesh.visible = k < 1
				if (!p.mesh.visible) continue
				p.mesh.position.x += p.vx * dt * (1 - k)
				p.mesh.position.z += p.vz * dt * (1 - k)
				p.mesh.position.y = 0.15 + 0.25 * k
				p.mesh.scale.setScalar(k < 0.25 ? 0.6 + k * 2 : 1.1 * (1 - k) + 0.1)
			}
		},
	},
	{
		title: 'Printed crack',
		text: 'Heavy landings print a split in the floor: jagged ink strokes that snap open in one frame, hold a breath and close again. Ink on stone, the way look.md already marks cliff faces.',
		note: 'Ground slams only; floor stays quieter than any telegraph.',
		setup(t) {
			t.crack = new THREE.Mesh(crackGeometry(7), flat(C.ink, { side: THREE.DoubleSide }))
			t.crack.position.y = 0.015
			t.crack.visible = false
			t.scene.add(t.crack)
			t.slam = true
		},
		hit(t) {
			t.freeze = 0.08
			flashUnit(t.b, 0.07)
			t.shake = 0.18
		},
		update(t) {
			const s = t.since
			t.crack.visible = s < 0.7
			if (!t.crack.visible) return
			t.crack.position.x = t.b.position.x - 0.1
			t.crack.scale.setScalar(s < 0.03 ? 0.7 : s < 0.5 ? 1 : 1 - (s - 0.5) / 0.2)
		},
	},
	{
		title: 'Camera punch',
		text: 'The lens kicks in a few degrees and is shoved along the line of the blow, then settles. You feel which way it went without reading anything. Vlambeer’s "Art of Screenshake".',
		note: 'Your own hits and hits on you; distance falloff already exists.',
		hit(t) {
			t.freeze = 0.05
			flashUnit(t.b, 0.07)
			t.punch = 1
			t.shakeDir.set(1, 0, 0)
		},
	},
]

const grid = document.getElementById('grid')
const tiles = SKETCHES.map((fx, i) => {
	const fig = document.createElement('figure')
	fig.innerHTML = `<div class="tile"><span>${i + 1} ${fx.title}</span></div><figcaption><b>${i + 1}. ${fx.title}</b><br>${fx.text} <i>${fx.note}</i></figcaption>`
	grid.append(fig)
	const t = tile(fx)
	t.el = fig.firstChild
	return t
})

function step(t, dt) {
	t.frame++
	if (t.freeze > 0) {
		t.freeze -= dt
		t.fx.update?.(t, 0)
	} else {
		const before = t.time % PERIOD
		t.time += dt
		const now = t.time % PERIOD
		t.since += dt
		if (before < HIT && now >= HIT) {
			t.since = 0
			t.fx.hit?.(t)
		}
		// blue's lunge, or a hop and slam in the crack sketch
		const s = now
		const lunge = s < HIT - 0.15 ? 0 : s < HIT ? (s - (HIT - 0.15)) / 0.15 : Math.max(0, 1 - (s - HIT) / 0.35)
		t.a.position.x = -1.5 + lunge * 1.05
		const pose = t.a.userData.pose
		if (t.slam) {
			const hop = s > HIT - 0.4 && s < HIT ? Math.sin(((s - (HIT - 0.4)) / 0.4) * Math.PI) : 0
			pose.position.y = hop * 0.9
		}
		pose.rotation.x = lunge * 0.35
		t.fx.update?.(t, dt)
	}
	// flash and two-tone happen in real time, even while the world holds
	for (const u of [t.a, t.b]) {
		const f = (u.userData.flash ?? 0) - dt
		u.userData.flash = f
		for (const m of u.userData.skins) m.material.color.setHex(f > 0 ? C.cream : u.userData.skinColor)
	}
	t.shake = Math.max(0, t.shake - dt * 1.2)
	t.camera.position.copy(t.base)
	if (t.shake > 0) {
		const k = t.shake
		t.camera.position.x += Math.sin(t.frame * 2.7) * k
		t.camera.position.z += Math.cos(t.frame * 3.1) * k
	}
	t.camera.fov = t.fov
	if (t.punch > 0) {
		t.punch = Math.max(0, t.punch - dt * 4)
		const k = t.punch * t.punch
		t.camera.fov = t.fov - 4 * k
		t.camera.position.addScaledVector(t.shakeDir, 0.35 * k * Math.sin(t.frame * 1.9 + 1))
	}
	t.camera.lookAt(0.25, 0.4, 0)
}

function draw(t) {
	const r = t.el.getBoundingClientRect()
	if (r.bottom < 0 || r.top > innerHeight) return
	const y = innerHeight - r.bottom
	renderer.setViewport(r.left, y, r.width, r.height)
	renderer.setScissor(r.left, y, r.width, r.height)
	t.camera.aspect = r.width / r.height
	t.camera.updateProjectionMatrix()
	if (t.impact > 0) {
		const inverse = t.impact === 1
		t.scene.background.setHex(inverse ? C.cream : C.ink)
		t.scene.overrideMaterial = inverse ? inkFlat : creamFlat
		t.floor.visible = false
		renderer.render(t.scene, t.camera)
		t.scene.overrideMaterial = null
		t.floor.visible = true
		t.scene.background.setHex(C.shade)
		t.impact--
		return
	}
	renderer.render(t.scene, t.camera)
}

// ?slow=4 plays everything four times slower, for judging single frames.
// ?manual leaves the clock to window.tick(frames), stepping at 60 Hz, for recording.
const params = new URLSearchParams(location.search)
const slow = Number(params.get('slow')) || 1
window.tick = (frames = 1, dt = 1 / 60) => {
	renderer.setSize(innerWidth, innerHeight, false)
	for (let i = 0; i < frames; i++)
		for (const t of tiles) {
			step(t, dt)
			if (i === frames - 1) draw(t)
		}
}
let last = performance.now()
function frame(now) {
	if (params.has('manual')) return
	const dt = Math.min(0.05, (now - last) / 1000) / slow
	last = now
	renderer.setSize(innerWidth, innerHeight, false)
	for (const t of tiles) {
		step(t, dt)
		draw(t)
	}
	requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
