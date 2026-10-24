import { createGnomon } from './gnomon-fight.js'
import { gnomonBotThreats } from './gnomon-bots.js'

// Gnomon, the last boss atop the stair: an old sundial's pin. Its shadow falls like an hour hand
// at each hero in turn, lengthening before it lands and holds whoever it covers, so step aside.
// Its dial fills toward the hour it turns back, when it takes back the life it had before. Every
// boon the wings leave changes this fight (`gnomon-fight.js`).
export default { name: 'Gnomon', create: createGnomon, botThreats: gnomonBotThreats }
