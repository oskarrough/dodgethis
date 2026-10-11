// Heroes first: ability.js alone hits the tune ↔ heroes import cycle.
import { HEROES } from './heroes.js'
import { ABILITIES, abilityOf } from './ability.js'
import { tune } from './tune.js'
import { tune as frontTune } from './front/tune.js'

// The sound table (docs/sound.md): every use the game makes a sound for, by source. The game plays a use by id
// (`sounds.play`), the sound board (docs/pages/sound/) auditions and swaps it, and `facts` says which uses each
// fact can set off, an empty list meaning silent. `voice` names a sound in `sounds.js` (look.sounds or core sfx).
// Uses with `where` are still played directly by that file and can't be swapped yet; `play` is how the board
// plays them, and `music` names a music scene.

const use = (source, about, voice) => ({ source, about, voice })
const direct = (source, about, where, play) => ({ source, about, where, play })
const blip = (recipe) => (audio) => audio.blip(recipe())

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

	'ui.hover': direct('Menus', 'Pointer over a button', 'core/overlay.js', (audio) =>
		audio.sfx.hover(),
	),
	'ui.press': direct('Menus', 'Mouse down on a button', 'core/overlay.js', (audio) =>
		audio.sfx.press(),
	),
	'ui.confirm': direct('Menus', 'Mouse up on a button', 'core/overlay.js', (audio) =>
		audio.sfx.confirm(),
	),
	'ui.click': direct('Menus', 'Keyboard or pad activates a button', 'core/overlay.js', (audio) =>
		audio.sfx.click(),
	),
	'ui.nav': direct('Menus', 'Keyboard or pad moves the cursor', 'core/overlay.js', (audio) =>
		audio.sfx.nav(),
	),
	'ui.switch': direct(
		'Menus',
		'Sound unmuted; a mode starts',
		'core/browser.js, front/index.js',
		(audio) => audio.sfx.switch(),
	),
	'ui.menuOpen': direct('Menus', 'A menu opens', 'core/overlay.js', (audio) =>
		audio.sfx.menuOpen(),
	),
	'ui.menuClose': direct('Menus', 'A menu closes', 'core/overlay.js', (audio) =>
		audio.sfx.menuClose(),
	),

	'splash.move': direct(
		'Splash and descent',
		'Cursor moves between map tiles',
		'front/index.js',
		blip(() => frontTune.move),
	),
	'splash.enter': direct(
		'Splash and descent',
		'A map tile is chosen (two notes)',
		'front/index.js',
		(audio) =>
			frontTune.enter.frequencies.forEach((freq, i) =>
				audio.blip({ ...frontTune.enter, freq, delay: i * frontTune.enter.gap }),
			),
	),
	'splash.deny': direct(
		'Splash and descent',
		'A locked tile is chosen',
		'front/index.js',
		blip(() => frontTune.deny),
	),
	'descent.back': direct(
		'Splash and descent',
		'Back out of the lobby or descent',
		'front/descent.js, lobby.js',
		blip(() => ({ ...frontTune.back, type: 'sine' })),
	),
	'descent.skip': direct(
		'Splash and descent',
		'The lobby hands over to the descent',
		'lobby.js',
		blip(() => frontTune.loading.skip),
	),
	'descent.drop': direct(
		'Splash and descent',
		'The crane lets go',
		'front/descent.js',
		blip(() => frontTune.loading.drop),
	),
	'descent.arrival': direct(
		'Splash and descent',
		'You land in the match',
		'front/descent.js',
		blip(() => frontTune.loading.arrival),
	),

	'lobby.inspectOpen': direct(
		'Lobby',
		'The hero numbers panel opens',
		'lobby.js',
		blip(() => tune.lobby.inspect.openSound),
	),
	'lobby.inspectClose': direct(
		'Lobby',
		'The hero numbers panel closes',
		'lobby.js',
		blip(() => tune.lobby.inspect.closeSound),
	),
	'lobby.pick': direct(
		'Lobby',
		'You pick a hero',
		'lobby.js',
		blip(() => tune.lobby.pick.sound),
	),
	'lobby.pickDenied': direct(
		'Lobby',
		'A hero pick is refused',
		'lobby.js',
		blip(() => tune.lobby.pick.denySound),
	),
	'lobby.readyWalk': direct(
		'Lobby',
		'You walk toward the ready pad',
		'lobby.js',
		blip(() => tune.lobby.ready.walkSound),
	),
	'lobby.seatEnter': direct(
		'Lobby',
		'You step onto a ready seat',
		'lobby.js',
		blip(() => tune.lobby.ready.enterSound),
	),
	'lobby.seatReady': direct(
		'Lobby',
		'Every seat is ready',
		'lobby.js',
		blip(() => tune.lobby.ready.fullSound),
	),
	'lobby.readyCancel': direct(
		'Lobby',
		'You leave the ready seat',
		'lobby.js',
		blip(() => tune.lobby.ready.cancelSound),
	),
	'lobby.galleryShot': direct(
		'Lobby',
		'You shoot at a difficulty magnet',
		'lobby.js',
		blip(() => tune.lobby.gallery.shotSound),
	),
	'lobby.galleryPick': direct(
		'Lobby',
		'A difficulty is picked',
		'lobby.js',
		blip(() => tune.lobby.gallery.pickSound),
	),
	'lobby.magnetClack': direct(
		'Lobby',
		'Balls clack onto the picked magnet',
		'lobby-magnets.js',
		blip(() => tune.lobby.gallery.magnet.clackSound),
	),
	'lobby.magnetThud': direct(
		'Lobby',
		'A ball thuds onto a magnet',
		'lobby-magnets.js',
		blip(() => tune.lobby.gallery.magnet.thudSound),
	),
	'lobby.magnetLeap': direct(
		'Lobby',
		'A ball leaps off a magnet',
		'lobby-magnets.js',
		blip(() => tune.lobby.gallery.magnet.leapSound),
	),

	'music.lobby': { source: 'Music', about: 'Splash and lobby', music: 'lobby' },
	'music.play': { source: 'Music', about: 'Match', music: 'play' },
	'music.clutch': { source: 'Music', about: 'Late, close match', music: 'clutch' },
	'music.victory': { source: 'Music', about: 'Victory sting', music: 'victory' },
	'music.defeat': { source: 'Music', about: 'Defeat sting', music: 'defeat' },
}

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
