// The two volume controls, music and sound, for any menu that holds settings: an icon you tap to mute that one,
// and a slider beside it. The icon carries the meaning (no words); a muted one wears the same cross as the mute tile.
import { getVolume, onVolumeChange, setVolume, ui } from './audio.js'
import { el } from './dom.js'
import './volume.css'

const SPEAKER =
	'<path d="M2.5 9h4L12 4v16l-5.5-5h-4z"/><path class="waves" d="M16 9a4.2 4.2 0 0 1 0 6M19.5 5.5a9 9 0 0 1 0 13"/>'
const NOTE = '<circle cx="7" cy="17.5" r="3"/><path d="M10 17.5V4.5c3.5 0 5.5 1.8 5.5 5"/>'
const CROSS = '<path class="cross" d="M16 9l5.5 6M21.5 9L16 15"/>'
const KINDS = [
	{ kind: 'sound', name: 'Sound', icon: SPEAKER },
	{ kind: 'music', name: 'Music', icon: NOTE },
]
const before = { sound: 1, music: 1 } // the level an icon brings back after muting

// Builds the controls into `parent` (inserted before `ref` when given) and returns the row.
export function createVolumes(parent, ref = null) {
	const root = el('div', 'volumes')
	const rows = KINDS.map(({ kind, name, icon }) => {
		const row = el('div', 'volume', root)
		const mute = el(
			'button',
			'volume-icon',
			row,
			`<svg viewBox="0 0 24 24" aria-hidden="true">${icon}${CROSS}</svg>`,
		)
		mute.type = 'button'
		const slider = el('input', 'volume-slider', row)
		Object.assign(slider, { type: 'range', min: 0, max: 1, step: 0.05 })
		slider.setAttribute('aria-label', `${name} volume`)
		let nudged = 0
		slider.addEventListener('input', () => {
			const level = Number(slider.value)
			setVolume(kind, level)
			if (level > 0) before[kind] = level
			// Sound has no song to hear it by, so a tick lets you judge the level (not more than ~12 a second).
			const now = performance.now()
			if (kind === 'sound' && now - nudged > 80) {
				nudged = now
				ui('nav')
			}
		})
		mute.addEventListener('click', () => {
			const level = getVolume(kind)
			setVolume(kind, level > 0 ? 0 : before[kind] || 1)
			if (kind === 'sound' && getVolume(kind) > 0) ui('switch')
		})
		return { kind, name, row, mute, slider }
	})
	function render() {
		for (const { kind, name, row, mute, slider } of rows) {
			const level = getVolume(kind)
			slider.value = level
			slider.style.setProperty('--fill', `${level * 100}%`)
			row.classList.toggle('muted', level === 0)
			mute.setAttribute(
				'aria-label',
				level === 0 ? `Unmute ${name.toLowerCase()}` : `Mute ${name.toLowerCase()}`,
			)
			mute.setAttribute('aria-pressed', String(level === 0))
		}
	}
	render()
	parent.insertBefore(root, ref)
	// The menu is rebuilt each time it opens; this row goes with it, and stops listening on the next change.
	const stop = onVolumeChange(() => (root.isConnected ? render() : stop()))
	return root
}
