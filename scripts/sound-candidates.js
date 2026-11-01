// Keep the deploy's small, read-only library in step with the dev box's shortlists.
// CI has no sounds/osk-sfx/: it validates and ships the committed snapshot instead.
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

const ROOT = 'public/sfx/candidates'
const MANIFEST = join(ROOT, 'shortlists.json')
const SOURCE = 'sounds/shortlists.json'
const LIBRARY = 'sounds/osk-sfx'

export function syncCandidates() {
	const local = existsSync(SOURCE) && existsSync(LIBRARY)
	const lists = JSON.parse(readFileSync(local ? SOURCE : MANIFEST, 'utf8'))
	const shortlists = Object.fromEntries(
		Object.entries(lists).map(([id, list]) => [id, list.slice(0, 5)]),
	)
	const files = [
		...new Set(
			Object.values(shortlists)
				.flat()
				.map((c) => c.file),
		),
	].sort()
	// An empty or missing shortlist is a broken sync, not a wish to delete the committed candidates.
	if (local && !files.length)
		throw new Error(
			`${SOURCE} names no sounds; run sound:check first, then sound:sync. Candidates left as they were.`,
		)
	for (const file of files) {
		if (!file || file.startsWith('/') || file.split(/[\\/]/).some((part) => part === '..' || !part))
			throw new Error(`Invalid candidate path: ${file}`)
		if (!existsSync(join(local ? LIBRARY : join(ROOT, 'library'), file)))
			throw new Error(`Missing candidate sound: ${file}`)
	}
	if (local) {
		// Validate first, then replace the snapshot so removed candidates cannot linger in the deploy.
		rmSync(join(ROOT, 'library'), { recursive: true, force: true })
		for (const file of files) {
			const target = join(ROOT, 'library', file)
			mkdirSync(dirname(target), { recursive: true })
			copyFileSync(join(LIBRARY, file), target)
		}
		writeFileSync(MANIFEST, JSON.stringify(shortlists, null, '\t') + '\n')
	}
	const shipped = readdirSync(join(ROOT, 'library'), { recursive: true })
		.filter((file) => statSync(join(ROOT, 'library', file)).isFile())
		.sort()
	if (JSON.stringify(shipped) !== JSON.stringify(files))
		throw new Error(
			'Candidates library differs from its shortlist snapshot. Rebuild on the dev box.',
		)
	const bytes = files.reduce((sum, file) => sum + statSync(join(ROOT, 'library', file)).size, 0)
	console.log(
		`Sound candidates: ${files.length} library files, ${(bytes / 1024 / 1024).toFixed(2)} MiB.`,
	)
}

if (import.meta.main) syncCandidates()
