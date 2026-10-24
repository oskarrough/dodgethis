import { STEP } from '../../../../core/app.js'
import { tune } from '../../tune.js'

// Every bot, the one Carillon is hitting too, steps out of a warned toll.
export function carillonBotThreats({ perceived }, view) {
	if (!view.toll) return []
	return [
		{
			key: `toll:${view.toll.lands}`,
			centre: { x: view.toll.x, z: view.toll.z },
			radius: tune.encounters.carillon.toll.radius,
			delay: Math.max(0, view.toll.lands - perceived.tick) * STEP,
		},
	]
}
