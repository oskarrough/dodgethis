// The run's goal in the top bar, drawn instead of written: one small mark per Warden, in map order.
// A fallen Warden's mark is struck through; Gnomon's keeps a lock until the stair opens.
const svg = (body) => `<svg viewBox="0 0 48 48" aria-hidden="true">${body}</svg>`

// Each mark is the Warden's silhouette from `dungeon-figures.js`.
const GLYPHS = {
	manos: svg(
		'<path class="tone" d="M8 44 V26 L12 24 V12 H17 V22 H20 V8 H25 V22 H28 V10 H33 V24 H36 V16 H41 V34 L34 44 Z"/>',
	),
	tinajaBotijo: svg(
		'<path class="tone" d="M17 8 H31 V14 Q40 20 40 30 Q40 42 24 44 Q8 42 8 30 Q8 20 17 14 Z"/><path class="ink-line" d="M16 14 H32"/>',
	),
	fornax: svg(
		'<path class="tone" d="M10 44 V22 H38 V44 Z"/><path class="stone" d="M18 22 L20 8 H28 L30 22 Z"/><path class="ink-line" d="M17 30 H31 V44 H17 Z"/>',
	),
	barquero: svg(
		'<path class="tone" d="M4 28 H44 L36 40 H12 Z"/><path class="ink-line" d="M32 28 V6 M32 8 L16 26"/>',
	),
	carillon: svg(
		'<path class="tone" d="M18 12 H30 L38 38 H10 Z"/><circle class="cream" cx="24" cy="42" r="3.5"/><path class="ink-line" d="M24 4 V12"/>',
	),
	espejo: svg(
		'<path class="stone" d="M10 44 H38 V40 H10 Z"/><path class="tone" d="M12 4 H36 V38 H12 Z"/><path class="cream" d="M17 9 H31 V33 H17 Z"/><path class="ink-line" d="M22 28 L28 12"/>',
	),
	gnomon: svg(
		'<path class="stone" d="M6 44 Q24 38 42 44 Z"/><path class="tone" d="M24 4 L34 40 H14 Z"/><path class="ink-line" d="M24 14 V36"/>',
	),
}
const FALLBACK = svg('<circle class="tone" cx="24" cy="24" r="15"/>')

// The padlock that sits on Gnomon while he sleeps.
export const LOCK = svg(
	'<path class="cream" d="M10 22 H38 V42 H10 Z"/><path class="ink-line" d="M16 22 V16 Q16 8 24 8 Q32 8 32 16 V22"/><circle class="gold" cx="24" cy="32" r="3"/>',
)

// `state`: open (can be fought), fighting (a pull is on), asleep (Gnomon, locked) or down (fallen).
export function wardenMarks(sim) {
	return (sim?.dungeon?.encounters ?? []).map((e) => ({
		id: e.id,
		name: e.name,
		icon: GLYPHS[e.id] ?? FALLBACK,
		last: e.last,
		state: e.killed ? 'down' : e.dormant ? 'asleep' : e.fighting ? 'fighting' : 'open',
	}))
}
