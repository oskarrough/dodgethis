// Photo mode, for proofs and wallpapers: dt.photo({ eye, target, fov }) holds the simulation, hides every
// layer over the canvas and holds the camera on that pose; dt.photo() lets the match go on as it was.
import { tune } from './tune.js'

const STYLE = 'body[data-photo] > :not(canvas) { visibility: hidden !important; }'

export function createPhoto(app) {
	let release = null
	let wasPaused = false
	function photo(pose) {
		if (release) {
			release()
			release = null
			tune.physics.paused = wasPaused
			delete document.body.dataset.photo
		}
		if (!pose) return false
		if (!document.getElementById('photo-style'))
			document.head.append(
				Object.assign(document.createElement('style'), { id: 'photo-style', textContent: STYLE }),
			)
		const at = (p) => ({ x: p[0] ?? p.x, y: p[1] ?? p.y, z: p[2] ?? p.z })
		const frame = { eye: at(pose.eye), target: at(pose.target), fov: pose.fov }
		wasPaused = tune.physics.paused
		tune.physics.paused = true
		release = app.camera.frame(() => frame)
		app.camera.update(0)
		document.body.dataset.photo = ''
		return true
	}
	return photo
}
