// Turns Tuner tweaks into a GitHub new-issue URL a player can send to a maintainer.
export const ISSUE_NEW = 'https://github.com/oskarrough/dodgethis/issues/new'
export const ISSUE_TEMPLATE = 'tuning-idea.md'
export const ISSUE_LABEL = 'tuning'
// GitHub 414s request URLs around 8 KB; stay under that with room for the path.
export const ISSUE_URL_MAX = 7800

const SKIP_FOLDER = new Set([
	'abilities',
	'hero',
	'heroes',
	'engine',
	'lane',
	'controls',
	'feel',
	'sounds',
])

export function prettyId(id) {
	return String(id)
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.replace(/^./, (c) => c.toUpperCase())
}

export function formatTune(v) {
	if (typeof v === 'boolean') return v ? 'on' : 'off'
	if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(+v.toFixed(4))
	return String(v)
}

export function folderOf(key) {
	const parts = key.split('/')
	const folders = parts.slice(0, -1).filter((p) => !SKIP_FOLDER.has(p))
	return folders.at(-1) ?? parts.at(-2) ?? parts[0]
}

export function issueTitle(changes, hero) {
	const groups = []
	const seen = new Map()
	for (const ch of changes) {
		const folder = prettyId(ch.folder)
		if (!seen.has(folder)) {
			seen.set(folder, [])
			groups.push(folder)
		}
		seen.get(folder).push(`${ch.property} ${formatTune(ch.to)}`)
	}
	const bits = groups.map((folder) => `${folder} ${seen.get(folder).join(', ')}`)
	const who = hero ? `${prettyId(hero)} ` : ''
	let title = `Tuning idea: ${who}${bits.join('; ')}`
	if (title.length <= 90) return title
	const first = bits[0] ?? 'Tuner tweaks'
	const extra = changes.length > 1 ? `, +${changes.length - 1} more` : ''
	title = `Tuning idea: ${who}${first}${extra}`
	return title.length <= 256 ? title : `${title.slice(0, 253)}…`
}

function changeLine(ch) {
	const where = `${prettyId(ch.folder)} / ${ch.property}`
	if (ch.from === undefined) return `- **${where}:** ${formatTune(ch.to)}`
	return `- **${where}:** ${formatTune(ch.from)} → ${formatTune(ch.to)}`
}

export function issueBody({ changes, json, includeJson, limit = Infinity }) {
	const listed = limit === 0 ? [] : changes.slice(0, limit)
	const more = changes.length - listed.length
	const lines = listed.map(changeLine)
	if (more > 0) lines.push(`- …and ${more} more (in the JSON)`)
	const parts = [
		'## Changed values',
		'',
		...(lines.length ? lines : ['- (see Tuner JSON)']),
		'',
		'## Tuner JSON',
		'',
	]
	if (includeJson) parts.push('```json', json, '```', '')
	else parts.push('<!-- Paste JSON from the Tuner Copy button. -->', '')
	parts.push('## Why', '', '_What felt better, and in which situation?_')
	return parts.join('\n')
}

function issueUrl(title, body) {
	const params = [
		['template', ISSUE_TEMPLATE],
		['labels', ISSUE_LABEL],
		['title', title],
		['body', body],
	]
		.map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
		.join('&')
	return `${ISSUE_NEW}?${params}`
}

export function shareIssue({ changes, values, hero }) {
	const json = JSON.stringify(values, null, '\t')
	const title = issueTitle(changes, hero)
	const tryUrl = (includeJson, limit) => {
		const body = issueBody({ changes, json, includeJson, limit })
		const url = issueUrl(title, body)
		return { url, includeJson, ok: url.length <= ISSUE_URL_MAX }
	}
	const fit =
		[tryUrl(true, Infinity), tryUrl(false, Infinity), tryUrl(false, 8), tryUrl(false, 0)].find(
			(a) => a.ok,
		) ?? tryUrl(false, 0)
	return { url: fit.url, omittedJson: !fit.includeJson, json }
}

// A Tuner path names its map at the segment that is the map's tune key (`overthrow`) or starts one
// (`overthrowTerrain`): `style/overthrow/colors/tarmac` is tune.overthrow.colors.tarmac.
function tunePathIn(key, map) {
	const parts = key.split('/')
	const at = parts.findIndex((p) => p === map || (p.startsWith(map) && /[A-Z]/.test(p[map.length])))
	return at < 0 ? null : parts.slice(at)
}

const literal = (v) =>
	typeof v === 'string'
		? `'${v.replaceAll("'", "\\'")}'`
		: typeof v === 'number'
			? formatTune(v)
			: String(v)

// Changed values as object literals to merge into <map>-tune.js, each with its old value; values
// from outside the map's tune follow as comments. `map` is the map id, as in ?map=; without one,
// the map whose lane or style section was changed.
export function tuneSnippet(changes, map) {
	map ??= changes.map((ch) => ch.key.match(/^(?:lane|style)\/([^/]+)/)?.[1]).find(Boolean)
	const tree = {}
	const elsewhere = []
	for (const ch of changes) {
		const path = map && tunePathIn(ch.key, map)
		if (!path) {
			elsewhere.push(`// ${ch.key}: ${literal(ch.to)}`)
			continue
		}
		let node = tree
		for (const p of path.slice(0, -1)) node = node[p] ??= {}
		node[path.at(-1)] = ch
	}
	const lines = []
	const write = (node, depth) => {
		const pad = '\t'.repeat(depth)
		for (const [k, v] of Object.entries(node)) {
			if (v.key === undefined) {
				lines.push(`${pad}${k}: {`)
				write(v, depth + 1)
				lines.push(`${pad}},`)
			} else {
				const was = v.from === undefined ? '' : ` // was ${literal(v.from)}`
				lines.push(`${pad}${k}: ${literal(v.to)},${was}`)
			}
		}
	}
	write(tree, 0)
	const head = lines.length
		? [`// Merge into src/modes/moba/maps/${map}/${map}-tune.js`]
		: [`// Nothing changed in ${map ?? 'a map'}'s tune`]
	const tail = elsewhere.length ? ['', '// Not in the map tune:', ...elsewhere] : []
	return [...head, ...lines, ...tail].join('\n')
}
