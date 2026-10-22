import { absorbAura } from '../../aura-damage.js'
export default {
	kind: 'channel',
	root: true,
	cooldownFrom: 'end',
	statuses: {
		shield: {
			label: 'Shield',
			tags: ['shield'],
			on: { absorb: absorbAura },
			bar: 'shield',
		},
	},
	cancelOnMove: true,
	cancelOnCast: true,
	effects: { cast: true, pose: 'swig' },
	card: {
		summary: 'Root and drink, gaining shield. Orders, casts and disables interrupt the drink.',
	},
	on: {
		every: 'step',
		do: [
			{
				effect: 'shield',
				amount: 'shieldPerSecond',
				perSecond: true,
				duration: 'shieldLife',
				stack: 'add',
			},
		],
	},
}
