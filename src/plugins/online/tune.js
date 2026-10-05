// All inbound guest messages, including lobby/control traffic, spend the same seat budget.
export const tune = {
	input: {
		rate: 120, // messages per rateWindow
		cap: 2048, // UTF-8 bytes, checked before JSON.parse
		rateWindow: 1, // seconds
		rejectionWindow: 3, // seconds of dirty windows before removal
		closeDelay: 100, // ms to deliver the removal notice on the reliable channel
	},
}
