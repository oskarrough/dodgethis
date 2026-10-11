// Heroes first: ability.js alone hits the tune ↔ heroes import cycle.
import { HEROES } from './heroes.js'
import { ABILITIES, abilityOf } from './ability.js'
import { tune } from './tune.js'
import { tune as frontTune } from './front/tune.js'

// The sound table (docs/sound.md): every use the game makes a sound for, by source. The game plays a use by id
// (`playUse` in sounds.js), the sound board (docs/pages/sound/) auditions and swaps it, and `facts` says which uses each
// fact can set off, an empty list meaning silent. `voice` names a sound in `sounds.js` (look.sounds or core sfx).
// `recipe` is a blip read live from a tune block, `play` a custom player and `music` a music scene.

const use = (source, about, voice) => ({ source, about, voice })
const synth = (source, about, recipe) => ({ source, about, recipe })

// Ability uses come from each ability's `effects`: cast, shot (its projectile), hit and impact.
const parts = { cast: 'cast', shot: 'projectile', hit: 'hit', impact: 'impact' }
const partAbout = {
	cast: 'cast starts',
	shot: 'projectile leaves',
	hit: 'projectile hits',
	impact: 'lands on its targets',
}
const owners = { return: HEROES.mitts.name }
for (const hero of Object.values(HEROES))
	for (const ability of [...Object.values(hero.abilities), ABILITIES[hero.basic?.id]])
		if (ability) owners[ability.id] ??= hero.name
const abilityUses = {}
for (const id of [...Object.keys(ABILITIES), 'return']) {
	const effects = abilityOf(id).effects ?? {}
	for (const [part, key] of Object.entries(parts))
		if (effects[key])
			abilityUses[`${id}.${part}`] = use(
				owners[id] ?? 'Unowned abilities',
				`${id === 'return' ? 'Catch return' : (ABILITIES[id]?.name ?? id)}: ${partAbout[part]}`,
				effects[key],
			)
}

export const uses = {
	...abilityUses,
	'basic.shot': use('Basic attack', 'A hero without its own basic attack shoots', 'attack'),
	'basic.hit': use('Basic attack', 'That shot hits', 'attackHit'),

	ballWarn: use('Ball', 'The Ball is about to spawn', 'ballWarn'),
	ballSpawn: use('Ball', 'The Ball spawns', 'ballSpawn'),
	ballContested: use('Ball', 'Two teams channel the Ball at once', 'ballContested'),
	ballChannel: use('Ball', 'A hero starts channelling the Ball', 'ballChannel'),
	ballInterrupted: use('Ball', 'A Ball channel is interrupted', 'ballInterrupted'),
	ballDenied: use('Ball', 'Ball pickup or throw refused', 'ballDenied'),
	ballPickup: use('Ball', 'A hero picks up the Ball', 'ballPickup'),
	ballWindup: use('Ball', 'Ball throw winds up', 'ballWindup'),
	ballThrow: use('Ball', 'The Ball is thrown', 'ballThrow'),
	ballHit: use('Ball', 'The Ball hits a hero', 'ballHit'),
	ballGoal: use('Ball', 'The Ball hits a structure (goal)', 'ballGoal'),
	ballBounce: use('Ball', 'The Ball bounces', 'ballBounce'),
	ballDrop: use('Ball', 'The carrier drops the Ball', 'ballDrop'),
	ballPop: use('Ball', 'The Ball pops', 'ballPop'),

	'tower.shot': use('Structures', 'A tower fires', 'tower'),
	'tower.hit': use('Structures', 'A tower shot hits', 'tower'),
	'core.shot': use('Structures', 'The core fires', 'core'),
	'core.hit': use('Structures', 'A core shot hits', 'core'),
	structureDown: use('Structures', 'A structure falls', 'structureDown'),

	'melee.hit': use('Minions', 'A melee minion hits', 'melee'),
	'brute.hit': use('Minions', 'A brute hits', 'brute'),
	'ranged.shot': use('Minions', 'A ranged minion fires', 'ranged'),
	'ranged.hit': use('Minions', 'A ranged minion shot hits', 'ranged'),
	'wizard.shot': use('Minions', 'A wizard fires', 'wizard'),
	'wizard.hit': use('Minions', 'A wizard shot hits', 'wizard'),

	blocked: use('Combat', 'A shot is blocked', 'blocked'),
	shielded: use('Combat', 'A shield absorbs a hit', 'shielded'),
	nearMiss: use('Combat', 'Your shot just misses someone', 'close'),
	'nearMiss.passed': use('Combat', 'A shot just misses you (louder when closer)', 'whoosh'),
	boardExpired: use(HEROES.pong.name, 'A bank board runs out', 'boardExpired'),
	caught: use(HEROES.mitts.name, 'Catch grabs a shot', 'caught'),
	catchExpired: use(HEROES.mitts.name, 'Catch ends empty', 'catchExpired'),
	channelCancelled: use('Combat', 'A channel is cancelled', 'channelCancelled'),
	channelEnd: use('Combat', 'A channel completes', 'channelEnd'),

	out: use('Outs', "The ref's whistle on a takedown (tweets count the streak)", 'whistle'),
	death: use('Outs', "A hero's card slaps the ground", 'cardSlap'),
	shove: use('Outs', 'A hero is shoved', 'shove'),
	dunk: use('Outs', 'A hero is dunked: the plunk', 'plunk'),
	'dunk.splash': use('Outs', 'A hero is dunked: the splash', 'splash'),

	step: use('Movement', 'Your footsteps', 'step'),
	squeak: use('Movement', 'Your sneakers squeak on a sharp turn', 'squeak'),

	xp: use('Progress', 'You gain XP', 'xp'),
	levelUp: use('Progress', 'You level up', 'levelUp'),
	globe: use('Progress', 'A globe is picked up', 'globe'),
	matchOver: use('Progress', 'The match ends', 'matchOver'),

	'ui.hover': use('Menus', 'Pointer over a button', 'hover'),
	'ui.press': use('Menus', 'Mouse down on a button', 'press'),
	'ui.confirm': use('Menus', 'Mouse up on a button', 'confirm'),
	'ui.click': use('Menus', 'Keyboard or pad activates a button', 'click'),
	'ui.nav': use('Menus', 'Keyboard or pad moves the cursor', 'nav'),
	'ui.switch': use('Menus', 'Sound is unmuted', 'switch'),
	'ui.menuOpen': use('Menus', 'A menu opens', 'menuOpen'),
	'ui.menuClose': use('Menus', 'A menu closes', 'menuClose'),

	'splash.move': synth(
		'Splash and descent',
		'The cursor moves between map tiles',
		() => frontTune.move,
	),
	'splash.enter': {
		source: 'Splash and descent',
		about: 'A map tile is chosen (two notes)',
		play: (audio, point, gain) =>
			frontTune.enter.frequencies.forEach((freq, i) =>
				audio.blip({
					...frontTune.enter,
					freq,
					gain: frontTune.enter.gain * gain,
					delay: i * frontTune.enter.gap,
					point,
				}),
			),
	},
	'splash.deny': synth('Splash and descent', 'A locked tile is chosen', () => frontTune.deny),
	'splash.mode': use('Splash and descent', 'Another mode starts from the splash', 'switch'),
	'descent.back': synth('Splash and descent', 'Back out of the descent', () => ({
		...frontTune.back,
		type: 'sine',
	})),
	'descent.drop': synth('Splash and descent', 'The crane lets go', () => frontTune.loading.drop),
	'descent.arrival': synth(
		'Splash and descent',
		'You land in the match',
		() => frontTune.loading.arrival,
	),

	'lobby.start': synth(
		'Lobby',
		'The lobby hands over to the descent',
		() => frontTune.loading.skip,
	),
	'lobby.back': synth('Lobby', 'Back out of the lobby', () => ({
		...frontTune.back,
		type: 'sine',
	})),
	'lobby.inspectOpen': synth(
		'Lobby',
		'The hero numbers panel opens',
		() => tune.lobby.inspect.openSound,
	),
	'lobby.inspectClose': synth(
		'Lobby',
		'The hero numbers panel closes',
		() => tune.lobby.inspect.closeSound,
	),
	'lobby.pick': synth('Lobby', 'You pick a hero', () => tune.lobby.pick.sound),
	'lobby.pickDenied': synth('Lobby', 'A hero pick is refused', () => tune.lobby.pick.denySound),
	'lobby.readyWalk': synth(
		'Lobby',
		'You walk toward the ready pad',
		() => tune.lobby.ready.walkSound,
	),
	'lobby.seatEnter': synth(
		'Lobby',
		'You step onto a ready seat',
		() => tune.lobby.ready.enterSound,
	),
	'lobby.seatReady': synth('Lobby', 'Every seat is ready', () => tune.lobby.ready.fullSound),
	'lobby.readyCancel': synth(
		'Lobby',
		'You leave the ready seat',
		() => tune.lobby.ready.cancelSound,
	),
	'lobby.galleryShot': synth(
		'Lobby',
		'You shoot at a difficulty magnet',
		() => tune.lobby.gallery.shotSound,
	),
	'lobby.galleryPick': synth('Lobby', 'A difficulty is picked', () => tune.lobby.gallery.pickSound),
	'lobby.magnetClack': synth(
		'Lobby',
		'Balls clack onto the picked magnet',
		() => tune.lobby.gallery.magnet.clackSound,
	),
	'lobby.magnetThud': synth(
		'Lobby',
		'A ball thuds onto a magnet',
		() => tune.lobby.gallery.magnet.thudSound,
	),
	'lobby.magnetLeap': synth(
		'Lobby',
		'A ball leaps off a magnet',
		() => tune.lobby.gallery.magnet.leapSound,
	),

	'music.lobby': { source: 'Music', about: 'Splash and lobby', music: 'lobby' },
	'music.play': { source: 'Music', about: 'Match', music: 'play' },
	'music.clutch': { source: 'Music', about: 'Late, close match', music: 'clutch' },
	'music.victory': { source: 'Music', about: 'Victory sting', music: 'victory' },
	'music.defeat': { source: 'Music', about: 'Defeat sting', music: 'defeat' },
}

// The bus each source plays on (tune.mix); every other source is a hero's, on `mine` or `others` (`playOwn` in sounds.js).
const BUS = {
	Menus: 'ui',
	'Splash and descent': 'ui',
	Lobby: 'ui',
	Music: 'music',
	Ball: 'world',
	Structures: 'world',
	Minions: 'world',
}
for (const use of Object.values(uses)) use.bus = BUS[use.source] ?? 'hero'

const ending = (suffix) => Object.keys(abilityUses).filter((id) => id.endsWith(suffix))
const structures = ['tower', 'core', 'melee', 'brute', 'ranged', 'wizard']

// Every fact the sim emits (`FACTS` in index.js) and the uses it can set off; [] is a fact with no sound.
export const facts = {
	ballContested: ['ballContested'],
	ballWarn: ['ballWarn'],
	ballSpawn: ['ballSpawn'],
	ballChannel: ['ballChannel'],
	ballInterrupted: ['ballInterrupted'],
	ballPickup: ['ballPickup'],
	ballWindup: ['ballWindup'],
	ballThrow: ['ballThrow'],
	ballHit: ['ballHit', 'ballGoal'],
	ballBounce: ['ballBounce'],
	ballDrop: ['ballDrop'],
	ballPop: ['ballPop'],
	ballDenied: ['ballDenied'],
	boardExpired: ['boardExpired'],
	caught: ['caught'],
	catchExpired: ['catchExpired'],
	channelCancelled: ['channelCancelled'],
	channelEnd: ['channelEnd'],
	order: [],
	cast: ending('.cast'),
	projectile: [
		'basic.shot',
		...structures.map((s) => `${s}.shot`).filter((id) => uses[id]),
		...ending('.shot'),
	],
	blocked: ['blocked'],
	cushion: [],
	hit: [
		'basic.hit',
		...structures.map((s) => `${s}.hit`).filter((id) => uses[id]),
		...ending('.hit'),
	],
	nearMiss: ['nearMiss', 'nearMiss.passed'],
	death: ['death', 'out'],
	shove: ['shove', 'out'],
	dunk: ['dunk', 'dunk.splash', 'out'],
	spawn: [],
	denied: [],
	impact: ending('.impact'),
	aggro: [],
	expired: [],
	xp: ['xp'],
	structureDown: ['structureDown'],
	shielded: ['shielded'],
	levelUp: ['levelUp'],
	swap: ['lobby.pick'],
	pick: ['lobby.galleryPick'],
	seatClaim: [],
	seatDenied: [],
	seatEnter: ['lobby.seatEnter'],
	seatEmpty: ['lobby.readyCancel'],
	seatReady: ['lobby.seatReady'],
	readyWalk: ['lobby.readyWalk'],
	readyCancel: ['lobby.readyCancel'],
	globe: ['globe'],
	camp: [],
	flagWarn: [],
	flagUp: [],
	flagTaken: [],
	flagLowered: [],
	matchOver: ['matchOver'],
}

// The use an ability fact sets off, or null when that ability makes no sound there.
export function abilityUse(ability, part) {
	return ability?.effects?.[parts[part]] && uses[`${ability.id}.${part}`]
		? `${ability.id}.${part}`
		: null
}
