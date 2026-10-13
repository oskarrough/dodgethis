// Player control preferences and the keyboard scheme's armed state. The preference persists; the armed state is transient.
const KEY = 'dodgethis.quickCast'
const PRESET_KEY = 'dodgethis.controls'
const PRESET_IDS = ['moba', 'wasd', 'keyboard']
const read = (key) => {
	try {
		return globalThis.localStorage?.getItem(key) ?? null
	} catch {
		return null // Storage can be unavailable in private contexts.
	}
}
const write = (key, value) => {
	try {
		globalThis.localStorage?.setItem(key, value)
	} catch {
		/* The preference still works for this session. */
	}
}

// quickCast: Q W E R cast on key-down. Off (default): hold to aim, release to cast.
// preset: which keyboard and mouse bindings are live, an `intents.js` PRESETS id. The pad ignores it.
// attackArmed: A was pressed and the next left click is an attack-move; the mode reads it for the cursor.
export const controls = {
	quickCast: read(KEY) === 'on',
	preset: PRESET_IDS.includes(read(PRESET_KEY)) ? read(PRESET_KEY) : 'moba',
	attackArmed: false,
}

export function setQuickCast(on) {
	controls.quickCast = !!on
	write(KEY, controls.quickCast ? 'on' : 'off')
}

// Step to the next preset, wrapping, and remember it.
export function cyclePreset() {
	controls.preset = PRESET_IDS[(PRESET_IDS.indexOf(controls.preset) + 1) % PRESET_IDS.length]
	controls.attackArmed = false
	write(PRESET_KEY, controls.preset)
	return controls.preset
}
