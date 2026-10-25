import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { HAZE, NOISE } from '../../isle.js'
import { bind, paint } from '../../restyle.js'
import { cliffPillar, lichenClump } from '../../carve.js'

// The same fluted stone as the rim, printed through the isle's live light and depth haze.
export function morningPillars({ own, forward, stone, rand, shared }, sky) {
	const parts = []
	const add = (geometry, moss = false) => {
		geometry.deleteAttribute('uv')
		const data = new Float32Array(geometry.attributes.position.count * 2)
		for (let i = 0; i < data.length; i += 2) {
			data[i] = moss ? 1 : 0
			data[i + 1] = 0
		}
		geometry.setAttribute('stone', new THREE.BufferAttribute(data, 2))
		parts.push(geometry)
	}
	const sites = []
	for (const side of [-1, 1]) {
		for (let row = 0; row < sky.rows; row++) {
			for (let i = 0; i < sky.count; i++) {
				const radius = sky.radius[0] + rand() * (sky.radius[1] - sky.radius[0])
				const height = sky.height[0] + rand() * (sky.height[1] - sky.height[0])
				const x = side * (shared.uIsle.value.x + sky.near + row * sky.spacing + rand() * 6)
				const z = (i - sky.count / 2) * sky.spacing - row * sky.dropStep * 0.6 + rand() * 4
				const y = -sky.drop - row * sky.dropStep + rand() * 5
				add(cliffPillar(radius, height, sky, rand).translate(x, y, z))
				for (let clump = 0; clump < sky.grass; clump++) {
					const angle = rand() * Math.PI * 2,
						reach = Math.sqrt(rand()) * radius * 0.75
					add(
						lichenClump(radius * (0.3 + rand() * 0.2), sky.lichen, rand).translate(
							x + Math.sin(angle) * reach,
							y,
							z + Math.cos(angle) * reach,
						),
						true,
					)
				}
				for (let vine = 0; vine < sky.ivy; vine++) {
					const angle = rand() * Math.PI * 2
					for (let leaf = 0; leaf < 4; leaf++)
						add(
							lichenClump(radius * (0.2 - leaf * 0.035), sky.lichen, rand)
								.rotateX(1.1)
								.rotateY(angle)
								.translate(
									x + Math.sin(angle) * radius * 0.86,
									y - leaf * radius * 0.6,
									z + Math.cos(angle) * radius * 0.86,
								),
							true,
						)
				}
				if ((i + row) % 3 === 0)
					sites.push({
						x,
						y,
						z: z + radius * 0.92,
						width: radius * sky.waterfall.width,
						height: height * sky.waterfall.height,
					})
			}
		}
	}
	const geometry = own(mergeGeometries(parts))
	for (const g of parts) g.dispose()
	const farStone = own(stone.clone())
	farStone.uniforms = {
		...stone.uniforms,
		uStoneLit: { value: paint(sky.colors, 'stoneLit') },
		uStone: { value: paint(sky.colors, 'stone') },
		uStoneShade: { value: paint(sky.colors, 'stoneShade') },
		uHazeShape: {
			value: bind(new THREE.Vector4(), (v) =>
				v.set(sky.haze.top, sky.haze.bottom, sky.haze.power, sky.haze.max),
			),
		},
		uHazeReach: { value: bind(new THREE.Vector2(), (v) => v.set(sky.haze.near, sky.haze.far)) },
	}
	forward(new THREE.Mesh(geometry, farStone), 'overthrow-morning-pillars')
	return sites
}

// Broad cloud bands and a sunward bloom. Light colours and direction are uniforms,
// so moving the sun does not rebuild this sea or any of the stone above it.
export function morningAir({ s, own, forward, shared, rand }, sky) {
	const material = own(
		new THREE.ShaderMaterial({
			uniforms: {
				...shared,
				uCloudLit: { value: paint(s.colors, 'cloudLit') },
				uCloud: { value: paint(s.colors, 'cloud') },
				uCloudShade: { value: paint(s.colors, 'cloudShade') },
				uCloudDeep: { value: paint(s.colors, 'cloudDeep') },
				uScale: bind({}, (u) => {
					u.value = sky.cloudScale
				}),
				uDrift: { value: bind(new THREE.Vector2(), (v) => v.set(...s.clouds.drift)) },
			},
			vertexShader: `varying vec3 vWorld;
		void main(){vec4 p=modelMatrix*vec4(position,1.0);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
			fragmentShader: `${NOISE}
		varying vec3 vWorld;
		uniform vec3 uCloudLit,uCloud,uCloudShade,uCloudDeep,uSun;
		uniform vec2 uDrift;uniform float uScale,uTime;
		void main(){
			vec2 p=(vWorld.xz-uDrift*uTime*0.25)/uScale;
			vec2 sun=normalize(uSun.xz);
			float bank=isleFbm(p)*0.7+isleNoise(p*2.6)*0.3;
			float crest=isleFbm(p+sun*0.13)*0.7+isleNoise((p+sun*0.13)*2.6)*0.3;
			float light=(bank-crest)*8.0+0.5;
			vec3 col=mix(uCloudShade,uCloud,smoothstep(0.37,0.45,bank));
			col=mix(col,uCloudLit,smoothstep(0.52,0.58,bank)*smoothstep(0.35,0.65,light));
			col=mix(uCloudDeep,col,smoothstep(0.22,0.38,bank));
			float dawn=smoothstep(-25.0,150.0,dot(vWorld.xz,sun));
			col=mix(col,uCloudLit,dawn*0.35);
			gl_FragColor=vec4(col,1.0);
		}`,
		}),
	)
	const sea = forward(
		new THREE.Mesh(
			own(new THREE.PlaneGeometry(s.clouds.size, s.clouds.size).rotateX(-Math.PI / 2)),
			material,
		),
		'overthrow-morning-clouds',
	)
	sea.position.y = s.clouds.y + 0.25
	const birds = []
	for (let i = 0; i < sky.birds.count; i++) {
		const x = (i % 2 ? -1 : 1) * (shared.uIsle.value.x + sky.birds.near + rand() * sky.birds.spread)
		const y = -sky.birds.drop - rand() * sky.birds.spread
		const z = -30 + rand() * 42
		const size = sky.birds.size * (0.6 + rand() * 0.6)
		birds.push(
			x - size,
			y,
			z,
			x,
			y - size * 0.25,
			z,
			x - size * 0.45,
			y + size * 0.28,
			z,
			x,
			y - size * 0.25,
			z,
			x + size,
			y,
			z,
			x + size * 0.45,
			y + size * 0.28,
			z,
		)
	}
	const birdGeometry = own(new THREE.BufferGeometry())
	birdGeometry.setAttribute('position', new THREE.Float32BufferAttribute(birds, 3))
	const birdMaterial = own(
		new THREE.ShaderMaterial({
			uniforms: shared,
			side: THREE.DoubleSide,
			vertexShader: `varying vec3 vWorld;void main(){vec4 p=modelMatrix*vec4(position,1.0);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
			fragmentShader: `${HAZE}\nuniform vec3 uInk;void main(){gl_FragColor=vec4(isleHaze(uInk),1.0);}`,
		}),
	)
	forward(new THREE.Mesh(birdGeometry, birdMaterial), 'overthrow-distant-birds')
}
