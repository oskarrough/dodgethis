// Player control preferences and the keyboard scheme's armed state. The preference persists; the armed state is transient.
const KEY = 'dodgethis.quickCast'
const read = () => {
	try {
		return globalThis.localStorage?.getItem(KEY) === 'on'
	} catch {
		return false // Storage can be unavailable in private contexts.
	}
}

// quickCast: Q W E R cast on key-down. Off (default): hold to aim, release to cast.
// attackArmed: A was pressed and the next left click is an attack-move; the mode reads it for the cursor.
export const controls = { quickCast: read(), attackArmed: false }

export function setQuickCast(on) {
	controls.quickCast = !!on
	try {
		globalThis.localStorage?.setItem(KEY, controls.quickCast ? 'on' : 'off')
	} catch {
		/* The preference still works for this session. */
	}
}
