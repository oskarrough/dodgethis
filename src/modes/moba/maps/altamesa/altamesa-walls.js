import { tune } from '../../tune.js'
import { carvedWalls } from '../../carve.js'

export function cover({ boxes, m, print, material }) {
	let seed = 0
	const rand = () => {
		const n = Math.sin(++seed * 12.9898 + 4.1) * 43758.5453
		return n - Math.floor(n)
	}
	const { stone, moss } = carvedWalls(
		boxes,
		(b) => Math.min(b.kind === 'hedge' ? m.hedgeHeight : m.wallHeight, m.wallHeight),
		tune.altamesa.walls,
		rand,
	)
	print(stone ? [stone] : [], material('courtShade'), 'altamesa-carved-sandstone')
	print(moss ? [moss] : [], material('court'), 'altamesa-wall-moss')
}
