// bun run refs [--new N] [--dir <folder>]  Contact sheets of the inspiration folder, captioned with file names.
// Any format (avif, webp, tif…) goes through ffmpeg. Sheets are cached by mtime in $TMPDIR, never in the repo.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
	args: Bun.argv.slice(2).filter((argument) => argument !== '--'),
	options: { new: { type: 'string' }, dir: { type: 'string' }, per: { type: 'string' } },
})
const dir =
	values.dir ?? process.env.REFS_DIR ?? join(homedir(), 'Dropbox/Pictures/Game inspiration')
if (!existsSync(dir)) {
	console.error(`refs: no folder at ${dir} (pass --dir or set REFS_DIR)`)
	process.exit(1)
}
const per = Number(values.per ?? 12)
let files = readdirSync(dir)
	.filter((name) => /\.(png|jpe?g|webp|avif|gif|tiff?|bmp)$/i.test(name))
	.map((name) => ({ name, mtime: statSync(join(dir, name)).mtimeMs }))
	.sort((a, b) => b.mtime - a.mtime)
if (values.new) files = files.slice(0, Number(values.new))
if (!files.length) {
	console.error('refs: no images found')
	process.exit(1)
}

const cache = join(process.env.TMPDIR || tmpdir(), 'dodgethis-refs')
mkdirSync(cache, { recursive: true })
const key = (file) =>
	createHash('sha1').update(`${dir}/${file.name}:${file.mtime}`).digest('hex').slice(0, 16)

// One 480px-wide jpg per image, through ffmpeg so avif and friends decode.
const thumbs = []
for (const file of files) {
	const out = join(cache, `${key(file)}.jpg`)
	if (!existsSync(out)) {
		const run = Bun.spawnSync(
			[
				'ffmpeg',
				'-v',
				'error',
				'-y',
				'-i',
				join(dir, file.name),
				'-frames:v',
				'1',
				'-vf',
				'scale=480:-2',
				out,
			],
			{ stderr: 'pipe' },
		)
		if (run.exitCode !== 0) {
			console.error(
				`refs: could not read ${file.name}: ${run.stderr.toString().trim().split('\n')[0]}`,
			)
			continue
		}
	}
	thumbs.push({ ...file, path: out })
}

const sheets = []
for (let start = 0; start < thumbs.length; start += per) {
	const group = thumbs.slice(start, start + per)
	const out = join(
		cache,
		`sheet-${createHash('sha1')
			.update(group.map((file) => key(file)).join())
			.digest('hex')
			.slice(0, 16)}.jpg`,
	)
	if (!existsSync(out)) {
		// montage -label wants the name per tile; '@' and '%' are special to it, so escape both
		const args = [
			'-background',
			'#1a1a1a',
			'-fill',
			'white',
			'-pointsize',
			'13',
			'-tile',
			'4x',
			'-geometry',
			'480x300+6+6',
		]
		for (const file of group)
			args.push('-label', file.name.slice(0, 60).replace(/[%@\\]/g, '_'), file.path)
		const run = Bun.spawnSync(['montage', ...args, out], { stderr: 'pipe' })
		if (run.exitCode !== 0) {
			console.error(`refs: montage failed: ${run.stderr.toString().trim()}`)
			process.exit(1)
		}
	}
	sheets.push({ out, names: group.map((file) => file.name) })
}
for (const [index, sheet] of sheets.entries())
	console.log(`${sheet.out}  (${index + 1}/${sheets.length}, ${sheet.names.length} images)`)
