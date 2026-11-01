import './keycap.css'

// The one keycap: every key label in the game (ability bar, lobby props, talent tree) is set through
// here, in the key face, dark ink on a small cap. Letters and digits stay as they are; the keys that
// are too long to read at that size, or are not letters at all, are drawn instead: Space as a bar, a
// click as a mouse, the left stick as a stick. The hint canvases (hints-view.js) draw the same shapes.
const glyph = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`
export const KEY_GLYPHS = {
	Space: glyph('<path d="M3 9v6h18V9"/>'),
	Click: glyph(
		'<path d="M12 2.5a6.5 6.5 0 0 1 6.5 6.5v6a6.5 6.5 0 0 1-13 0V9A6.5 6.5 0 0 1 12 2.5zM5.5 10h13M12 2.5V10"/><path class="press" d="M12 2.5a6.5 6.5 0 0 1 6.5 6.5v1H12z"/>',
	),
	Stick: glyph('<circle cx="12" cy="12" r="8.5"/><circle class="press" cx="12" cy="12" r="4"/>'),
}

// The cap's inside: the glyph for a key that has one, else its plain text.
export const keyCapInner = (label) => KEY_GLYPHS[label] ?? String(label ?? '')

// `<span class="key-cap">`; `extra` adds a class (a glyph key gets key-icon on its own).
export const keyCapHtml = (label, extra = '') =>
	`<span class="key-cap${KEY_GLYPHS[label] ? ' key-icon' : ''}${label === 'Space' ? ' key-wide' : ''}${extra ? ` ${extra}` : ''}">${keyCapInner(label)}</span>`

// Fill an existing cap node. Text goes in as text; only our own glyph strings go in as markup.
export function setKeyCap(node, label) {
	node.classList.add('key-cap')
	node.classList.toggle('key-icon', label in KEY_GLYPHS)
	node.classList.toggle('key-wide', label === 'Space')
	if (label in KEY_GLYPHS) node.innerHTML = KEY_GLYPHS[label]
	else node.textContent = label ?? ''
}
