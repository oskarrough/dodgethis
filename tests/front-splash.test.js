import { expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')
const read = (path) => readFileSync(join(root, path), 'utf8')
function sources(dir) {
	return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory()
			? sources(join(dir, entry.name))
			: /\.(js|css|html)$/.test(entry.name)
				? [join(dir, entry.name)]
				: [],
	)
}

test('the mode switch lives only on the splash, never in-game', () => {
	expect(existsSync(join(root, 'src/plugins/mode-picker'))).toBe(false)
	expect(read('index.html')).not.toContain('mode-picker')
	expect(read('index.html')).not.toContain('data-mode')
	expect(read('src/main.js')).not.toContain('mode-picker')
	const switches = [...sources('src'), 'index.html'].filter(
		(path) =>
			!path.startsWith('src/plugins/moba/front/') && /data-mode|mode-picker/.test(read(path)),
	)
	expect(switches).toEqual([])
})

test('a fresh visit boots to the splash; deep links still reach each mode', () => {
	const main = read('src/main.js')
	expect(main).toMatch(/else app\.modes\.start\('moba-front'\)/)
	expect(main).toContain("query.get('mode') === 'dodgeball'")
	const front = read('src/plugins/moba/front/index.js')
	for (const mode of ['dodgeball', 'moba']) expect(front).toContain(`mode: '${mode}'`)
	expect(front).not.toContain('Back to the hub')
})

test('menu and loading chrome have no link styling', () => {
	for (const path of ['src/plugins/moba/front/front.css', 'src/plugins/moba/front/descent.css']) {
		expect(read(path)).not.toContain('text-decoration')
		expect(read(path)).not.toContain('underline')
	}
})

test('the lobby has a way back to the splash, wired by composition', () => {
	expect(read('src/plugins/dodgeball/index.js')).toContain('createCornerNav(splashEl')
	expect(read('src/main.js')).toMatch(
		/lobbyExit: \{ onSelect: \(\) => scope\.modes\.start\('moba-front'\) \}/,
	)
})
