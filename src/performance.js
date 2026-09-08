// Bounded, opt-in measurements: frame intervals include browser/GPU waiting, CPU timings only measure JS work and WebGL submission.
export function createPerformanceMonitor(capacity = 1800) {
	const samples = []
	let cursor = 0
	return {
		enabled: false,
		reset() {
			samples.length = 0
			cursor = 0
		},
		record(sample) {
			samples[cursor++ % capacity] = sample
		},
		report() {
			const summary = {}
			for (const key of ['frame', 'simulation', 'presentation', 'render', 'cpu']) {
				const values = samples.map((s) => s[key]).sort((a, b) => a - b)
				summary[key] = values.length
					? {
							mean: values.reduce((a, b) => a + b, 0) / values.length,
							p95: values[Math.ceil(values.length * 0.95) - 1],
							max: values.at(-1),
						}
					: null
			}
			return {
				samples: samples.length,
				budgetMs: 1000 / 144,
				fps: summary.frame ? 1000 / summary.frame.mean : null,
				ms: summary,
			}
		},
	}
}
