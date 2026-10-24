import { lane } from '../lane.js'
import { createPacks } from './packs-guard.js'

// A dungeon's hand-placed enemies. They ride the lane's minion list without waves or structures.
export default { lane, population: 'packs', create: createPacks }
