import { createTinajaBotijo } from './tinajaBotijo-fight.js'

// The central court. Tinaja the jar and Botijo the jug share one wheel, and if you kill one, the
// other will simply spin it back to life. Kept close they share their wounds, so drag them apart,
// and when one falls, see that the second falls before the wheel has turned. The one at the wheel will not fight you.
export default { name: 'Tinaja & Botijo', create: createTinajaBotijo }
