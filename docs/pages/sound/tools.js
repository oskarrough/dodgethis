// The board's tools (rule check, mix, changes, silent facts) and the crowded fight.
import { createSounds, playOwn, playUse } from '/src/plugins/moba/sounds.js'
import { silentByChoice } from '/src/plugins/moba/sound-table.js'
import { tune } from '/src/core/tune.js'
import {
	audio,
	swap,
	uses,
	facts,
	check,
	rows,
	numbers,
	measureAll,
	previewMusic,
	same,
	nameOf,
	emit,
} from './state.js'

const sounds = createSounds(audio)
function el(tag, props = {}, ...children) {
	const node = Object.assign(document.createElement(tag), props)
	node.append(...children)
	return node
}
const button = (text, onClick, props = {}) => {
	const b = el('button', { type: 'button', textContent: text, ...props })
	b.addEventListener('click', onClick)
	return b
}
const busName = {
	ui: 'menus',
	mine: 'your hero',
	others: 'other heroes',
	world: 'world',
	music: 'music',
}

// Board tools, drawn on the stage in place of the map.
export function tool(name) {
	if (name === 'Rules') {
		const flags = Object.entries(check(rows()))
		return [
			el('p', {
				textContent:
					'Sounds breaking docs/sound.md: the peak lands within 25 ms, fight tails end within 400 ms, menus stay under −18 dB, and each fight source keeps one timbre family (brightness within 1.5 octaves of its middle).',
			}),
			el(
				'ul',
				{},
				...(flags.length
					? flags.map(([id, list]) =>
							el(
								'li',
								{},
								el('a', { href: `#u=${id}&t=Rules` }, el('code', { textContent: id })),
								` ${list.join('; ')}`,
							),
						)
					: [el('li', { textContent: numbers.size ? 'Every sound passes.' : 'Measuring…' })]),
			),
		]
	}
	if (name === 'Mix') return mixTool()
	if (name === 'Changes') return changesTool()
	const waiting = Object.entries(facts)
		.filter(([type, list]) => !list.length && !silentByChoice[type])
		.map(([type]) => type)
	return [
		el('p', { textContent: 'Things the game says happened that make no sound yet.' }),
		el(
			'ul',
			{},
			...(waiting.length
				? waiting.map((type) => el('li', {}, el('code', { textContent: type })))
				: [el('li', { textContent: 'None: every fact has a sound or a reason.' })]),
		),
		el('h3', { textContent: 'Silent on purpose' }),
		el(
			'ul',
			{},
			...Object.entries(silentByChoice).map(([type, why]) =>
				el('li', {}, el('code', { textContent: type }), ` ${why}`),
			),
		),
	]
}

// The mix (tune.mix). Moving a level plays a sound on that bus (throttled while dragging); caps and the duck play
// the crowded fight, the duck over music.
const MIX = [
	...['ui', 'mine', 'others', 'world', 'music'].map((name) => [
		name,
		`${busName[name]} level`,
		0,
		1.5,
		0.05,
	]),
	...['ui', 'mine', 'others', 'world'].map((name) => [
		`caps.${name}`,
		`${busName[name]} cap`,
		1,
		16,
		1,
	]),
	['capWindow', 'cap window (s)', 0.05, 0.5, 0.05],
	['duck', 'music under a fight', 0, 1, 0.05],
	['duckRelease', 'music comes back over (s)', 0.1, 2, 0.1],
]
const SAMPLE = {
	ui: () => playUse(audio, 'ui.click'),
	mine: () => playOwn(audio, 'basic.shot'),
	others: () => playUse(audio, 'loose.hit', { x: 4, y: 1, z: 0 }, 0.45),
	world: () => playUse(audio, 'ballBounce', { x: -3, y: 1, z: 2 }),
	music: () => previewMusic('play', 4),
}
const mixValue = (key) => {
	const [head, tail] = key.split('.')
	const mine = swap.mixOf()
	return tail ? (mine.caps?.[tail] ?? tune.mix.caps[tail]) : (mine[head] ?? tune.mix[head])
}
async function setMixValue(key, value) {
	const [head, tail] = key.split('.')
	const mine = swap.mixOf()
	await swap.setMix(
		tail
			? { ...mine, caps: { ...tune.mix.caps, ...mine.caps, [tail]: value } }
			: { ...mine, [head]: value },
	)
}
function mixTool() {
	const body = MIX.map(([key, label, min, max, step]) => {
		const input = el('input', {
			type: 'range',
			min,
			max,
			step,
			value: mixValue(key),
			ariaLabel: label,
		})
		const shown = el('output', { textContent: mixValue(key) })
		const hear = async () => {
			await setMixValue(key, Number(input.value))
			if (SAMPLE[key]) SAMPLE[key]()
			else {
				if (key.startsWith('duck')) previewMusic('play', 4)
				fight()
			}
		}
		let last = 0
		input.addEventListener('input', () => {
			shown.textContent = input.value
			if (!SAMPLE[key] || performance.now() - last < 250) return
			last = performance.now()
			hear()
		})
		input.addEventListener('change', hear)
		return el('tr', {}, el('th', { textContent: label }), el('td', {}, input), el('td', {}, shown))
	})
	return [
		el('p', {
			textContent:
				'Every sound plays on one bus. Each has a level and plays at most its cap of sounds in any cap window; fight sounds duck the music. Moving a slider plays a sound on that bus; the game in another tab follows at once.',
		}),
		el('table', {}, el('tbody', {}, ...body)),
		el(
			'p',
			{},
			button('Reset the mix', async () => {
				await swap.setMix(null)
				emit('redraw-tool')
			}),
		),
	]
}

const describeSwap = (s) =>
	s.shuffle
		? `shuffle of ${s.shuffle.map(describeSwap).join(' + ')}`
		: s.builtin
			? 'built in'
			: s.voice
				? s.voice
				: `${nameOf(s)} at ${s.gain ?? 0.5}`
function changesTool() {
	const mixed = MIX.map(([key]) => key).filter((key) => {
		const [head, tail] = key.split('.')
		return mixValue(key) !== (tail ? tune.mix.caps[tail] : tune.mix[head])
	})
	const lines = [
		...mixed.map((key) => `tune.mix.${key} → ${mixValue(key)} (this browser only)`),
		...Object.entries(swap.kept).map(
			([id, s]) => `${id} → kept ${describeSwap(s)} (in the repo, waiting for a commit)`,
		),
		...swap
			.swapList()
			.filter(([id, s]) => !same(s, swap.kept[id]) && !(s.builtin && !swap.kept[id]))
			.map(([id, s]) => `${id} → ${describeSwap(s)} (this browser only)`),
	]
	return [
		el('p', { textContent: 'Your swaps, to paste back to the sound thread.' }),
		el('pre', {
			textContent: lines.length ? lines.join('\n') : 'No swaps: the game plays its own sounds.',
		}),
		el(
			'p',
			{},
			button('Undo every swap', async () => {
				for (const [id] of swap.swapList()) await swap.setSwap(id, null)
				measureAll()
			}),
		),
	]
}

// The crowded fight: a fixed, seeded burst through the game's mix (spatial pan and falloff, caps, once-per-tick
// dedupe), a third of it yours.
const FIGHT = [
	'loose.shot',
	'loose.hit',
	'toss.shot',
	'toss.hit',
	'gloveSlap.impact',
	'basic.shot',
	'basic.hit',
	'melee.hit',
	'ranged.shot',
	'ranged.hit',
	'wizard.shot',
	'tower.shot',
	'tower.hit',
	'blocked',
	'shielded',
	'out',
	'death',
	'ballBounce',
	'rain.impact',
	'vault.cast',
	'nearMiss.passed',
	'xp',
]
// fight(id) plays that sound three times as yours over the crowd, to hear whether it cuts through.
export function fight(id) {
	if (id)
		for (const tick of [10, 45, 80])
			setTimeout(() => sounds.playOwn(id, { x: 0, y: 1, z: 0 }, 1, 1), (tick * 1000) / 60)
	let seed = 7
	const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
	audio.setAudioListener({ x: 0, z: 0 })
	const sounded = new Map()
	for (let i = 0; i < 20; i++) {
		const id = FIGHT[Math.floor(random() * FIGHT.length)]
		if (!uses[id]) continue
		const tick = Math.floor(random() * 90) // 1.5 s at 60 ticks a second
		const own = random() < 0.3
		const point = own
			? { x: 0, y: 1, z: 0 }
			: { x: (random() - 0.5) * 24, y: 1, z: (random() - 0.5) * 16 }
		const gain = own ? 1 : 0.45
		setTimeout(
			() => {
				const voice = sounds.voiceOf(id)
				if (sounded.get(voice) === tick) return
				sounded.set(voice, tick)
				;(own ? sounds.playOwn : sounds.play)(id, point, gain, 1)
			},
			(tick * 1000) / 60,
		)
	}
}
