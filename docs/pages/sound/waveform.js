// A sound drawn as its waveform, with the rule lines from docs/sound.md: the peak should land by 25 ms, a fight
// tail should be over by 400 ms. The first half second fills the width, so short sounds compare at a glance; a longer
// sound runs off the edge with a fade.
const SPAN = 0.5 // seconds across the full width

export function drawWave(canvas, buffer, { color = '#1d1a17', rules = true } = {}) {
	const ratio = devicePixelRatio || 1
	const width = canvas.clientWidth
	const height = canvas.clientHeight
	if (!width || !height) return
	canvas.width = width * ratio
	canvas.height = height * ratio
	const g = canvas.getContext('2d')
	g.scale(ratio, ratio)
	g.clearRect(0, 0, width, height)
	const x = (seconds) => (seconds / SPAN) * width
	if (rules) {
		g.fillStyle = '#e0453a14'
		g.fillRect(x(0.4), 0, width, height)
		g.strokeStyle = '#1d1a1733'
		g.setLineDash([3, 3])
		for (const at of [0.025, 0.4]) {
			g.beginPath()
			g.moveTo(x(at) + 0.5, 0)
			g.lineTo(x(at) + 0.5, height)
			g.stroke()
		}
		g.setLineDash([])
	}
	if (!buffer) return
	// Peak per pixel column across channels, drawn mirrored.
	const data = [...Array(buffer.numberOfChannels).keys()].map((c) => buffer.getChannelData(c))
	const perPixel = (buffer.sampleRate * SPAN) / width
	const mid = height / 2
	let loudest = 0
	const peaks = new Float32Array(width)
	for (let px = 0; px < width; px++) {
		const from = Math.floor(px * perPixel)
		const to = Math.min(Math.floor((px + 1) * perPixel), buffer.length)
		let peak = 0
		for (const channel of data)
			for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(channel[i]))
		peaks[px] = peak
		loudest = Math.max(loudest, peak)
	}
	// Each sound fills the height, so its shape reads however quiet it is; its level is in the numbers.
	const scale = (mid - 2) / Math.max(loudest, 0.01)
	g.fillStyle = color
	for (let px = 0; px < width; px++) {
		const h = Math.max(peaks[px] * scale, peaks[px] > 0.001 ? 0.5 : 0)
		g.fillRect(px, mid - h, 1, h * 2)
	}
	if (buffer.duration > SPAN) {
		const fade = g.createLinearGradient(width - 24, 0, width, 0)
		fade.addColorStop(0, '#0000')
		fade.addColorStop(1, '#000')
		g.globalCompositeOperation = 'destination-out'
		g.fillStyle = fade
		g.fillRect(width - 24, 0, 24, height)
		g.globalCompositeOperation = 'source-over'
	}
}
