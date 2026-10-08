// 95% intervals for bot-farm win rates. Small samples are the norm here, so Wilson, not p ± 2σ.
const Z = 1.96

// Wilson score interval for k wins in n decided matches, as fractions.
export function wilson(k, n, z = Z) {
	if (!n) return [0, 1]
	const p = k / n,
		z2 = z * z
	const centre = (p + z2 / (2 * n)) / (1 + z2 / n)
	const half = (z / (1 + z2 / n)) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n)) || 0
	return [Math.max(0, centre - half), Math.min(1, centre + half)]
}

// Newcombe's hybrid score interval for p1 − p2 from two independent samples.
export function difference(k1, n1, k2, n2, z = Z) {
	const p1 = n1 ? k1 / n1 : 0,
		p2 = n2 ? k2 / n2 : 0
	const [l1, u1] = wilson(k1, n1, z),
		[l2, u2] = wilson(k2, n2, z)
	const d = p1 - p2
	return [
		d - Math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2),
		d + Math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2),
	]
}

const pct = (x) => Math.round(100 * x)
const signed = (x) => (x > 0 ? '+' : '') + pct(x)

// "54% [41–66]"
export const rateCell = (k, n) => {
	if (!n) return '-'
	const [lo, hi] = wilson(k, n)
	return `${pct(k / n)}% [${pct(lo)}–${pct(hi)}]`
}

// "+12 [-6..+29]", in points.
export const deltaCell = ([lo, hi], d) => `${signed(d)} [${signed(lo)}..${signed(hi)}]`

// A rate is decided when its interval leaves 50%; a delta when its interval leaves 0.
export const rateDecided = (k, n) => n > 0 && (wilson(k, n)[0] > 0.5 || wilson(k, n)[1] < 0.5)
export const deltaDecided = ([lo, hi]) => lo > 0 || hi < 0

export function deltaVerdict([lo, hi], better = 'working copy', worse = 'base') {
	if (lo > 0) return `${better} higher`
	if (hi < 0) return `${worse} higher`
	return 'no difference detected'
}
