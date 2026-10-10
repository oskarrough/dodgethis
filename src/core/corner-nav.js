import { el } from './dom.js'

const ARROW =
	'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12H5m6-7-7 7 7 7" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg><kbd></kbd>'
const GLOBE =
	'<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/></g></svg>Play online<kbd></kbd>'

// Every lobby's top-left row: the back tile and Play online beside it, styled in index.html.
// The online plugin opens its panel on any `.online-entry` click; the caller wires back.
export function createCornerNav(parent, { label = 'Back' } = {}) {
	const nav = el('nav', 'corner-nav', parent)
	const back = el('button', 'back-button', nav, ARROW)
	back.type = 'button'
	back.setAttribute('aria-label', label)
	const online = el('button', 'online-entry', nav, GLOBE)
	online.type = 'button'
	return { el: nav, back, online }
}
