import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { glows } from '../../../../core/stylepass.js'
import { cliffPillar } from '../../carve.js'
import { HAZE } from '../../isle.js'
import { bind, paint } from '../../restyle.js'
import { tune } from '../../tune.js'

export function sunset({ s, own, forward, around, rand, shared }) {
	const sky = tune.salinas.sky,
		sun = sky.sun
	const disc = forward(
		new THREE.Mesh(
			own(new THREE.CircleGeometry(sun.radius, 80)),
			own(new THREE.MeshBasicMaterial({ color: paint(sun, 'color'), depthWrite: true })),
		),
		'salinas-sun',
	)
	bind(disc.material.color, (c) => c.set(sun.color))
	bind(disc.position, (v) => v.set(...sun.at))
	disc.onBeforeRender = (_r, _s, camera) => {
		disc.quaternion.copy(camera.quaternion)
		disc.updateMatrixWorld()
	}
	glows(disc, sun.bloom)
	own({ dispose: () => disc.clear() })
	const cloud = own(
		new THREE.ShaderMaterial({
			uniforms: {
				...shared,
				lit: { value: paint(s.colors, 'cloudLit') },
				body: { value: paint(s.colors, 'cloud') },
				shade: { value: paint(s.colors, 'cloudShade') },
				deep: { value: paint(s.colors, 'cloudDeep') },
				scale: { value: sky.cloudScale },
				bands: { value: sky.cloudBands },
				bloom: { value: sky.glowStrength },
			},
			vertexShader: `varying vec3 world; void main(){world=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
			fragmentShader: `varying vec3 world; uniform vec3 lit,body,shade,deep,uSun; uniform float scale,bands,bloom,uTime;
		float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
		float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
		void main(){vec2 p=world.xz/scale*vec2(.5,1.6)+vec2(uTime*.004,0);float n=noise(p)*.55+noise(p*2.4)*.3+noise(p*6.)*.15;
		float bank=clamp(n*.9+sin(p.y*.9)*.14,0.,1.);float tier=floor(bank*bands)/bands;
		vec3 col=mix(deep,shade,smoothstep(.15,.3,tier));col=mix(col,body,smoothstep(.32,.5,tier));col=mix(col,lit,smoothstep(.5,.7,tier));
		float warm=smoothstep(-15.,95.,dot(world.xz,normalize(uSun.xz)));col=mix(col,lit,warm*bloom);
		gl_FragColor=vec4(col,1.0);}`,
		}),
	)
	const sea = forward(
		new THREE.Mesh(
			own(new THREE.PlaneGeometry(s.clouds.size, s.clouds.size).rotateX(-Math.PI / 2)),
			cloud,
		),
		'salinas-sunset-clouds',
	)
	sea.position.y = s.clouds.y + 0.2
	const parts = []
	const f = sky.isles
	for (let i = 0; i < f.count; i++) {
		const at = around(f.near + rand() * (f.far - f.near)),
			radius = f.radius[0] + rand() * (f.radius[1] - f.radius[0]),
			height = f.height[0] + rand() * (f.height[1] - f.height[0])
		parts.push(
			cliffPillar(radius, height, { sides: 6, levels: 3, taper: 0.15, gaps: 0.5 }, rand).translate(
				at.x,
				-f.drop[0] - rand() * (f.drop[1] - f.drop[0]),
				at.z,
			),
		)
	}
	const material = own(
		new THREE.ShaderMaterial({
			uniforms: {
				...shared,
				uHaze: { value: paint(f, 'haze') },
				lit: { value: paint(f, 'lit') },
				shade: { value: paint(f, 'shade') },
			},
			vertexShader: `varying vec3 vWorld; varying vec3 normalWorld;void main(){vWorld=position;normalWorld=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
			fragmentShader: `${HAZE}\nuniform vec3 lit,shade,uSun;varying vec3 normalWorld;void main(){vec3 col=mix(shade,lit,step(.18,dot(normalize(normalWorld),uSun)));gl_FragColor=vec4(isleHaze(col),1.0);}`,
		}),
	)
	const geometry = own(mergeGeometries(parts))
	for (const g of parts) g.dispose()
	forward(new THREE.Mesh(geometry, material), 'salinas-far-salt-isles')
}
