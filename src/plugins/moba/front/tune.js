// Timing, motion and synth are live; authored world geometry stays in backdrop.js.
export const tune = {
	skyFade: 0.8,
	parallax: { depth: 0.012, response: 0.18, settle: 0.05 },
	confirm: { frequencies: [261.63, 329.63, 392], dur: 0.65, gain: 0.055 },
	back: { freq: 174.61, slideTo: 130.81, dur: 0.25, gain: 0.055 },
}
