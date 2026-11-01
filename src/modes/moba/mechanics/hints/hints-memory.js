// What this browser has learned: hints answered or shown, and whether hints are on. Storage may be
// missing or locked (a private window); then hints simply teach again next time.
const KEY = 'dodgethis.hints'
const blank = () => ({ off: false, learned: {}, shown: {} })
function load() {
	try {
		const saved = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null')
		return saved && typeof saved === 'object' ? { ...blank(), ...saved } : blank()
	} catch {
		return blank()
	}
}
const state = load()
function save() {
	try {
		globalThis.localStorage?.setItem(KEY, JSON.stringify(state))
	} catch {
		/* Remembered for this visit only. */
	}
}

export const hintMemory = {
	get on() {
		return !state.off
	},
	learned: (id) => !!state.learned[id],
	shown: (id) => state.shown[id] ?? 0,
	learn(id) {
		if (state.learned[id]) return
		state.learned[id] = true
		save()
	},
	show(id) {
		state.shown[id] = (state.shown[id] ?? 0) + 1
		save()
	},
	// Switching hints back on starts the lessons over.
	setOn(on) {
		state.off = !on
		if (on) Object.assign(state, { learned: {}, shown: {} })
		save()
	},
}
