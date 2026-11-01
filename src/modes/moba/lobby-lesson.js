import * as THREE from 'three'
import { activeDevice } from '../../core/input.js'
import { controls } from '../../core/controls.js'
import { attackKey, PRESETS } from '../../core/intents.js'
import { keysFor } from './hud.js'
import { channelAt, channelPoint } from './maps/lobby/lobby-layout.js'
import { tune } from './tune.js'
import { hintMemory } from './mechanics/hints/hints-memory.js'

// The lobby's first lesson, given without a word: by each thing on the floor stands the key that
// uses it, in the ability bar's glyphs, until you have pressed it once. Your feet get the walking
// keys, the acequia your dash, the bell your attack and your other spells; the difficulty plates and the
// portal need no key, you just walk onto them. A key you have pressed goes for good on this device and control scheme, so a
// veteran sees nothing at all. It shares the match hints' memory: the pause menu's Hints switch hides
// these keys too, and turning it back on starts the lesson over (mechanics/hints/hints-memory.js).
const SLOTS = ['slot1', 'slot2', 'slot3']
// Movement abilities: every dash, and Undine's Slide, which dashes without saying so.
const moves = (ability) => ability?.kind === 'dash' || ability?.id === 'slide'

const cap = (text) => `<span class="key-cap">${text}</span>`
const MOUSE =
	'<svg viewBox="0 0 24 24" aria-hidden="true"><path class="body" d="M12 2.5a6.5 6.5 0 0 1 6.5 6.5v6a6.5 6.5 0 0 1-13 0V9A6.5 6.5 0 0 1 12 2.5zM5.5 10h13M12 2.5V10"/><path class="press" d="M12 2.5a6.5 6.5 0 0 1 6.5 6.5v1H12z"/></svg>'
const STICK =
	'<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="body" cx="12" cy="12" r="8.5"/><circle class="press" cx="12" cy="12" r="4"/></svg>'
// How you walk, drawn in key glyphs: the right mouse button, WASD, the arrows or the left stick.
function walkKeys(scheme) {
	if (scheme === 'pad') return `<span class="key-cap key-icon">${STICK}</span>`
	if (PRESETS[scheme]?.mouse === 'orders') return `<span class="key-cap key-icon">${MOUSE}</span>`
	const [up, left, down, right] = PRESETS[scheme]?.arrows
		? ['↑', '←', '↓', '→']
		: ['W', 'A', 'S', 'D']
	return `<span class="key-cross">${cap(up)}${cap(left)}${cap(down)}${cap(right)}</span>`
}

export function createLobbyLesson({ el, hero, bell, onPresent }) {
	const v = tune.lobby.lesson
	const layer = document.createElement('div')
	layer.className = 'lobby-lesson'
	layer.setAttribute('aria-hidden', 'true')
	el.append(layer)
	const cue = (name) => {
		const node = document.createElement('span')
		node.className = 'lobby-cue'
		node.dataset.cue = name
		layer.append(node)
		return { node, shown: false, html: '' }
	}
	const cues = { walk: cue('walk'), dash: cue('dash'), bell: cue('bell') }
	const scheme = () => (activeDevice() === 'gamepad' ? 'pad' : controls.preset)
	const known = (verb) => hintMemory.learned(`lobby.${verb}:${scheme()}`)
	const learn = (verb) => hintMemory.learn(`lobby.${verb}:${scheme()}`)
	// Your own casts teach their keys the moment they leave your hands.
	onPresent?.((fact) => {
		if (fact.type !== 'cast' || fact.hero !== hero.id) return
		if (fact.slot === 'primary') learn('attack')
		else if (SLOTS.includes(fact.slot)) learn(fact.slot)
	})
	// Walking is learned per scheme: switching presets starts the count again from where you stand.
	let start = null

	const projected = new THREE.Vector3()
	// Show `cue` at world point `at`, drawn as `html`, or let it go when `html` is empty. A cue whose
	// key was just pressed pops on its way out instead of fading.
	function place(c, camera, at, html, done = false) {
		const show = !!html
		if (show) {
			projected.set(at.x, at.y ?? 0, at.z).project(camera)
			const off = projected.z < -1 || projected.z > 1
			c.node.style.left = `${((projected.x + 1) * innerWidth) / 2}px`
			c.node.style.top = `${((1 - projected.y) * innerHeight) / 2}px`
			if (html !== c.html) c.node.innerHTML = c.html = html
			c.node.hidden = off
		}
		if (show !== c.shown) {
			c.shown = show
			c.node.dataset.shown = String(show)
			c.node.dataset.done = String(!show && done)
		}
	}
	const near = (at, metres) =>
		Math.hypot(hero.body.position.x - at.x, hero.body.position.z - at.z) < metres

	return {
		update(camera, hidden = false) {
			const s = scheme()
			const p = hero.body.position
			if (start?.scheme !== s) start = { scheme: s, x: p.x, z: p.z }
			if (!known('walk') && Math.hypot(p.x - start.x, p.z - start.z) > v.walked) learn('walk')
			if (hidden || hero.dead || !hintMemory.on || activeDevice() === 'touch') {
				for (const c of Object.values(cues)) place(c, camera, null, '')
				return
			}
			const keys = keysFor(activeDevice())
			const abilities = hero.definition?.abilities ?? {}
			const kit = SLOTS.filter((slot) => abilities[slot])
			const dash = kit.find((slot) => moves(abilities[slot]))
			// Walking: at your feet, until you have walked.
			place(cues.walk, camera, { x: p.x, z: p.z + 0.9 }, known('walk') ? '' : walkKeys(s), true)
			// The dash: at your feet, where the walking keys were, when you walk up to the acequia.
			const water = channelAt(p.x, p.z)
			const bank = channelPoint(water.angle)
			const atBank = Math.hypot(bank.x - p.x, bank.z - p.z) < v.near.channel && known('walk')
			place(
				cues.dash,
				camera,
				{ x: p.x, z: p.z + 0.9 },
				dash && !known(dash) && atBank && !water.wet ? cap(keys[SLOTS.indexOf(dash)]) : '',
				!!dash && known(dash),
			)
			// The bell: your attack and the rest of your kit, one key each, over its arch.
			const left = kit.filter((slot) => slot !== dash && !known(slot))
			const strike = known('attack') ? [] : [cap(attackKey(controls.preset, activeDevice()))]
			const rings = [...strike, ...left.map((slot) => cap(keys[SLOTS.indexOf(slot)]))]
			place(
				cues.bell,
				camera,
				{ x: bell.x, y: 4, z: bell.z },
				rings.length && near(bell, v.near.bell) ? rings.join('') : '',
				!rings.length,
			)
		},
		dispose() {
			layer.remove()
		},
	}
}
