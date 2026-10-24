import * as THREE from 'three'
import { FORWARD_LAYER } from '../../core/stylepass.js'

// Painted images on a map, from its tune's `art` (images live in public/art/): inlays set into
// the court, a painted face over every wall, and a plate under the isle in place of the cloud
// sea. Floor tiles are floor-print.js's job. Every image is optional; a missing file draws nothing.
//
//   art: {
//     inlays: [{ image, x, z, size, turn, round, opacity }],
//     walls: { image, size, strength, tint },
//     plate: { image, size, fade, haze },
//   }
export function createMapArt({ art = {}, layout, terrain, m, group, own }) {
	const loader = new THREE.TextureLoader()
	const meshes = []
	const load = (url, use) => {
		if (!url || typeof document === 'undefined') return
		loader.load(
			url,
			(texture) => {
				own(texture)
				texture.colorSpace = THREE.SRGBColorSpace
				use(texture)
			},
			undefined,
			() => console.warn(`map-art: no image at ${url}`),
		)
	}
	const forward = (mesh, order) => {
		mesh.layers.set(FORWARD_LAYER)
		mesh.renderOrder = order
		mesh.visible = false // until its image arrives
		group.add(mesh)
		meshes.push(mesh)
		return mesh
	}

	// Inlays: a square image laid flat on the court, over the floor print and under every mark.
	for (const inlay of art.inlays ?? []) {
		const material = own(
			new THREE.ShaderMaterial({
				uniforms: {
					uImage: { value: null },
					uRound: { value: inlay.round ? 1 : 0 },
					uOpacity: { value: inlay.opacity ?? 1 },
				},
				vertexShader: UV_VERT,
				fragmentShader: /* glsl */ `
uniform sampler2D uImage;
uniform float uRound, uOpacity;
varying vec2 vUv;
void main() {
	vec4 image = texture2D(uImage, vUv);
	// A round inlay fades out over its last few percent, so a square picture sits as a disc.
	float edge = mix(1.0, 1.0 - smoothstep(0.46, 0.5, length(vUv - 0.5)), uRound);
	gl_FragColor = vec4(image.rgb, image.a * edge * uOpacity);
}`,
				transparent: true,
				depthWrite: false,
			}),
		)
		const mesh = forward(
			new THREE.Mesh(
				own(new THREE.PlaneGeometry(inlay.size, inlay.size).rotateX(-Math.PI / 2)),
				material,
			),
			-3.3,
		)
		mesh.position.set(inlay.x, terrain.groundY + 0.006, inlay.z)
		mesh.rotation.y = ((inlay.turn ?? 0) * Math.PI) / 180
		load(inlay.image, (texture) => {
			material.uniforms.uImage.value = texture
			mesh.visible = true
		})
	}

	// Wall faces: the painting multiplies over the shaded, inked stone, so the wall keeps its
	// palette colour, light and outline and takes only the picture's carving and wear.
	if (art.walls?.image) {
		const w = art.walls
		const faces = layout.boxes
			.filter((b) => b.kind !== 'hedge')
			.flatMap((b) => wallFaces(b, m.wallHeight, w.size))
		if (faces.length) {
			const material = own(
				new THREE.ShaderMaterial({
					uniforms: {
						uImage: { value: null },
						uGain: { value: 1 },
						uStrength: { value: w.strength ?? 1 },
						uTint: { value: w.tint ? 1 : 0 },
					},
					vertexShader: UV_VERT,
					fragmentShader: /* glsl */ `
uniform sampler2D uImage;
uniform float uGain, uStrength, uTint;
varying vec2 vUv;
void main() {
	// Only the picture's light and dark by default; with tint its colour too.
	vec3 image = texture2D(uImage, vUv).rgb;
	vec3 detail = mix(vec3(dot(image, vec3(0.2126, 0.7152, 0.0722))), image, uTint) * uGain;
	gl_FragColor = vec4(mix(vec3(1.0), detail, uStrength), 1.0);
}`,
					blending: THREE.CustomBlending,
					blendEquation: THREE.AddEquation,
					blendSrc: THREE.DstColorFactor,
					blendDst: THREE.ZeroFactor,
					depthWrite: false,
					side: THREE.DoubleSide,
					polygonOffset: true,
					polygonOffsetFactor: -1,
					polygonOffsetUnits: -4,
				}),
			)
			const geometry = own(mergeFaces(faces))
			const mesh = forward(new THREE.Mesh(geometry, material), -1)
			load(w.image, (texture) => {
				texture.wrapS = texture.wrapT = THREE.RepeatWrapping
				// Divide by the picture's mean so it adds detail without darkening the wall.
				material.uniforms.uGain.value = 1 / meanValue(texture.image)
				material.uniforms.uImage.value = texture
				mesh.visible = true
			})
		}
	}

	// The plate: a painting of the world below, laid just over the cloud sea and fading into it.
	if (art.plate?.image) {
		const p = art.plate
		const material = own(
			new THREE.ShaderMaterial({
				uniforms: {
					uImage: { value: null },
					uFade: { value: p.fade ?? 0.7 },
					uHaze: { value: new THREE.Color(terrain.colors?.haze ?? '#f1d2b4') },
					uHazeMix: { value: p.haze ?? 0.2 },
				},
				vertexShader: UV_VERT,
				fragmentShader: /* glsl */ `
uniform sampler2D uImage;
uniform vec3 uHaze;
uniform float uFade, uHazeMix;
varying vec2 vUv;
void main() {
	vec4 image = texture2D(uImage, vUv);
	float edge = 1.0 - smoothstep(uFade, 1.0, length(vUv - 0.5) * 2.0);
	gl_FragColor = vec4(mix(image.rgb, uHaze, uHazeMix), image.a * edge);
}`,
				transparent: true,
				depthWrite: false,
			}),
		)
		const mesh = forward(
			new THREE.Mesh(own(new THREE.PlaneGeometry(p.size, p.size).rotateX(-Math.PI / 2)), material),
			-6,
		)
		mesh.frustumCulled = false
		mesh.position.y = terrain.clouds.y + 0.05
		load(p.image, (texture) => {
			material.uniforms.uImage.value = texture
			mesh.visible = true
		})
	}

	return () => {
		for (const mesh of meshes) mesh.removeFromParent()
	}
}

const UV_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

// The four sides and the top of a wall box as quads, with uvs in repeats of `size` metres.
function wallFaces(b, height, size) {
	const out = 0.004
	const x0 = b.x - b.halfX - out
	const x1 = b.x + b.halfX + out
	const z0 = b.z - b.halfZ - out
	const z1 = b.z + b.halfZ + out
	const h = height + out
	const quad = (a, b2, c, d, uv) => ({ points: [a, b2, c, d], uv })
	const side = (from, to) => {
		const length = Math.hypot(to[0] - from[0], to[1] - from[1]) / size
		return quad(
			[from[0], 0, from[1]],
			[to[0], 0, to[1]],
			[to[0], h, to[1]],
			[from[0], h, from[1]],
			[
				[0, 0],
				[length, 0],
				[length, h / size],
				[0, h / size],
			],
		)
	}
	return [
		side([x0, z1], [x1, z1]),
		side([x1, z1], [x1, z0]),
		side([x1, z0], [x0, z0]),
		side([x0, z0], [x0, z1]),
		quad(
			[x0, h, z1],
			[x1, h, z1],
			[x1, h, z0],
			[x0, h, z0],
			[
				[x0 / size, z1 / size],
				[x1 / size, z1 / size],
				[x1 / size, z0 / size],
				[x0 / size, z0 / size],
			],
		),
	]
}

function mergeFaces(faces) {
	const positions = []
	const uvs = []
	const index = []
	for (const f of faces) {
		const base = positions.length / 3
		for (const p of f.points) positions.push(...p)
		for (const t of f.uv) uvs.push(...t)
		index.push(base, base + 1, base + 2, base, base + 2, base + 3)
	}
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
	geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
	geometry.setIndex(index)
	return geometry
}

// The mean linear value of an image, read from a small copy.
function meanValue(image) {
	const canvas = document.createElement('canvas')
	canvas.width = canvas.height = 16
	const ctx = canvas.getContext('2d')
	ctx.drawImage(image, 0, 0, 16, 16)
	const data = ctx.getImageData(0, 0, 16, 16).data
	let sum = 0
	for (let i = 0; i < data.length; i += 4) {
		const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
		sum += lum ** 2.2
	}
	return Math.max(0.05, sum / (data.length / 4))
}
