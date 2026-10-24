import { STEP } from '../../../../core/app.js'

// Every bot steps sideways out of a lengthening shadow, the one Gnomon is aimed at too. It is
// a line that lands all at once, so it reads as a shot of no travel time.
export function gnomonBotThreats({ perceived }, view) {
	const s = view.shadow
	if (!s) return []
	return [
		{
			key: `shadow:${s.lands}`,
			from: { x: s.x, z: s.z },
			dir: s.dir,
			range: s.length,
			radius: s.width / 2,
			speed: Infinity,
			delay: Math.max(0, s.lands - perceived.tick) * STEP,
		},
	]
}
