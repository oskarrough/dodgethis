// Start Vite, then: node scripts/verify-style-preset.mjs http://127.0.0.1:5173
import { execFileSync } from 'node:child_process'
const base = process.argv[2] ?? 'http://127.0.0.1:5173'
const session = process.argv[3] ?? 'style-proof'
const browser = (...args) =>
	execFileSync('agent-browser', ['--session', session, ...args], { encoding: 'utf8' }).trim()
try {
	browser('open', new URL('/scripts/style-preset.html', base).href)
	browser('wait', '#proof[data-done]')
	const result = JSON.parse(browser('eval', 'window.stylePresetProof'))
	console.log(JSON.stringify(result, null, 2))
	if (
		result.error ||
		result.changedBytes !== 0 ||
		result.presetChangedBytes <= 0 ||
		result.frontCornerAlpha !== 0 ||
		result.defaultCornerAlpha !== 255 ||
		result.glError !== 0
	)
		process.exitCode = 1
} finally {
	if (!process.argv[3]) browser('close')
}
