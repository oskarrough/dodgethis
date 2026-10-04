const valid = ({ line, hatch, alpha }) =>
	Number.isFinite(line) &&
	line > 0 &&
	Number.isFinite(hatch) &&
	hatch >= 0 &&
	hatch <= 1 &&
	typeof alpha === 'boolean'

// Nestable overrides; disposing an older scope must not undo a newer one.
export function createStylePresets(apply) {
	const defaults = { line: 1, hatch: 0, alpha: false }
	const stack = []
	return (preset) => {
		const next = { ...(stack.at(-1)?.value ?? defaults), ...preset }
		if (!valid(next)) throw new Error('Invalid style preset')
		const entry = { value: next }
		stack.push(entry)
		apply(next)
		const restore = () => {
			const index = stack.indexOf(entry)
			if (index < 0) return
			stack.splice(index, 1)
			apply(stack.at(-1)?.value ?? defaults)
		}
		restore.update = ({ line, hatch, alpha }) => {
			if (!valid({ line, hatch, alpha })) throw new Error('Invalid style preset')
			if (!stack.includes(entry)) return
			entry.value = { line, hatch, alpha }
			if (stack.at(-1) === entry) apply(entry.value)
		}
		return restore
	}
}
