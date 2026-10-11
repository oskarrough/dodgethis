// Numbers for a rendered sound, so agents judge sounds without ears (docs/sound.md, "Tooling"), and the rules
// from docs/sound.md they're checked against. Levels are dBFS at full game volume with nothing panned or far.

const db = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity)
const fromDb = (d) => 10 ** (d / 20)

// In-place radix-2 FFT of re/im (length a power of two).
function fft(re, im) {
	const n = re.length
	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1
		for (; j & bit; bit >>= 1) j ^= bit
		j ^= bit
		if (i < j) {
			;[re[i], re[j]] = [re[j], re[i]]
			;[im[i], im[j]] = [im[j], im[i]]
		}
	}
	for (let size = 2; size <= n; size <<= 1) {
		const step = (-2 * Math.PI) / size
		for (let start = 0; start < n; start += size)
			for (let k = 0; k < size / 2; k++) {
				const cos = Math.cos(step * k)
				const sin = Math.sin(step * k)
				const a = start + k
				const b = a + size / 2
				const tr = re[b] * cos - im[b] * sin
				const ti = re[b] * sin + im[b] * cos
				re[b] = re[a] - tr
				im[b] = im[a] - ti
				re[a] += tr
				im[a] += ti
			}
	}
}

// length: first to last sample within 60 dB of the peak. attack: start to peak. tail: peak to the last sample
// within 40 dB of it. rms: over the length. centroid: the spectrum's centre of mass, the timbre's brightness.
export function measure(buffer) {
	const rate = buffer.sampleRate
	const mono = new Float32Array(buffer.length)
	for (let c = 0; c < buffer.numberOfChannels; c++) {
		const data = buffer.getChannelData(c)
		for (let i = 0; i < data.length; i++) mono[i] += data[i] / buffer.numberOfChannels
	}
	let peak = 0
	let peakAt = 0
	for (let i = 0; i < mono.length; i++)
		if (Math.abs(mono[i]) > peak) {
			peak = Math.abs(mono[i])
			peakAt = i
		}
	if (!peak) return null
	const above = (level, from = 0) => {
		let first = -1
		let last = -1
		for (let i = from; i < mono.length; i++)
			if (Math.abs(mono[i]) >= level) {
				if (first < 0) first = i
				last = i
			}
		return [first, last]
	}
	const [start, end] = above(peak * fromDb(-60))
	const [, tailEnd] = above(peak * fromDb(-40), peakAt)
	let sum = 0
	for (let i = start; i <= end; i++) sum += mono[i] * mono[i]
	const size = 2048
	let weighted = 0
	let total = 0
	for (let at = start; at < end; at += size) {
		const re = new Float32Array(size)
		const im = new Float32Array(size)
		for (let i = 0; i < size && at + i < mono.length; i++)
			re[i] = mono[at + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)))
		fft(re, im)
		for (let k = 1; k < size / 2; k++) {
			const magnitude = Math.hypot(re[k], im[k])
			weighted += magnitude * ((k * rate) / size)
			total += magnitude
		}
	}
	const ms = (samples) => Math.round((samples / rate) * 1000)
	return {
		length: ms(end - start + 1),
		attack: ms(peakAt - start),
		tail: ms(tailEnd - peakAt),
		peak: Math.round(db(peak) * 10) / 10,
		rms: Math.round(db(Math.sqrt(sum / (end - start + 1))) * 10) / 10,
		centroid: Math.round(total ? weighted / total : 0),
	}
}

export const describe = (n) =>
	n
		? `${n.length} ms · attack ${n.attack} ms · tail ${n.tail} ms · peak ${n.peak} dB · rms ${n.rms} dB · ${(n.centroid / 1000).toFixed(1)} kHz`
		: 'silent'

// Calm sources play outside fights: no tail limit, no timbre family.
const calm = ['Menus', 'Lobby', 'Splash and descent', 'Music', 'Progress']
const median = (list) => list.toSorted((a, b) => a - b)[Math.floor(list.length / 2)]

// The docs/sound.md rules, per use: { id: [flags] }. `rows` is [{ id, source, numbers }].
export function check(rows) {
	const families = Map.groupBy(
		rows.filter((r) => r.numbers),
		(r) => r.source,
	)
	const centre = new Map(
		[...families].map(([source, list]) => [
			source,
			list.length >= 3 ? median(list.map((r) => r.numbers.centroid)) : 0,
		]),
	)
	const flags = {}
	for (const { id, source, numbers: n } of rows) {
		if (!n) continue
		const found = []
		if (n.attack > 25) found.push(`slow attack ${n.attack} ms (front-load: under 25)`)
		if (!calm.includes(source) && n.tail > 400) found.push(`tail ${n.tail} ms (fight: under 400)`)
		if (source === 'Menus' && n.peak > -18) found.push(`peak ${n.peak} dB (UI is soft: under −18)`)
		const c = !calm.includes(source) && centre.get(source)
		if (c && (n.centroid > c * 3 || n.centroid < c / 3))
			found.push(
				`timbre ${(n.centroid / 1000).toFixed(1)} kHz, its family centres on ${(c / 1000).toFixed(1)}`,
			)
		if (found.length) flags[id] = found
	}
	return flags
}
