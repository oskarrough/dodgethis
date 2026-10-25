import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { glows } from '../../../../core/stylepass.js'
import { sandstone } from '../../carve.js'
import { HAZE } from '../../isle.js'

export function nightSky({ s, own, forward, around, rand, shared }, sky) {
	const moon = s.moon
	const canvas = document.createElement('canvas')
	canvas.width = canvas.height = 1024
	const ctx = canvas.getContext('2d')
	const centre = 512,
		radius = 504
	ctx.beginPath()
	ctx.arc(centre, centre, radius, 0, Math.PI * 2)
	ctx.fillStyle = moon.color
	ctx.fill()
	ctx.save()
	ctx.clip()
	ctx.fillStyle = moon.seas
	for (const [x, y, r] of [
		[0.36, 0.36, 0.17],
		[0.57, 0.55, 0.14],
		[0.43, 0.73, 0.11],
		[0.67, 0.29, 0.07],
	]) {
		ctx.beginPath()
		for (let corner = 0; corner < 48; corner++) {
			const a = (corner * Math.PI * 2) / 48
			const bite = 0.985 + rand() * 0.03
			const px = (x + Math.cos(a) * r * bite) * 1024,
				py = (y + Math.sin(a) * r * bite) * 1024
			if (corner) ctx.lineTo(px, py)
			else ctx.moveTo(px, py)
		}
		ctx.closePath()
		ctx.fill()
	}
	ctx.fillStyle = moon.terminator
	ctx.beginPath()
	ctx.moveTo(715, 0)
	ctx.bezierCurveTo(1040, 230, 1040, 790, 715, 1024)
	ctx.lineTo(1024, 1024)
	ctx.lineTo(1024, 0)
	ctx.closePath()
	ctx.fill()
	ctx.restore()
	ctx.strokeStyle = moon.limb
	ctx.lineWidth = 8
	ctx.beginPath()
	ctx.arc(centre, centre, radius - 3, Math.PI * 0.92, Math.PI * 1.92)
	ctx.stroke()
	const texture = own(new THREE.CanvasTexture(canvas))
	texture.colorSpace = THREE.SRGBColorSpace
	const disc = forward(
		new THREE.Mesh(
			own(new THREE.CircleGeometry(moon.size / 2, 96)),
			own(new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })),
		),
		'flagfall-moon',
	)
	disc.position.set(...moon.at)
	disc.renderOrder = 3
	disc.onBeforeRender = (_renderer, _scene, camera) => {
		disc.quaternion.copy(camera.quaternion)
		disc.updateMatrixWorld()
	}
	glows(disc, moon.bloom)
	own({ dispose: () => disc.clear() })

	const cloud = own(
		new THREE.ShaderMaterial({
			transparent: true,
			depthWrite: false,
			uniforms: {
				deep: { value: new THREE.Color(s.colors.cloudDeep) },
				shade: { value: new THREE.Color(s.colors.cloudShade) },
				body: { value: new THREE.Color(s.colors.cloud) },
				lit: { value: new THREE.Color(s.colors.cloudLit) },
				scale: { value: sky.cloudScale },
			},
			vertexShader: /* glsl */ `varying vec2 world;
		void main() { vec4 p=modelMatrix*vec4(position,1.0); world=p.xz; gl_Position=projectionMatrix*viewMatrix*p; }`,
			fragmentShader: /* glsl */ `varying vec2 world; uniform vec3 deep, shade, body, lit; uniform float scale;
		float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
		float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y);}
		void main(){vec2 p=world/scale; float cloud=noise(p)*0.65+noise(p*2.7)*0.25+noise(p*6.0)*0.1;
		float bank=sin(p.y*1.5+cloud*4.0)*0.5+0.5;
		vec3 col=mix(deep,shade,smoothstep(0.32,0.4,bank));
		col=mix(col,body,smoothstep(0.54,0.59,bank));col=mix(col,lit,smoothstep(0.73,0.78,bank)*0.65);
		gl_FragColor=vec4(col,1.0);}`,
		}),
	)
	const sea = forward(
		new THREE.Mesh(
			own(new THREE.PlaneGeometry(s.clouds.size, s.clouds.size).rotateX(-Math.PI / 2)),
			cloud,
		),
		'flagfall-night-clouds',
	)
	sea.position.y = s.clouds.y + 0.25
	sea.renderOrder = 2

	const galaxy = own(
		new THREE.ShaderMaterial({
			transparent: true,
			depthWrite: false,
			uniforms: {
				violet: { value: new THREE.Color(sky.galaxy.color) },
				strength: { value: sky.galaxy.strength },
				roll: { value: sky.galaxy.roll },
			},
			vertexShader: /* glsl */ `varying vec2 uvSky; uniform float roll;
		void main(){uvSky=uv; vec4 p=modelViewMatrix*vec4(0,0,0,1); vec2 q=mat2(cos(roll),sin(roll),-sin(roll),cos(roll))*position.xy;
		p.xy+=q;gl_Position=projectionMatrix*p;}`,
			fragmentShader: /* glsl */ `varying vec2 uvSky;uniform vec3 violet;uniform float strength;
		float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
		void main(){vec2 p=uvSky;float lane=exp(-pow((p.y-0.5-sin(p.x*5.0)*0.08)/0.12,2.0));
		float edge=smoothstep(0.0,0.2,p.x)*smoothstep(1.0,0.8,p.x);
		float dust=hash(floor(p*vec2(720,180)));float grain=mix(0.25,1.0,step(0.91,dust));
		gl_FragColor=vec4(violet,lane*edge*grain*strength);}`,
		}),
	)
	const band = forward(
		new THREE.Mesh(own(new THREE.PlaneGeometry(...sky.galaxy.size)), galaxy),
		'flagfall-galaxy',
	)
	band.position.set(...sky.galaxy.at)
	band.renderOrder = 2

	const stars = []
	for (let i = 0; i < s.specks.count; i++) {
		const at = around(s.specks.near + rand() * (s.specks.far - s.specks.near))
		if (i < s.specks.count / 2)
			stars.push(
				sky.stars.at[0] + (rand() - 0.5) * sky.stars.spread[0],
				sky.stars.at[1],
				sky.stars.at[2] + (rand() - 0.5) * sky.stars.spread[1],
			)
		else stars.push(at.x, s.specks.y[0] + rand() * (s.specks.y[1] - s.specks.y[0]), at.z)
	}
	const starGeometry = own(new THREE.BufferGeometry())
	starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(stars, 3))
	const points = forward(
		new THREE.Points(
			starGeometry,
			own(
				new THREE.PointsMaterial({
					color: s.specks.color,
					size: s.specks.size,
					transparent: true,
					depthWrite: false,
					opacity: 0.65,
				}),
			),
		),
		'flagfall-stars',
	)
	points.renderOrder = 2

	const rock = [],
		windows = []
	const colours = [sky.isles.shade, sky.isles.stone, sky.isles.lit].map((c) => new THREE.Color(c))
	const haze = new THREE.Color(sky.isles.haze)
	for (let i = 0; i < sky.isles.count; i++) {
		const distance = sky.isles.near + rand() * (sky.isles.far - sky.isles.near)
		const anchor = sky.isles.anchors[i % sky.isles.anchors.length]
		const fixed = i < sky.isles.anchors.length * 2
		const at = fixed
			? { x: anchor[0] * (i < sky.isles.anchors.length ? 1 : -1), z: anchor[2] }
			: around(distance, 0.8)
		const size = fixed
			? anchor[3]
			: sky.isles.radius[0] + rand() * (sky.isles.radius[1] - sky.isles.radius[0])
		const top = fixed
			? anchor[1]
			: -sky.isles.drop[0] - rand() * (sky.isles.drop[1] - sky.isles.drop[0])
		for (let column = 0; column < 3; column++) {
			const width = size * (column === 1 ? 0.9 : 0.7)
			const height = size * (column === 1 ? 4.5 : 2.5 + rand())
			const x = at.x + (column - 1) * size * 0.65,
				z = at.z + (rand() - 0.5) * size * 0.3
			const y = top + (column === 1 ? size * 1.8 : 0)
			for (const g of [
				sandstone(width, height, size, 0.13).translate(x, y - height / 2, z),
				sandstone(width * 1.14, size * 0.13, size * 1.1, 0.1).translate(x, y - height * 0.48, z),
			]) {
				g.deleteAttribute('uv')
				const normal = g.attributes.normal,
					color = []
				for (let v = 0; v < normal.count; v++) {
					const light = normal.getY(v) * 0.7 - normal.getX(v) * 0.6 - normal.getZ(v) * 0.35
					const shade = colours[light > 0.5 ? 2 : light > -0.25 ? 1 : 0]
						.clone()
						.lerp(haze, (distance / sky.isles.far) * 0.35)
					color.push(shade.r, shade.g, shade.b)
				}
				g.setAttribute('color', new THREE.Float32BufferAttribute(color, 3))
				rock.push(g)
			}
			for (let row = 0; row < 3; row++) {
				if (rand() < 0.35) continue
				windows.push(
					new THREE.BoxGeometry(size * 0.06, size * 0.14, size * 0.025).translate(
						x + width * 0.18,
						y - size * (0.4 + row * 0.55),
						z + size * 0.502,
					),
				)
			}
		}
	}
	for (const [list, name, material] of [
		[
			rock,
			'flagfall-far-isles',
			new THREE.ShaderMaterial({
				uniforms: {
					...shared,
					uHaze: { value: haze },
					uHazeShape: { value: new THREE.Vector4(10, 90, 0.8, 0.82) },
					uHazeReach: { value: new THREE.Vector2(20, 130) },
				},
				vertexShader: /* glsl */ `attribute vec3 color; varying vec3 vColor; varying vec3 vWorld;
			void main(){vec4 p=modelMatrix*vec4(position,1.0);vWorld=p.xyz;vColor=color;gl_Position=projectionMatrix*viewMatrix*p;}`,
				fragmentShader: /* glsl */ `${HAZE}
			varying vec3 vColor; void main(){gl_FragColor=vec4(isleHaze(vColor),1.0);}`,
			}),
		],
		[windows, 'flagfall-far-windows', new THREE.MeshBasicMaterial({ color: sky.isles.windows })],
	]) {
		const geometry = own(mergeGeometries(list))
		for (const part of list) part.dispose()
		const mesh = forward(new THREE.Mesh(geometry, own(material)), name)
		if (list === windows) {
			glows(mesh, sky.isles.bloom)
			own({ dispose: () => mesh.clear() })
		}
	}
}
