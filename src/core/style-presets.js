// Nestable overrides; disposing an older scope must not undo a newer one.
export function createStylePresets(apply) {
	const defaults = { line: 1, hatch: 0, alpha: false }
	const stack = []
	return (preset) => {
		const next = { ...(stack.at(-1)?.value ?? defaults), ...preset }
		if (
			!Number.isFinite(next.line) ||
			next.line <= 0 ||
			!Number.isFinite(next.hatch) ||
			next.hatch < 0 ||
			next.hatch > 1 ||
			typeof next.alpha !== 'boolean'
		)
			throw new Error('Invalid style preset')
		const entry = { value: next }
		stack.push(entry)
		apply(next)
		return () => {
			const index = stack.indexOf(entry)
			if (index < 0) return
			stack.splice(index, 1)
			apply(stack.at(-1)?.value ?? defaults)
		}
	}
}
