import { dressHero } from '../hero-view.js'

// Replica hook only: select and lane share the hero's silhouette.
export function dressPortrait(body) {
	const undress = dressHero(body, 'fletcher', 'A')
	body.mesh.name = 'front-fletcher'
	const animate = body.animate
	body.animate = (dt, draw) => {
		const moved = animate(dt, draw)
		body.drawPose(draw)
		return moved
	}
	return () => {
		body.animate = animate
		undress()
	}
}
