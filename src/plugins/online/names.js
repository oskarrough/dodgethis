// Sticker names: two words a stranger can call out ("Brisk Otter"). Each tab keeps its own for the session,
// so two tabs on one machine are two people and a refresh keeps the name.
const ADJECTIVES = [
	'Brisk',
	'Bold',
	'Calm',
	'Daring',
	'Dizzy',
	'Eager',
	'Fizzy',
	'Gentle',
	'Giddy',
	'Grumpy',
	'Hasty',
	'Jolly',
	'Lucky',
	'Mellow',
	'Nimble',
	'Plucky',
	'Proud',
	'Quiet',
	'Rowdy',
	'Shy',
	'Sly',
	'Snappy',
	'Sunny',
	'Swift',
	'Tidy',
	'Wily',
	'Witty',
	'Zesty',
]
const ANIMALS = [
	'Badger',
	'Bison',
	'Crane',
	'Crow',
	'Eel',
	'Ferret',
	'Gecko',
	'Goose',
	'Hare',
	'Heron',
	'Ibex',
	'Lynx',
	'Marmot',
	'Moose',
	'Newt',
	'Otter',
	'Owl',
	'Panda',
	'Puffin',
	'Quail',
	'Raven',
	'Seal',
	'Shrew',
	'Stoat',
	'Toad',
	'Walrus',
	'Wombat',
	'Yak',
]
const KEY = 'dodgethis-name'
const pick = (list, random) => list[Math.floor(random() * list.length)]

export const stickerName = (random = Math.random) =>
	`${pick(ADJECTIVES, random)} ${pick(ANIMALS, random)}`

export function playerName(storage = globalThis.sessionStorage) {
	let name = null
	try {
		name = storage?.getItem(KEY)
	} catch {
		/* storage blocked: a fresh name each load */
	}
	if (validName(name) && name) return name
	name = stickerName()
	try {
		storage?.setItem(KEY, name)
	} catch {
		/* still a name for this load */
	}
	return name
}

// A guest's client picks its own name, so the host only checks it is a short pair of words.
export const validName = (name) =>
	name == null || (typeof name === 'string' && /^[A-Za-z]{2,12} [A-Za-z]{2,12}$/.test(name))
