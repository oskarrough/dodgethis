// All inbound guest messages, including lobby/control traffic, spend the same seat budget.
export const tune = {
	link: { queuedEnvelopes: 2, samples: 6000, maxFacts: 256 },
	room: { rejoinFor: 60 }, // seconds a refreshed tab may take its old seat back
	input: {
		rate: 120, // tokens refilled per second
		burst: 360, // enough for fresh input behind a short stall's backlog
		cap: 2048, // UTF-8 bytes, checked before JSON.parse
		dirtyWindow: 1, // seconds per abuse-history window
		historyWindows: 5,
		rejectionWindows: 3, // dirty windows within historyWindows trigger removal
		closeDelay: 1000, // ms fallback; normally the guest closes after reading the notice
	},
}
