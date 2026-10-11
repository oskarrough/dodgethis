// 95% intervals for bot-farm win rates. Small samples are the norm here, so Wilson, not p ± 2σ.
const Z = 1.96

// Wilson score interval for k wins in n decided matches, as fractions.
export function wilson(k, n, z = Z) {
	if (!n) return [0, 1]
	const p = k / n,
		zSquared = z * z
	const centre = (p + zSquared / (2 * n)) / (1 + zSquared / n)
	const half = (z / (1 + zSquared / n)) * Math.sqrt((p * (1 - p)) / n + zSquared / (4 * n * n)) || 0
	return [Math.max(0, centre - half), Math.min(1, centre + half)]
}

// Newcombe's hybrid score interval for p1 − p2 from two independent samples.
export function difference(k1, n1, k2, n2, z = Z) {
	const p1 = n1 ? k1 / n1 : 0,
		p2 = n2 ? k2 / n2 : 0
	const [lower1, upper1] = wilson(k1, n1, z),
		[lower2, upper2] = wilson(k2, n2, z)
	const d = p1 - p2
	return [
		d - Math.sqrt((p1 - lower1) ** 2 + (upper2 - p2) ** 2),
		d + Math.sqrt((upper1 - p1) ** 2 + (p2 - lower2) ** 2),
	]
}

const pct = (x) => Math.round(100 * x)
const signed = (x) => (x > 0 ? '+' : '') + pct(x)

// "54% [41–66]"
export const rateCell = (k, n) => {
	if (!n) return '-'
	const [low, high] = wilson(k, n)
	return `${pct(k / n)}% [${pct(low)}–${pct(high)}]`
}

// "+12 [-6..+29]", in points.
export const deltaCell = ([low, high], d) => `${signed(d)} [${signed(low)}..${signed(high)}]`

// A rate is decided when its interval leaves 50%; a delta when its interval leaves 0.
export const rateDecided = (k, n) => n > 0 && (wilson(k, n)[0] > 0.5 || wilson(k, n)[1] < 0.5)
export const deltaDecided = ([low, high]) => low > 0 || high < 0

export function deltaVerdict([low, high], better = 'working copy', worse = 'base') {
	if (low > 0) return `${better} higher`
	if (high < 0) return `${worse} higher`
	return 'no difference detected'
}
