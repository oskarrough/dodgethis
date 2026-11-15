// LAN helpers for dev-agent.sh --lan and review.js.
// CLI: bun scripts/dev-agent-lan.js <port> [pagepath]  prints the tailnet URL, curls the page and its media, exits 1 on a miss.
import { realpathSync } from 'node:fs'

// The tailnet name of this machine, from tailscale itself.
export function lanHost() {
	const out = Bun.spawnSync(['tailscale', 'status', '--self', '--json'])
	if (out.exitCode !== 0) throw new Error('tailscale status failed; is tailscale up?')
	return JSON.parse(out.stdout.toString()).Self.DNSName.replace(/\.$/, '')
}

// The port of a server that runs from this checkout and listens beyond loopback, else ''.
export function lanPort(root) {
	const out = Bun.spawnSync(['ss', '-ltnpH']).stdout.toString()
	for (const line of out.split('\n')) {
		const match = line.match(/\s(0\.0\.0\.0|\*|\[::\]):(\d+)\s.*pid=(\d+)/)
		if (!match) continue
		try {
			if (realpathSync(`/proc/${match[3]}/cwd`) === root) return match[2]
		} catch {}
	}
	return ''
}

// The LAN server's base URL if one is up for this checkout and answers, else ''.
export async function lanBase(root) {
	const port = lanPort(root)
	if (!port) return ''
	const base = `http://${lanHost()}:${port}`
	try {
		return (await fetch(base + '/', { signal: AbortSignal.timeout(2000) })).ok ? base : ''
	} catch {
		return ''
	}
}

// Vite answers a missing path with the game's index.html and a 200, so a miss is a non-200,
// a copy of the front page, or HTML where a picture or clip was expected.
async function check(url, fallback) {
	let reason
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
		const type = res.headers.get('content-type') ?? ''
		const text = /html/.test(type) ? await res.text() : ''
		if (!res.ok) reason = String(res.status)
		else if (fallback && text === fallback)
			reason = 'missing (the dev server sent the game instead)'
		else if (
			text &&
			/\.(png|jpe?g|webp|avif|gif|webm|mp4|svg|css|js)$/i.test(new URL(url).pathname)
		)
			reason = 'missing (HTML where a file was expected)'
		else return { res, text }
	} catch (error) {
		reason = error.message
	}
	console.error(`✗ ${reason}: ${url}`)
	return null
}

if (import.meta.main) {
	const [port, path = '/'] = Bun.argv.slice(2)
	const base = `http://${lanHost()}:${port}`
	const page = new URL(path.startsWith('/') ? path : '/' + path, base)
	const front = page.pathname === '/' ? '' : ((await check(base + '/'))?.text ?? '')
	const hit = await check(page.href, front)
	let bad = hit ? 0 : 1
	const refs = new Set()
	if (hit?.text) {
		for (const match of hit.text.matchAll(/\b(?:src|href)="([^"#]+)"/g)) {
			const ref = new URL(match[1], page)
			if (ref.origin === page.origin) refs.add(ref.href)
		}
		for (const ref of refs) if (!(await check(ref, front))) bad++
	}
	console.log(
		bad
			? `✗ ${bad} of ${refs.size + 1} did not load`
			: `${page.href}  (page and ${refs.size} files load)`,
	)
	process.exit(bad ? 1 : 0)
}
