import { tune } from './tune.js'
import { units } from '../../core/units.js'
import { resolveUnit } from './units.js'

// The words on a card: tune numbers spelled with their unit, and keyword markup.
// Templates read tune live, so a card follows a `&debug` edit or a level-up.

export const n = (v) => String(Number(Number(v).toFixed(2)))
export const pct = (v) => `${Math.round(v * 100)}%`

// Local tokens ({radius}) read tune[scope]; dotted tokens ({catching.pocketLife}) read
// from tune's root. hp has two prose spellings so sentences can say "damage" and "HP".
export function formatCardValue(path, value, format) {
	const unit = resolveUnit(path)
	if (!Number.isFinite(value) || !Object.hasOwn(units, unit ?? ''))
		throw new Error(`MOBA card reference: tune.${path} needs a finite number and a declared unit`)
	if (format !== undefined) {
		if (unit !== 'hp' || !['damage', 'HP'].includes(format))
			throw new Error(`MOBA card format: ${path}:${format} is not a supported unit spelling`)
		return `${n(value)} ${format}`
	}
	if (unit === 'fraction') return pct(value)
	if (unit === 'multiplier') return `×${n(value)}`
	return `${n(value)}${units[unit].suffix}`
}

// `value(path, number)` may restate a number before it is spelled, e.g. damage at the hero's level.
export function fillCardTemplate(template, scope = '', value = (_, v) => v) {
	if (typeof template !== 'string')
		throw new Error(`MOBA card template: ${scope} must declare text, not ${typeof template}`)
	return template.replace(/\{([^{}]*)\}|[{}]/g, (match, token) => {
		if (!token || !/^[A-Za-z]\w*(?:\.\w+)*(?::(?:damage|HP))?$/.test(token))
			throw new Error(`MOBA card token: ${scope} has invalid token ${match}`)
		const [ref, format] = token.split(':')
		const path = ref.includes('.') || !scope ? ref : `${scope}.${ref}`
		const raw = path
			.split('.')
			.reduce(
				(object, key) => (object && Object.hasOwn(object, key) ? object[key] : undefined),
				tune,
			)
		return formatCardValue(path, Number.isFinite(raw) ? value(path, raw) : raw, format)
	})
}

// Keywords: `[[Slow]]` is the term `slow`; `[[slows|slow]]` prints "slows" for the term `slow`.
const KEYWORD = /\[\[([^[\]|]+)(?:\|([a-z][\w-]*))?\]\]/g

// A sentence as text runs and keyword runs: ['Deals 80 damage and a ', { text: 'Slow', term: 'slow' }, '.'].
export function sentenceParts(text) {
	const parts = []
	let at = 0
	for (const match of String(text).matchAll(KEYWORD)) {
		if (match.index > at) parts.push(text.slice(at, match.index))
		parts.push({ text: match[1], term: match[2] ?? match[1].toLowerCase() })
		at = match.index + match[0].length
	}
	if (at < String(text).length) parts.push(String(text).slice(at))
	return parts
}

export const plainText = (text) => String(text).replace(KEYWORD, '$1')
export const keywordTerms = (text) =>
	[...String(text).matchAll(KEYWORD)].map((m) => m[2] ?? m[1].toLowerCase())
