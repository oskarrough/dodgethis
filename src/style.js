// The game's palette, by job rather than by hue. Every material, canvas sticker
// and CSS accent reads a role from here, so a color has one definition and one
// meaning. Renaming a hue is a one-line change; nothing else in the game knows
// what "navy" is.
//
// DOM-free on purpose — tests and headless rounds import this without a document.
// `applyCssVariables()` pushes the same numbers out to CSS at boot so the HTML
// chrome and the WebGL world cannot drift apart. index.html keeps matching
// literals so the first paint is correct before any script runs.
export const PALETTE = {
	// World
	page: 0x8fd7ff, // sky behind the court
	court: 0x69d66f,
	courtLine: 0xfff7c7,
	courtRim: 0xffd35d, // painted edge warning — no collision
	courtShade: 0x4aa653, // printed drop shadow on the court
	// Print language
	ink: 0x26445f, // every outline, badge and mark
	cream: 0xfffdf4, // highlight and sticker fill
	hole: 0x16233a, // the dark inside a portal
	// Identity
	teamA: 0x5db4ff,
	teamB: 0xff5d5d,
	// Ammo and weapons
	ammo: 0xffd35d, // the scarce-arrow accent: trail, reticle, marker
	ammoShaft: 0xcaa15a,
	ammoTip: 0xdfe6f0,
	ammoFletch: 0xff5d5d,
	bowl: 0x8a6cff,
	perfect: 0xff5dff, // release quality, never a damage class
	godmode: 0x8ae8ff,
	godmodeGlow: 0xc8f0ff,
	godmodeCore: 0xe8fbff,
	godmodeDeep: 0x1a4466,
}

// '#rrggbb' for canvas textures, CSS and anything that wants a string.
export function hex(role) {
	return `#${PALETTE[role].toString(16).padStart(6, '0')}`
}

// Roles that also exist as CSS custom properties on :root.
const CSS_ROLES = {
	page: '--page-bg',
	court: '--court-bg',
	courtLine: '--court-line',
	courtRim: '--court-rim',
	ink: '--ui-text',
	ammo: '--accent-bow',
	bowl: '--accent-bowl',
	perfect: '--accent-perfect',
	teamA: '--team-a',
	teamB: '--team-b',
}

export function applyCssVariables(
	root = typeof document === 'undefined' ? null : document.documentElement,
) {
	if (!root) return
	for (const [role, prop] of Object.entries(CSS_ROLES)) root.style.setProperty(prop, hex(role))
}
